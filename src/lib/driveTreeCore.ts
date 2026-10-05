/**
 * עץ תיקיות הדרייב — משקף בדיוק את עץ הקטגוריות של האתר (תיקייה לכל קטגוריה, קובץ לכל חומר).
 * עובד ישירות מול Drive REST v3 עם הטוקן של הגשר (ר' driveBridgeCore.getAccessToken).
 * הערות מפתח:
 *  - העברה/שינוי שם בדרייב לא משנים את ה-fileId — לכן `materials.fileUrl` (drive://<id>) נשאר תקף.
 *  - "תגית השם הישן": השם המלא נשמר ב-materials.driveOriginalName וב-description של הקובץ בדרייב
 *    (ל-appProperties יש תקרה של 124 בתים לתגית — שמות בעברית חורגים ממנה; שם רק מזהים קצרים).
 *  - כל שינוי נרשם ב-drive_events (מזין את קובץ המידע _מידע.txt וחלון ההיסטוריה בסייר).
 *  - בלי "server-only" בכוונה: הסקריפטים (tsx) מייבאים את הקובץ ישירות; קוד האתר מייבא מ-driveTree.ts.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, materials, driveEvents } from "@/db/schema";
import { getRootFolderId, driveIdFromUrl, driveFetchAuthed } from "@/lib/driveBridgeCore";

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
export const FOLDER_MIME = "application/vnd.google-apps.folder";

export const ARCHIVE_FOLDER_NAME = "_ארכיון";
export const ARCHIVE_SUB = {
  orphans: "יתומים (לא מקושרים לאתר)",
  oldVersions: "גרסאות ישנות",
  unclear: "לא ברור",
} as const;
export type ArchiveKind = keyof typeof ARCHIVE_SUB;
export const INFO_FILE_NAME = "_מידע.txt";

/* ------------------------------ עזרי רשת ------------------------------ */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * קריאה ל-Drive REST עם ניסיונות חוזרים (429/403-rate/5xx) ורענון טוקן ב-401.
 * עטיפה דקה סביב העזר המשותף driveBridgeCore.driveFetchAuthed (אותה לוגיקת אימות/ניסיונות לכל הקוד).
 */
export async function driveApi(url: string, init: RequestInit = {}, tries = 7): Promise<Response> {
  return driveFetchAuthed(url, init, { tries, timeoutMs: 90_000 });
}

async function json<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) throw new Error(`${what} נכשל (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** מריץ fn על כל הפריטים עם הגבלת מקביליות. שגיאה בפריט אחד לא עוצרת את השאר (נאספת). */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<R>,
  onDone?: (done: number, total: number) => void,
): Promise<{ results: (R | undefined)[]; errors: { item: T; error: string }[] }> {
  const results: (R | undefined)[] = new Array(items.length);
  const errors: { item: T; error: string }[] = [];
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        try {
          results[i] = await fn(items[i], i);
        } catch (e) {
          errors.push({ item: items[i], error: e instanceof Error ? e.message : String(e) });
        }
        done++;
        onDone?.(done, items.length);
      }
    }),
  );
  return { results, errors };
}

/* ------------------------------ שמות ------------------------------ */

/** שם בטוח לדרייב: בלי / \ ותווי בקרה, בלי רווחים בקצוות, עד 200 תווים. */
export function sanitizeDriveName(name: string): string {
  return (
    String(name)
      .replace(/[\\/]+/g, "־")
      .replace(/[\u0000-\u001f‎‏‪-‮⁦-⁩]/g, "") // תווי בקרה ו-RTL/LTR מוסתרים (Windows מוסיף אותם לשמות בעברית)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200) || "ללא שם"
  );
}

/** מוסיף " (#id)" לפני הסיומת כשיש התנגשות שם באותה תיקייה. */
export function withIdSuffix(fileName: string, id: number): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot) : "";
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const suffix = ` (#${id})`;
  return `${base.slice(0, Math.max(1, 190 - ext.length - suffix.length))}${suffix}${ext}`;
}

/** נעילה לכל תיקייה — הצבות לאותה תיקייה רצות בתור, כדי שזיהוי התנגשות שם יהיה אמין. */
const folderLocks = new Map<string, Promise<unknown>>();
export async function withFolderLock<T>(folderId: string, fn: () => Promise<T>): Promise<T> {
  const prev = folderLocks.get(folderId) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  folderLocks.set(folderId, run);
  try {
    return await run;
  } finally {
    if (folderLocks.get(folderId) === run) folderLocks.delete(folderId);
  }
}

/** סוגי "חבילת הקבצים הסטנדרטית" של פרק — מזוהים לפי תחילת שם הקובץ (כך נקראים הקבצים בפועל). */
export const CORE_TYPES: { key: string; label: string; test: RegExp }[] = [
  { key: "teacher", label: "דף למורה", test: /^דף למורה/ },
  { key: "student", label: "דף לתלמידה", test: /^דף לתלמיד/ },
  { key: "quiz", label: "בוחן", test: /^בוחן(?! עם תשובות)/ },
  { key: "quizAnswers", label: "בוחן עם תשובות", test: /^בוחן עם תשובות/ },
  { key: "enrichment", label: "דף העשרה", test: /^דף העשרה/ },
  { key: "summary", label: "סיכום להכתבה", test: /^סיכום להכתבה/ },
  { key: "skills", label: "דף מיומנויות וחווית למידה", test: /^דף מיומנויות/ },
];

export function coreTypeOf(fileName: string): string | null {
  const n = fileName.trim();
  for (const t of CORE_TYPES) if (t.test.test(n)) return t.key;
  return null;
}

/* ------------------------------ היסטוריה ------------------------------ */

export type DriveEventInput = {
  kind: string;
  materialId?: number | null;
  categoryId?: number | null;
  driveId?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  details?: unknown;
  actorId?: number | null;
};

/** רושם אירוע בהיסטוריית הדרייב. לעולם לא זורק. */
export async function logDriveEvent(e: DriveEventInput) {
  try {
    await db.insert(driveEvents).values({
      kind: e.kind,
      materialId: e.materialId ?? null,
      categoryId: e.categoryId ?? null,
      driveId: e.driveId ?? null,
      oldValue: e.oldValue ?? null,
      newValue: e.newValue ?? null,
      details: e.details === undefined ? null : typeof e.details === "string" ? e.details : JSON.stringify(e.details),
      actorId: e.actorId ?? null,
    });
  } catch (err) {
    console.error("[driveTree] event log failed", err instanceof Error ? err.message : err);
  }
}

/* ------------------------------ פעולות Drive בסיסיות ------------------------------ */

export type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string | null;
  createdTime: string | null;
  webViewLink: string | null;
  parents: string[];
  description: string | null;
  appProperties: Record<string, string>;
};

const ITEM_FIELDS = "id,name,mimeType,size,modifiedTime,createdTime,webViewLink,parents,description,appProperties,trashed";

function toItem(f: Record<string, unknown>): DriveItem {
  return {
    id: String(f.id),
    name: String(f.name ?? ""),
    mimeType: String(f.mimeType ?? ""),
    size: f.size ? Number(f.size) : null,
    modifiedTime: (f.modifiedTime as string) ?? null,
    createdTime: (f.createdTime as string) ?? null,
    webViewLink: (f.webViewLink as string) ?? null,
    parents: (f.parents as string[]) ?? [],
    description: (f.description as string) ?? null,
    appProperties: (f.appProperties as Record<string, string>) ?? {},
  };
}

export async function driveGet(fileId: string): Promise<DriveItem | null> {
  const res = await driveApi(`${API}/${encodeURIComponent(fileId)}?fields=${ITEM_FIELDS}`);
  if (res.status === 404) return null;
  const f = await json<Record<string, unknown>>(res, "קריאת קובץ");
  if (f.trashed) return null; // קובץ/תיקייה באשפה נחשבים כלא קיימים
  return toItem(f);
}

/** כל הילדים הישירים (לא באשפה) של תיקייה, עם מטא-דאטה מלא. */
export async function driveListFolder(folderId: string): Promise<DriveItem[]> {
  const out: DriveItem[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: `nextPageToken,files(${ITEM_FIELDS})`,
      pageSize: "1000",
      ...(pageToken ? { pageToken } : {}),
    });
    const j = await json<{ files?: Record<string, unknown>[]; nextPageToken?: string }>(
      await driveApi(`${API}?${params}`),
      "רשימת תיקייה",
    );
    for (const f of j.files ?? []) out.push(toItem(f));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}

/** מוצא תיקייה קיימת בשם נתון תחת הורה (כדי לא ליצור כפילות אחרי קריסה / תשובה שאבדה). */
export async function driveFindFolder(name: string, parentId: string): Promise<string | null> {
  const clean = sanitizeDriveName(name);
  return (await driveListFolder(parentId)).find((f) => f.mimeType === FOLDER_MIME && f.name === clean)?.id ?? null;
}

/**
 * יוצר תיקייה (או מחזיר קיימת באותו שם תחת אותו הורה). בלי ניסיון-חוזר אוטומטי של ה-POST:
 * תשובה שאבדה לא תיצור כפילות שקטה — אחרי כשל בודקים אם התיקייה כבר נוצרה.
 */
export async function driveCreateFolder(name: string, parentId: string): Promise<string> {
  const existing = await driveFindFolder(name, parentId);
  if (existing) return existing;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const j = await json<{ id: string }>(
        await driveApi(`${API}?fields=id`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: sanitizeDriveName(name), mimeType: FOLDER_MIME, parents: [parentId] }),
        }, 1),
        "יצירת תיקייה",
      );
      return j.id;
    } catch (e) {
      lastErr = e;
      await sleep(600 * attempt);
      const created = await driveFindFolder(name, parentId).catch(() => null);
      if (created) return created;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function drivePatch(
  fileId: string,
  patch: {
    name?: string;
    description?: string;
    appProperties?: Record<string, string>;
    addParent?: string;
    removeParents?: string[];
  },
): Promise<DriveItem> {
  const params = new URLSearchParams({ fields: ITEM_FIELDS });
  if (patch.addParent) params.set("addParents", patch.addParent);
  if (patch.removeParents?.length) params.set("removeParents", patch.removeParents.join(","));
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = sanitizeDriveName(patch.name);
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.appProperties) body.appProperties = patch.appProperties;
  return toItem(
    await json<Record<string, unknown>>(
      await driveApi(`${API}/${encodeURIComponent(fileId)}?${params}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      "עדכון קובץ",
    ),
  );
}

/** העברה לאשפה של הדרייב (ניתן לשחזור) — לא מחיקה קבועה. */
export async function driveTrash(fileId: string) {
  await json(
    await driveApi(`${API}/${encodeURIComponent(fileId)}?fields=id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    }),
    "העברה לאשפה",
  );
}

/** יוצר או מעדכן במקום קובץ טקסט בתיקייה (לפי שם + תגית appProperties.siteInfo). מחזיר את ה-id. */
export async function driveUpsertTextFile(folderId: string, name: string, text: string): Promise<string> {
  // מחפשים קודם קובץ מתויג; ואם אין (למשל הועלה/נערך ידנית ואיבד את התגית) — כל קובץ טקסט באותו שם, כדי לא ליצור כפילות
  const listing = await driveListFolder(folderId);
  const existing =
    listing.find((f) => f.name === name && f.appProperties.siteInfo === "1") ??
    listing.find((f) => f.name === name && f.mimeType !== FOLDER_MIME);
  const bytes = Buffer.from(text, "utf-8");
  if (existing) {
    await json(
      await driveApi(`${UPLOAD}/${encodeURIComponent(existing.id)}?uploadType=media&fields=id`, {
        method: "PATCH",
        headers: { "Content-Type": "text/plain; charset=UTF-8" },
        body: bytes,
      }),
      "עדכון קובץ מידע",
    );
    if (existing.appProperties.siteInfo !== "1") await drivePatch(existing.id, { appProperties: { siteInfo: "1" } });
    return existing.id;
  }
  const boundary = `info-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name, mimeType: "text/plain", parents: [folderId], appProperties: { siteInfo: "1" } });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n`, "utf-8"),
    bytes,
    Buffer.from(`\r\n--${boundary}--`, "utf-8"),
  ]);
  const j = await json<{ id: string }>(
    await driveApi(`${UPLOAD}?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    }),
    "יצירת קובץ מידע",
  );
  return j.id;
}

/** מוריד קובץ טקסט מהדרייב (למשל _מידע.txt) כמחרוזת. */
export async function driveDownloadText(fileId: string): Promise<string> {
  const res = await driveApi(`${API}/${encodeURIComponent(fileId)}?alt=media`);
  if (!res.ok) throw new Error(`הורדת טקסט נכשלה (${res.status})`);
  return await res.text();
}

/* ------------------------------ עץ הקטגוריות ↔ תיקיות ------------------------------ */

export type CatRow = typeof categories.$inferSelect;

export async function loadCategories(): Promise<{ byId: Map<number, CatRow>; all: CatRow[] }> {
  const all = await db.select().from(categories);
  return { byId: new Map(all.map((c) => [c.id, c])), all };
}

/** שם התיקייה לכל קטגוריה: הכותרת, ובמקרה של כפילות בין אחים — מוסיף " (slug)". */
export function planFolderNames(all: CatRow[]): Map<number, string> {
  const out = new Map<number, string>();
  const groups = new Map<string, CatRow[]>();
  for (const c of all) {
    const k = String(c.parentId ?? 0);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.sort - b.sort || a.id - b.id);
    const used = new Set<string>();
    for (const c of list) {
      let name = sanitizeDriveName(c.title);
      if (used.has(name)) name = sanitizeDriveName(`${name} (${c.slug})`);
      let n = 2;
      while (used.has(name)) name = sanitizeDriveName(`${c.title} (${c.slug}-${n++})`);
      used.add(name);
      out.set(c.id, name);
    }
  }
  return out;
}

/** נתיב השמות (מהשורש עד הקטגוריה) לתצוגה. */
export function categoryPathNames(id: number, byId: Map<number, CatRow>): string[] {
  const parts: string[] = [];
  let cur = byId.get(id);
  let guard = 0;
  while (cur && guard++ < 30) {
    parts.unshift(cur.title);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts;
}

/** יצירות תיקייה שרצות כרגע (לפי קטגוריה) — מונע כפילות כשכמה עובדים מבקשים אותה במקביל. */
const inflightFolders = new Map<number, Promise<string>>();

/**
 * מבטיח שקיימת תיקייה לקטגוריה (ולכל אבותיה), יוצר את החסרות, שומר drive_folder_id ב-DB.
 * אם ה-id השמור כבר לא קיים בדרייב (נמחק) — יוצר מחדש.
 */
export async function ensureCategoryFolder(
  categoryId: number,
  ctx?: { byId: Map<number, CatRow>; names: Map<number, string>; rootId?: string; verified?: Set<number>; actorId?: number | null },
): Promise<string> {
  const base = ctx ?? { ...(await loadCategories()), names: new Map<number, string>() };
  const { byId } = base;
  const names = base.names.size ? base.names : planFolderNames([...byId.values()]);
  const verified = ctx?.verified ?? new Set<number>();
  const rootId = ctx?.rootId ?? (await getRootFolderId());

  const walk = async (id: number): Promise<string> => {
    const cat = byId.get(id);
    if (!cat) throw new Error(`קטגוריה ${id} לא נמצאה`);
    if (cat.driveFolderId && verified.has(id)) return cat.driveFolderId;
    const flight = inflightFolders.get(id);
    if (flight) return flight;
    const p = (async () => {
    const parentFolder = cat.parentId ? await walk(cat.parentId) : rootId;
    if (cat.driveFolderId) {
      const f = await driveGet(cat.driveFolderId);
      if (f && f.mimeType === FOLDER_MIME) {
        verified.add(id);
        return cat.driveFolderId;
      }
    }
    const folderId = await driveCreateFolder(names.get(id) ?? cat.title, parentFolder);
    await db.update(categories).set({ driveFolderId: folderId }).where(eq(categories.id, id));
    cat.driveFolderId = folderId;
    verified.add(id);
    await logDriveEvent({
      kind: "folder.create",
      categoryId: id,
      driveId: folderId,
      newValue: names.get(id) ?? cat.title,
      actorId: ctx?.actorId,
    });
    return folderId;
    })();
    inflightFolders.set(id, p);
    try {
      return await p;
    } finally {
      inflightFolders.delete(id);
    }
  };
  return walk(categoryId);
}

/** תיקיות הארכיון (שורש + שלוש תתי-תיקיות), נוצרות לפי הצורך. */
export async function ensureArchiveFolders(): Promise<{ root: string; sub: Record<ArchiveKind, string> }> {
  const rootId = await getRootFolderId();
  const top = await driveListFolder(rootId);
  const find = (list: DriveItem[], name: string) => list.find((f) => f.mimeType === FOLDER_MIME && f.name === name)?.id;
  const archive = find(top, ARCHIVE_FOLDER_NAME) ?? (await driveCreateFolder(ARCHIVE_FOLDER_NAME, rootId));
  const kids = await driveListFolder(archive);
  const sub = {} as Record<ArchiveKind, string>;
  for (const k of Object.keys(ARCHIVE_SUB) as ArchiveKind[]) {
    sub[k] = find(kids, ARCHIVE_SUB[k]) ?? (await driveCreateFolder(ARCHIVE_SUB[k], archive));
  }
  return { root: archive, sub };
}

/** תיאור הקובץ בדרייב: מכיל את השם הישן (התגית) + קישור לחומר באתר. */
export function buildFileDescription(opts: { originalName: string; materialId?: number; movedAt?: Date; note?: string }) {
  return [
    `שם מקורי בדרייב: ${opts.originalName}`,
    opts.materialId ? `חומר באתר: #${opts.materialId}` : null,
    opts.note ?? null,
    `עודכן ע"י האתר: ${(opts.movedAt ?? new Date()).toISOString().slice(0, 16).replace("T", " ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export type PlaceCtx = NonNullable<Parameters<typeof ensureCategoryFolder>[1]>;

/**
 * מציב חומר במקומו בדרייב: מעביר לתיקיית הקטגוריה שלו ומשנה את שם הקובץ לשם החומר באתר
 * (materials.fileName; בהתנגשות שם בתיקייה — עם " (#id)"). השם הישן נשמר בתגית. אידמפוטנטי.
 *
 * עלות בלי אופציות: loadCategories + driveGet לכל תיקיית-אב (אימות) + driveGet לקובץ + רשימת התיקייה + PATCH.
 * כשמציבים כמה חומרים — להעביר `ctx` משותף (העץ מאומת פעם אחת) ואחת מהשתיים:
 *  - `takenNames`: שמות הקבצים *האחרים* בתיקיית היעד (הקורא מוציא את הקבצים שהוא מציב); הסט מתעדכן בכל הצבה.
 *  - `listing`: תמונת-מצב של ילדי התיקייה (driveListFolder) — הקובץ עצמו מוצא ממנה אוטומטית.
 * שתיהן חוסכות את רשימת-התיקייה לכל קובץ.
 */
export async function placeMaterial(
  materialId: number,
  opts: { actorId?: number | null; ctx?: PlaceCtx; takenNames?: Set<string>; listing?: DriveItem[] } = {},
): Promise<{ moved: boolean; renamed: boolean; folderId: string; name: string } | null> {
  const [m] = await db.select().from(materials).where(eq(materials.id, materialId));
  if (!m) return null;
  const fileId = driveIdFromUrl(m.fileUrl);
  if (!fileId) return null;

  const folderId = await ensureCategoryFolder(m.categoryId, opts.ctx);
  return withFolderLock(folderId, () => placeInFolder(m, fileId, folderId, opts));
}

async function placeInFolder(
  m: typeof materials.$inferSelect,
  fileId: string,
  folderId: string,
  opts: { actorId?: number | null; takenNames?: Set<string>; listing?: DriveItem[] },
): Promise<{ moved: boolean; renamed: boolean; folderId: string; name: string }> {
  const current = await driveGet(fileId);
  if (!current) throw new Error(`הקובץ ${fileId} של חומר #${m.id} לא נמצא בדרייב`);

  let desired = sanitizeDriveName(m.fileName);
  const taken =
    opts.takenNames ?? new Set((opts.listing ?? (await driveListFolder(folderId))).filter((f) => f.id !== fileId).map((f) => f.name));
  if (taken.has(desired)) desired = sanitizeDriveName(withIdSuffix(m.fileName, m.id));
  taken.add(desired);

  const needMove = !current.parents.includes(folderId) || current.parents.length !== 1;
  const needRename = current.name !== desired;
  if (!needMove && !needRename && current.appProperties.materialId === String(m.id)) {
    if (current.size && current.size !== m.size) await db.update(materials).set({ size: current.size }).where(eq(materials.id, m.id));
    return { moved: false, renamed: false, folderId, name: desired };
  }

  const original = m.driveOriginalName ?? current.name;
  await drivePatch(fileId, {
    name: desired,
    addParent: needMove ? folderId : undefined,
    removeParents: needMove ? current.parents.filter((p) => p !== folderId) : undefined,
    description: buildFileDescription({ originalName: original, materialId: m.id }),
    appProperties: {
      materialId: String(m.id),
      siteManaged: "1",
      // אחרי שחזור מהארכיון — מנקים את תגיות הארכיון
      ...(current.appProperties.archived ? ({ archived: null, archiveKind: null } as unknown as Record<string, string>) : {}),
    },
  });
  if (!m.driveOriginalName) await db.update(materials).set({ driveOriginalName: current.name }).where(eq(materials.id, m.id));
  // הגודל ב-DB מיושן לקבצים שתוקנו בדרייב אחרי ההעלאה — מסנכרנים לגודל האמיתי
  if (current.size && current.size !== m.size) await db.update(materials).set({ size: current.size }).where(eq(materials.id, m.id));
  if (needMove) {
    await logDriveEvent({ kind: "file.move", materialId: m.id, categoryId: m.categoryId, driveId: fileId, oldValue: current.parents.join(","), newValue: folderId, actorId: opts.actorId });
  }
  if (needRename) {
    await logDriveEvent({ kind: "file.rename", materialId: m.id, categoryId: m.categoryId, driveId: fileId, oldValue: current.name, newValue: desired, actorId: opts.actorId });
  }
  return { moved: needMove, renamed: needRename, folderId, name: desired };
}

/** מעביר קובץ דרייב (לא מקושר/לא ברור) לארכיון עם תיאור הסיבה ומיקום המקור. שם הקובץ נשמר. */
export async function archiveDriveFile(
  fileId: string,
  kind: ArchiveKind,
  reason: string,
  opts: { archive?: Awaited<ReturnType<typeof ensureArchiveFolders>>; actorId?: number | null; materialId?: number | null } = {},
) {
  const archive = opts.archive ?? (await ensureArchiveFolders());
  const cur = await driveGet(fileId);
  if (!cur) throw new Error(`קובץ ${fileId} לא נמצא`);
  const target = archive.sub[kind];
  if (cur.parents.includes(target) && cur.parents.length === 1) return cur;
  const note = `הועבר לארכיון: ${reason}\nמיקום קודם: ${cur.parents.join(",")}`;
  const moved = await drivePatch(fileId, {
    addParent: target,
    removeParents: cur.parents.filter((p) => p !== target),
    description: `${cur.description ? cur.description + "\n" : ""}${note}`,
    appProperties: { archived: "1", archiveKind: kind },
  });
  await logDriveEvent({
    kind: "file.archive",
    materialId: opts.materialId ?? null,
    driveId: fileId,
    oldValue: cur.name,
    newValue: ARCHIVE_SUB[kind],
    details: { reason, from: cur.parents },
    actorId: opts.actorId,
  });
  return moved;
}

/** משנה את שם תיקיית הקטגוריה לפי הכותרת הנוכחית (אם התיקייה קיימת). */
export async function syncCategoryFolderName(categoryId: number, actorId?: number | null) {
  const { byId, all } = await loadCategories();
  const cat = byId.get(categoryId);
  if (!cat?.driveFolderId) return;
  const name = planFolderNames(all).get(categoryId) ?? cat.title;
  const cur = await driveGet(cat.driveFolderId);
  if (cur && cur.name !== name) {
    await drivePatch(cat.driveFolderId, { name });
    await logDriveEvent({ kind: "folder.rename", categoryId, driveId: cat.driveFolderId, oldValue: cur.name, newValue: name, actorId });
  }
}

/** מעביר את תיקיית הקטגוריה להורה החדש (אחרי שינוי parentId ב-DB). */
export async function syncCategoryFolderParent(categoryId: number, actorId?: number | null) {
  const ctx = { ...(await loadCategories()), names: new Map<number, string>(), verified: new Set<number>(), actorId };
  const cat = ctx.byId.get(categoryId);
  if (!cat) return;
  const rootId = await getRootFolderId();
  const parentFolder = cat.parentId ? await ensureCategoryFolder(cat.parentId, { ...ctx, rootId }) : rootId;
  if (!cat.driveFolderId) {
    await ensureCategoryFolder(categoryId, { ...ctx, rootId });
    return;
  }
  const cur = await driveGet(cat.driveFolderId);
  if (!cur) {
    cat.driveFolderId = null;
    await db.update(categories).set({ driveFolderId: null }).where(eq(categories.id, categoryId));
    await ensureCategoryFolder(categoryId, { ...ctx, rootId });
    return;
  }
  if (!cur.parents.includes(parentFolder) || cur.parents.length !== 1) {
    await drivePatch(cat.driveFolderId, { addParent: parentFolder, removeParents: cur.parents.filter((p) => p !== parentFolder) });
    await logDriveEvent({ kind: "folder.move", categoryId, driveId: cat.driveFolderId, oldValue: cur.parents.join(","), newValue: parentFolder, actorId });
  }
}


/** כל מזהי קבצי הדרייב שמשויכים לישות כלשהי באתר (חומרים, שיחות, הצעות מכירה) — אלה לעולם לא "יתומים". */
export async function loadLinkedDriveIds(): Promise<Set<string>> {
  const { sql } = await import("drizzle-orm");
  const ids = new Set<string>();
  const add = (rows: unknown) => {
    const list = ((rows as { rows?: { u: string }[] }).rows ?? (rows as { u: string }[])) as { u: string }[];
    for (const r of list) {
      const id = driveIdFromUrl(r.u);
      if (id) ids.add(id);
    }
  };
  add(await db.select({ u: materials.fileUrl }).from(materials));
  for (const t of ["sichot", "sell_offers"]) {
    try {
      add(await db.execute(sql.raw(`select file_url as u from ${t} where file_url like 'drive://%'`)));
    } catch {
      /* טבלה/עמודה לא קיימת — מתעלמים */
    }
  }
  return ids;
}

/** האם בתיקייה (או בתת-תיקיותיה) יש קבצים חיים שאינם קובצי מידע של האתר. */
export async function folderHasLiveFiles(folderId: string, depth = 0): Promise<boolean> {
  if (depth > 12) return true;
  for (const i of await driveListFolder(folderId)) {
    if (i.mimeType === FOLDER_MIME) {
      if (await folderHasLiveFiles(i.id, depth + 1)) return true;
    } else if (i.appProperties.siteInfo !== "1") {
      return true;
    }
  }
  return false;
}
