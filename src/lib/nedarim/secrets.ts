import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSecrets, users } from "@/db/schema";
import { sessionSecretString } from "@/lib/session";
import { decryptSecret, deriveSecretsKey, encryptSecret, last4Of, redactSecretValues } from "./secret-crypto";

/**
 * סודות נדרים פלוס שהמנהלת יכולה להחליף מהאתר (/admin/payments) בלי פריסה מחדש: מפתח ה-API (npk_) וסוד ה-CallBack
 * (אופציונלי). סדר קריאה: app_secrets (מוצפן) ← env.
 * הערך הגולמי לעולם לא מוחזר ללקוח – רק "מוגדר/לא", מקור, 4 תווים אחרונים, מתי ועל ידי מי. docs/nedarim-payments.md
 */
export const SECRET_DEFS = {
  nedarim_api_password: {
    label: "מפתח API של נדרים פלוס (npk_…)",
    env: "NEDARIM_API_PASSWORD",
    pattern: /^npk_[A-Za-z0-9]{20,80}$/,
    hint: "מתחיל ב-npk_ ואחריו 20–80 אותיות/ספרות (reports.matara.pro > הגדרות > API)",
  },
  nedarim_callback_secret: {
    label: "סוד ה-CallBack (אופציונלי)",
    env: "NEDARIM_CALLBACK_SECRET",
    pattern: /^[A-Za-z0-9_-]{32,128}$/,
    hint: "32–128 אותיות/ספרות/מקף/קו תחתון (למשל openssl rand -hex 24). שינוי = לעדכן גם את הכתובת בפורטל נדרים",
  },
} as const;
export type SecretName = keyof typeof SECRET_DEFS;
export const SECRET_NAMES = Object.keys(SECRET_DEFS) as SecretName[];
export const isSecretName = (s: unknown): s is SecretName => typeof s === "string" && s in SECRET_DEFS;

export type SecretSource = "db" | "env" | null;

/** ערכים שנקראו בבקשה הזו – כדי ש-redactNedarim (סינכרוני) יכיר גם סודות מה-DB, לא רק מה-env */
const seen = new Set<string>();

function masterKey(): Buffer {
  const master = (process.env.NEDARIM_SECRETS_KEY ?? "").trim() || sessionSecretString();
  return deriveSecretsKey(master);
}

const envValue = (name: SecretName) => (process.env[SECRET_DEFS[name].env] ?? "").trim() || null;

/** קריאה (cached לבקשה): DB מוצפן ← env. כשל DB (למשל הטבלה עוד לא נוצרה) = נופלים ל-env, לא זורקים. */
export const readSecret = cache(async (name: SecretName): Promise<{ value: string | null; source: SecretSource }> => {
  try {
    const [row] = await db.select().from(appSecrets).where(eq(appSecrets.name, name)).limit(1);
    if (row) {
      const value = decryptSecret(masterKey(), name, row.ciphertext);
      seen.add(value);
      return { value, source: "db" };
    }
  } catch (e) {
    console.error("[secrets] read failed, falling back to env:", name, e instanceof Error ? e.message : "error");
  }
  const v = envValue(name);
  if (v) seen.add(v);
  return { value: v, source: v ? "env" : null };
});

export const getNedarimApiPassword = async () => (await readSecret("nedarim_api_password")).value;
export const getNedarimCallbackSecret = async () => (await readSecret("nedarim_callback_secret")).value;

export type SecretStatus = {
  name: SecretName;
  label: string;
  hint: string;
  configured: boolean;
  source: SecretSource;
  /** 4 תווים אחרונים (רק כשהמקור הוא DB; מה-env לא מציגים כלום) */
  last4: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
  /** יש גם ערך ב-env שה-DB דורס (מידע למנהלת) */
  envAlsoSet: boolean;
  /** יש שורה ב-DB אבל אי אפשר לפענח אותה (מפתח ההצפנה הראשי הוחלף) – להזין מחדש */
  undecryptable: boolean;
};

export async function getSecretStatus(name: SecretName): Promise<SecretStatus> {
  const def = SECRET_DEFS[name];
  let row: { ciphertext: string; last4: string | null; updatedAt: Date; updatedBy: string | null } | null = null;
  try {
    const [r] = await db
      .select({ ciphertext: appSecrets.ciphertext, last4: appSecrets.last4, updatedAt: appSecrets.updatedAt, updatedBy: users.name })
      .from(appSecrets)
      .leftJoin(users, eq(users.id, appSecrets.updatedById))
      .where(eq(appSecrets.name, name))
      .limit(1);
    row = r ?? null;
  } catch {
    /* טבלה חסרה – מוצג כ-env בלבד */
  }
  // L5: "מוגדר" רק אם באמת ניתן לפענח (הערך עצמו לא יוצא מכאן)
  let decryptable = false;
  if (row) {
    try {
      decryptSecret(masterKey(), name, row.ciphertext);
      decryptable = true;
    } catch {
      decryptable = false;
    }
  }
  const env = !!envValue(name);
  const usable = !!row && decryptable;
  return {
    name,
    label: def.label,
    hint: def.hint,
    configured: usable || env,
    source: usable ? "db" : env ? "env" : null,
    last4: usable ? row!.last4 : null,
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
    envAlsoSet: usable && env,
    undecryptable: !!row && !decryptable,
  };
}

/** דריסה (upsert) של הסוד – הערך מוצפן כאן ולא נשמר/נרשם בשום מקום אחר. הקורא אחראי לאימות הפורמט ולאודיט. */
export async function setSecret(name: SecretName, value: string, adminId: number): Promise<void> {
  const ciphertext = encryptSecret(masterKey(), name, value);
  const now = new Date();
  await db
    .insert(appSecrets)
    .values({ name, ciphertext, keyVersion: 1, last4: last4Of(value), updatedAt: now, updatedById: adminId })
    .onConflictDoUpdate({
      target: appSecrets.name,
      set: { ciphertext, keyVersion: 1, last4: last4Of(value), updatedAt: now, updatedById: adminId },
    });
}

export async function deleteSecret(name: SecretName): Promise<boolean> {
  const r = await db.delete(appSecrets).where(eq(appSecrets.name, name)).returning({ name: appSecrets.name });
  return r.length > 0;
}

/**
 * הסתרת סודות נדרים בכל מחרוזת שהולכת ללוג / DB / יומן / מסך / מייל: npk_…, key=…, וכל ערך סוד ידוע
 * (env + מה שנקרא מה-DB בבקשה הזו). סינכרוני – אפשר להשתמש בו בכל מקום.
 */
export function redactNedarim(text: string): string {
  const known = [
    ...seen,
    ...SECRET_NAMES.map(envValue),
    (process.env.NEDARIM_SECRETS_KEY ?? "").trim(),
    (process.env.SESSION_SECRET ?? "").trim(),
  ];
  return redactSecretValues(text, known);
}
