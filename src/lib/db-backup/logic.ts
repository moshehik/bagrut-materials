/**
 * גיבוי מסד הנתונים (Neon) — לוגיקה טהורה (בלי רשת / DB), כדי שאפשר לבדוק אותה.
 * ר' docs/db-backup.md. בדיקות: npx tsx --test scripts/db-backup-logic.test.ts
 */

export const BACKUP_FOLDER_NAME = "גיבוי מסד נתונים (Neon) — לא למחוק";
export const BACKUP_FILE_PREFIX = "bagrut-db-";
export const BACKUP_FILE_SUFFIX = ".json.gz";
/** גודל דף בקריאת טבלה (שורות). תשובת Neon HTTP מוגבלת ל-64MB, לכן גם טבלה גדולה נקראת בחלקים */
export const PAGE_ROWS = 10_000;
/** מגבלות שימור: 14 גיבויים יומיים אחרונים + גיבוי אחד לכל שבוע ISO ב-8 השבועות שלפניהם */
export const KEEP_DAILY = 14;
export const KEEP_WEEKLY = 8;
/** גיבוי נחשב "מעודכן" אם הצליח בטווח הזה — כרון שרץ כל 6 שעות מדלג כשיש גיבוי מעודכן */
export const FRESH_HOURS = 20;
/** התראת מייל רק אחרי כמה כשלונות רצופים, ולא יותר מפעם אחת בטווח הזה */
export const ALERT_AFTER_FAILURES = 2;
export const ALERT_MIN_GAP_HOURS = 12;

export type BackupState = {
  lastOkAt: string | null;
  lastOkName: string | null;
  lastOkFileId: string | null;
  lastOkBytes: number | null;
  lastOkRows: number | null;
  lastOkTables: number | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastAlertAt: string | null;
};

export const EMPTY_STATE: BackupState = {
  lastOkAt: null,
  lastOkName: null,
  lastOkFileId: null,
  lastOkBytes: null,
  lastOkRows: null,
  lastOkTables: null,
  lastAttemptAt: null,
  lastError: null,
  consecutiveFailures: 0,
  lastAlertAt: null,
};

export function parseState(raw: string | null | undefined): BackupState {
  if (!raw) return { ...EMPTY_STATE };
  try {
    const j = JSON.parse(raw) as Partial<BackupState>;
    return { ...EMPTY_STATE, ...j };
  } catch {
    return { ...EMPTY_STATE };
  }
}

/** שם קובץ הגיבוי לפי רגע UTC: bagrut-db-2026-11-09-0100.json.gz */
export function backupFileName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${BACKUP_FILE_PREFIX}${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${BACKUP_FILE_SUFFIX}`;
}

/** מחלץ את רגע הגיבוי (UTC) משם קובץ; null אם השם אינו של גיבוי */
export function parseBackupName(name: string): Date | null {
  const m = /^bagrut-db-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.json\.gz$/.exec(name);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** מפתח שבוע ISO ("2026-W46") לרגע נתון (UTC) */
export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * אילו גיבויים לשמור. קלט: שמות הקבצים בתיקייה (קבצים שאינם גיבוי — לא נוגעים בהם, לא מוחקים).
 * 1) לכל יום קלנדרי נשאר הגיבוי האחרון שלו; 14 הימים האחרונים (עם גיבוי) נשמרים.
 * 2) מעבר לכך: גיבוי אחד (האחרון) לכל שבוע ISO, עד 8 שבועות.
 * מחזיר { keep, remove } כשמות; גיבוי חדש ביותר תמיד נשמר.
 */
export function selectRetention(names: string[]): { keep: string[]; remove: string[] } {
  const items = names
    .map((name) => ({ name, at: parseBackupName(name) }))
    .filter((x): x is { name: string; at: Date } => x.at !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  const keep = new Set<string>();
  const remove: string[] = [];
  // הגיבוי האחרון בכל יום
  const lastOfDay = new Map<string, { name: string; at: Date }>();
  for (const it of items) if (!lastOfDay.has(dayKey(it.at))) lastOfDay.set(dayKey(it.at), it);
  const days = [...lastOfDay.values()]; // כבר ממוינים מהחדש לישן
  const daily = days.slice(0, KEEP_DAILY);
  for (const d of daily) keep.add(d.name);
  const olderDays = days.slice(KEEP_DAILY);
  const weeks = new Map<string, string>();
  for (const d of olderDays) {
    const k = isoWeekKey(d.at);
    if (!weeks.has(k) && weeks.size < KEEP_WEEKLY) weeks.set(k, d.name);
  }
  for (const n of weeks.values()) keep.add(n);
  for (const it of items) if (!keep.has(it.name)) remove.push(it.name);
  return { keep: [...keep], remove };
}

/** האם צריך להריץ גיבוי עכשיו (הכרון רץ כל 6 שעות; בפועל גיבוי אחד ביום, וניסיון חוזר אם נכשל) */
export function isBackupDue(state: BackupState, now: Date, force = false): boolean {
  if (force) return true;
  if (!state.lastOkAt) return true;
  const ageH = (now.getTime() - new Date(state.lastOkAt).getTime()) / 3_600_000;
  return !(ageH < FRESH_HOURS);
}

/** האם לשלוח התראת מייל אחרי כשל (מונה כשלונות כבר כולל הכשל הנוכחי) */
export function shouldAlert(state: BackupState, now: Date): boolean {
  if (state.consecutiveFailures < ALERT_AFTER_FAILURES) return false;
  if (!state.lastAlertAt) return true;
  return now.getTime() - new Date(state.lastAlertAt).getTime() >= ALERT_MIN_GAP_HOURS * 3_600_000;
}

export type FkEdge = { table: string; refTable: string };

/** מיון טופולוגי של טבלאות: הורים לפני ילדים (לשחזור). טבלאות במעגל / הפניה עצמית — בסוף לפי סדר א"ב, ומדווחות */
export function sortTablesByFk(tables: string[], edges: FkEdge[]): { order: string[]; cyclic: string[] } {
  const set = new Set(tables);
  const deps = new Map<string, Set<string>>();
  for (const t of tables) deps.set(t, new Set());
  for (const e of edges) {
    if (e.table === e.refTable) continue; // הפניה עצמית — לא מונעת סדר (שורות בתוך הטבלה נטענות לפי סדר ה-PK)
    if (set.has(e.table) && set.has(e.refTable)) deps.get(e.table)!.add(e.refTable);
  }
  const order: string[] = [];
  const done = new Set<string>();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const t of [...tables].sort()) {
      if (done.has(t)) continue;
      if ([...deps.get(t)!].every((d) => done.has(d))) {
        order.push(t);
        done.add(t);
        progressed = true;
      }
    }
  }
  const cyclic = [...tables].sort().filter((t) => !done.has(t));
  return { order: [...order, ...cyclic], cyclic };
}

/** מזהה בטוח לשם טבלה/עמודה ב-SQL (שמות מגיעים מ-information_schema, בכל זאת מצטטים) */
export function quoteIdent(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}
