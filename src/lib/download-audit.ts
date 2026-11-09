import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { sichaAccessEnd } from "@/lib/sicha-access-calc";

/**
 * בדיקת הרשאות הורדה (קריאה בלבד): לכל שורת downloads בודקת – נכון לרגע ההורדה – שהייתה למורה זכות להוריד:
 * חינם / רכישה בודדת / קובץ מורחב / מנוי בתחום ובמכסה / גישה בזכות שיחה. מנהלות מדולגות.
 * הכללים משקפים את checkEntitlement (data.ts) אך מחושבים מחדש מהנתונים, כך שהם בודקים גם את הקוד עצמו.
 *
 * מגבלות: אין היסטוריית שינוי של הגדרת "חינם" לחומר (נבדק לפי ההגדרה הנוכחית), ואין תאריך ביטול/החזר לרכישה
 * (רכישה שבוטלה/הוחזרה אחרי ההורדה מסומנת כאזהרה).
 */

/** מראות קטגוריות (העתק של CATEGORY_MIRRORS ב-data.ts; פונקציית ה-DB שלו תלויה במטמון ולכן מחושב כאן מחדש) */
import { CATEGORY_MIRRORS } from "@/lib/data";

const SUBS = new Set(["subject_monthly", "custom_monthly", "yearly", "substitute_3m", "substitute_daily"]);

type CatRow = { id: number; parent_id: number | null; slug: string; title: string };
type MatRow = { id: number; category_id: number; title: string; access: string; status: string; allow_download: boolean };
type UserRow = { id: number; email: string; name: string; role: string; suspended: boolean };
type PurRow = {
  id: number; user_id: number; plan: string; material_id: number | null; category_id: number | null;
  downloads_limit: number | null; subjects_pending: boolean; starts_at: string | Date; ends_at: string | Date | null; status: string;
};
type SichRow = { teacher_id: number; category_id: number; created_at: string | Date };
type DlRow = { id: number; user_id: number; material_id: number; via: string | null; purchase_id: number | null; created_at: string | Date };

export type AuditFinding = {
  downloadId: number;
  userId: number;
  userLabel: string;
  materialId: number;
  materialTitle: string;
  via: string;
  at: string; // ISO
  reason: string;
  detail: string;
};

export type AuditResult = {
  ranAt: string;
  from: string | null;
  to: string | null;
  /** כל השורות שנבדקו (בטווח התאריכים) */
  checked: number;
  skippedAdmin: number;
  /** ספירה לפי via (כולל "view:" לצפייה מלאה) – רק שורות שנבדקו */
  byVia: { via: string; n: number }[];
  violations: AuditFinding[];
  warnings: AuditFinding[];
  firstAt: string | null;
  lastAt: string | null;
};

const rowsOf = <T,>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];

export async function runDownloadAudit(opts: { from?: Date | null; to?: Date | null } = {}): Promise<AuditResult> {
  const [cats, mats, users, purs, sichs, dls] = await Promise.all([
    db.execute(sql`select id, parent_id, slug, title from categories`).then((r) => rowsOf<CatRow>(r)),
    db.execute(sql`select id, category_id, title, access, status, allow_download from materials`).then((r) => rowsOf<MatRow>(r)),
    db.execute(sql`select id, email, name, role, suspended from users`).then((r) => rowsOf<UserRow>(r)),
    db
      .execute(
        sql`select id, user_id, plan, material_id, category_id, downloads_limit, subjects_pending, starts_at, ends_at, status from purchases`,
      )
      .then((r) => rowsOf<PurRow>(r)),
    db.execute(sql`select teacher_id, category_id, created_at from sichot where status = 'active'`).then((r) => rowsOf<SichRow>(r)),
    db
      .execute(sql`select id, user_id, material_id, via, purchase_id, created_at from downloads order by created_at, id`)
      .then((r) => rowsOf<DlRow>(r)),
  ]);

  const byId = new Map<number, CatRow>(cats.map((c) => [Number(c.id), c]));
  const chainOf = (id: number) => {
    const out: CatRow[] = [];
    let cur = byId.get(id);
    for (let i = 0; cur && i < 20; i++) {
      out.unshift(cur);
      cur = cur.parent_id != null ? byId.get(Number(cur.parent_id)) : undefined;
    }
    return out;
  };
  const pathOf = (id: number) => chainOf(id).map((c) => c.slug).join("/");
  const idByPath = new Map<string, number>(cats.map((c) => [pathOf(Number(c.id)), Number(c.id)]));
  const mirrorTo = new Map<number, number>(); // תיקייה משקפת → מקור
  for (const c of cats) {
    const p = pathOf(Number(c.id));
    for (const [from, to] of CATEGORY_MIRRORS) {
      if (p !== from && !p.startsWith(from + "/")) continue;
      const src = idByPath.get(to + p.slice(from.length));
      if (src !== undefined) mirrorTo.set(Number(c.id), src);
    }
  }
  const aliasesOf = new Map<number, number[]>();
  for (const [a, s] of mirrorTo) aliasesOf.set(s, [...(aliasesOf.get(s) ?? []), a]);
  const scopeIds = (catId: number) => {
    const ids = new Set(chainOf(catId).map((c) => Number(c.id)));
    for (const id of [...ids]) {
      const rel = [mirrorTo.get(id), ...(aliasesOf.get(id) ?? [])].filter((x): x is number => x !== undefined);
      for (const r of rel) for (const c of chainOf(r)) ids.add(Number(c.id));
    }
    return ids;
  };

  const matById = new Map<number, MatRow>(mats.map((m) => [Number(m.id), m]));
  const userById = new Map<number, UserRow>(users.map((u) => [Number(u.id), u]));
  const purByUser = new Map<number, PurRow[]>();
  for (const p of purs) purByUser.set(Number(p.user_id), [...(purByUser.get(Number(p.user_id)) ?? []), p]);
  const sichByUser = new Map<number, SichRow[]>();
  for (const s of sichs) sichByUser.set(Number(s.teacher_id), [...(sichByUser.get(Number(s.teacher_id)) ?? []), s]);

  const from = opts.from ?? null;
  const to = opts.to ?? null;
  const violations: AuditFinding[] = [];
  const warnings: AuditFinding[] = [];
  const viaCount = new Map<string, number>();
  const usedByPurchase = new Map<number, number>();
  let checked = 0;
  let skippedAdmin = 0;
  let firstAt: string | null = null;
  let lastAt: string | null = null;

  for (const d of dls) {
    const u = userById.get(Number(d.user_id));
    const m = matById.get(Number(d.material_id));
    const t = new Date(d.created_at);
    const inRange = (!from || t >= from) && (!to || t <= to);
    if (!u || !m) continue;
    const rawVia = d.via ?? "";
    const isView = rawVia.startsWith("view:");
    const via = isView ? rawVia.slice(5) : rawVia;
    const isAdmin = u.role === "admin";
    // מכסת מנוי נספרת תמיד על כל ההיסטוריה (גם מחוץ לטווח), אחרת בדיקת חריגה מהמכסה תטעה
    const mine = purByUser.get(Number(u.id)) ?? [];
    const scope = scopeIds(Number(m.category_id));

    if (inRange) {
      if (isAdmin) skippedAdmin++;
      else {
        checked++;
        firstAt = firstAt ?? t.toISOString();
        lastAt = t.toISOString();
        const k = `${isView ? "צפייה" : "הורדה"} · ${via || "(ללא)"}`;
        viaCount.set(k, (viaCount.get(k) ?? 0) + 1);
      }
    }
    if (isAdmin) continue;

    const flag = (reason: string, detail: string, list: AuditFinding[]) => {
      if (!inRange) return;
      list.push({
        downloadId: Number(d.id),
        userId: Number(u.id),
        userLabel: `${u.name} (${u.email})`,
        materialId: Number(m.id),
        materialTitle: m.title,
        via: rawVia,
        at: t.toISOString(),
        reason,
        detail,
      });
    };

    if (u.suspended) flag("המשתמשת מושהית כעת", "", warnings);

    const inTime = (p: PurRow) =>
      new Date(p.starts_at) <= new Date(t.getTime() + 60_000) && (p.ends_at == null || new Date(p.ends_at) >= t);
    const statusOk = (p: PurRow) => p.status === "active" || p.status === "expired";
    const basis: string[] = [];
    if (m.access === "free") basis.push("חינם");
    for (const p of mine) {
      if (!inTime(p)) continue;
      const tag = statusOk(p) ? "" : `[${p.status}]`;
      if (p.plan === "single" && p.material_id === m.id) basis.push(`single#${p.id}${tag}`);
      else if (p.plan === "bundle" && p.category_id != null && scope.has(Number(p.category_id))) basis.push(`bundle#${p.id}${tag}`);
      else if (SUBS.has(p.plan) && !p.subjects_pending && (p.category_id == null || scope.has(Number(p.category_id))))
        basis.push(`sub#${p.id}(${p.plan})${tag}`);
    }
    const subj = chainOf(Number(m.category_id))[0];
    const mySich = (sichByUser.get(Number(u.id)) ?? []).filter(
      (s) => subj && chainOf(Number(s.category_id))[0]?.id === subj.id && new Date(s.created_at) <= t,
    );
    const sEnd = sichaAccessEnd(mySich.map((s) => new Date(s.created_at)));
    if (sEnd && sEnd >= t) basis.push("שיחה");

    let ok = false;
    let reason = "";
    if (via === "free") {
      ok = m.access === "free";
      if (!ok) reason = `נרשם "חינם" אך החומר מוגדר כעת "${m.access}"`;
    } else if (via === "subscription") {
      const p = mine.find((x) => Number(x.id) === Number(d.purchase_id));
      if (!p) {
        reason = `המנוי שנרשם (purchase_id=${d.purchase_id ?? "ריק"}) לא שייך למשתמשת / לא קיים`;
      } else {
        const used = (usedByPurchase.get(Number(p.id)) ?? 0) + 1;
        usedByPurchase.set(Number(p.id), used);
        const inScope = p.category_id == null || scope.has(Number(p.category_id));
        if (!SUBS.has(p.plan)) reason = `הרכישה #${p.id} היא ${p.plan} ולא מנוי`;
        else if (p.subjects_pending) reason = `במנוי #${p.id} עוד לא נבחרו מקצועות`;
        else if (!inScope) reason = `החומר מחוץ לתחום המנוי #${p.id}`;
        else if (!inTime(p)) reason = `מחוץ לתאריכי המנוי #${p.id}`;
        else if (p.downloads_limit != null && used > p.downloads_limit) reason = `חריגה ממכסת המנוי #${p.id}: ${used}/${p.downloads_limit}`;
        else if (!statusOk(p)) {
          flag(`סטטוס המנוי #${p.id} כעת "${p.status}"`, "ייתכן שבוטל/הוחזר אחרי ההורדה", warnings);
          ok = true;
        } else ok = true;
      }
    } else if (via === "single" || via === "bundle") {
      ok = basis.some((b) => b.startsWith(via) && !b.includes("["));
      if (!ok) {
        const soft = basis.find((b) => b.startsWith(via));
        if (soft) {
          flag(`הרכישה (${soft}) בוטלה/הוחזרה מאז`, "", warnings);
          ok = true;
        } else reason = `לא נמצאה רכישה (${via === "single" ? "בודדת" : "קובץ מורחב"}) שמכסה את החומר ברגע ההורדה`;
      }
    } else if (via === "sicha") {
      ok = !!sEnd && sEnd >= t;
      if (!ok) reason = "אין גישה בזכות שיחה ברגע ההורדה (ייתכן שהשיחה נמחקה מאז)";
    } else if (via === "admin") {
      reason = "נרשם כמנהלת אך המשתמשת אינה מנהלת";
    } else {
      reason = `ערך via לא מוכר: "${rawVia}"`;
    }
    if (!ok && reason) {
      const other = basis.filter((b) => !b.includes("["));
      if (other.length) flag(reason, `אבל הייתה בסיס זכאות אחר: ${other.join(", ")} – כנראה חוסר תיעוד ולא הורדה לא מורשית`, warnings);
      else flag(reason, `בסיסי זכאות שנמצאו: ${basis.join(", ") || "אין"}`, violations);
    }
    if (m.allow_download === false && !isView) flag("החומר מוגדר כעת לצפייה בלבד", "", warnings);
    if (m.status !== "active") flag(`סטטוס החומר כעת "${m.status}"`, "", warnings);
  }

  return {
    ranAt: new Date().toISOString(),
    from: from ? from.toISOString() : null,
    to: to ? to.toISOString() : null,
    checked,
    skippedAdmin,
    byVia: [...viaCount].map(([via, n]) => ({ via, n })).sort((a, b) => a.via.localeCompare(b.via)),
    violations,
    warnings,
    firstAt,
    lastAt,
  };
}
