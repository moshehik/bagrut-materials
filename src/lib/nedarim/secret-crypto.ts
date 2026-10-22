/**
 * הצפנת סודות אפליקציה (app_secrets) – לוגיקה טהורה מעל node:crypto, בלי DB, כדי שאפשר לבדוק אותה ביחידה
 * (scripts/nedarim-tests/secret-crypto.test.ts). השימוש: src/lib/nedarim/secrets.ts.
 *
 * AES-256-GCM: מפתח 32 בתים נגזר ב-HKDF-SHA256 מהסוד הראשי (NEDARIM_SECRETS_KEY, ואם אין – SESSION_SECRET) עם תווית
 * domain-separation ייחודית (לא אותו מפתח כמו חתימת הסשן). IV אקראי (12 בתים) לכל כתיבה, AAD = שם הסוד (ciphertext של סוד
 * אחד לא ניתן "להעביר" לשם אחר). הפורמט: base64( version(1) ‖ iv(12) ‖ tag(16) ‖ data ).
 * redactSecretValues – מסתיר כל npk_… ו-ערכי סודות ידועים בכל מחרוזת שהולכת ללוג / DB / מסך.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, timingSafeEqual, createHash } from "node:crypto";

export const SECRET_FORMAT_VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;
const HKDF_INFO = "luz-haninyan:app-secrets:aes-256-gcm:v1";
const HKDF_SALT = "app_secrets";

/** מפתח ההצפנה (32 בתים) מהסוד הראשי. זורק אם הסוד קצר מדי – לא מצפינים עם מפתח חלש. */
export function deriveSecretsKey(masterSecret: string): Buffer {
  if (typeof masterSecret !== "string" || masterSecret.length < 32) {
    throw new Error("מפתח ההצפנה הראשי (NEDARIM_SECRETS_KEY / SESSION_SECRET) חסר או קצר מ-32 תווים");
  }
  return Buffer.from(hkdfSync("sha256", masterSecret, HKDF_SALT, HKDF_INFO, 32));
}

export function encryptSecret(key: Buffer, name: string, plaintext: string): string {
  if (key.length !== 32) throw new Error("bad key length");
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(name, "utf8"));
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([SECRET_FORMAT_VERSION]), iv, tag, data]).toString("base64");
}

/** מפענח; זורק על tag/AAD/מפתח לא נכונים (GCM) או פורמט לא מוכר. */
export function decryptSecret(key: Buffer, name: string, blob: string): string {
  const buf = Buffer.from(blob, "base64");
  if (buf.length < 1 + IV_LEN + TAG_LEN || buf[0] !== SECRET_FORMAT_VERSION) throw new Error("פורמט סוד לא מוכר");
  const iv = buf.subarray(1, 1 + IV_LEN);
  const tag = buf.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
  const data = buf.subarray(1 + IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(name, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** השוואת סודות באורך קבוע: משווים SHA-256 של שני הצדדים (אורך זהה תמיד – אין דליפת אורך) */
export function secretsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** 4 תווים אחרונים לתצוגה ("מסתיים ב-…"); ריק לסוד קצר */
export function last4Of(value: string): string | null {
  return value.length >= 12 ? value.slice(-4) : null;
}

/**
 * הסתרת סודות במחרוזות שהולכות ללוג / DB / מסך / מייל: כל npk_… (מפתח API של נדרים), וכל ערך מהרשימה (סודות
 * ידועים בזמן ריצה – מפתח ה-API, סוד ה-CallBack, הסוד הראשי). לא משנה מחרוזות שאין בהן סוד.
 */
export function redactSecretValues(text: string, knownSecrets: (string | null | undefined)[] = []): string {
  let out = String(text ?? "");
  for (const s of knownSecrets) {
    if (s && s.length >= 8) out = out.split(s).join("[REDACTED]");
  }
  return out
    .replace(/\bnpk_[A-Za-z0-9]{4,}/g, "npk_[REDACTED]")
    .replace(/([?&](?:key|ApiPassword|apiPassword)=)[^&\s"'<>]+/g, "$1[REDACTED]");
}
