/**
 * המנוע של "הערה כללית על הקובץ" (material_fixes, kind=general) – משותף לסקריפט scripts/agent-general-fix.ts (מצב ישיר)
 * ול-API של הסוכן /api/agent/general-fix (מצב API: האתר עושה את העבודה עם ההרשאות שלו, הסוכן ב-GitHub Actions לא צריך
 * סודות דרייב/Oracle). כל שלב: הורדת הקובץ החי, בדיקת docx ערוך + המרה אמיתית ל-PDF, והחלטה (פרטי / לכולן / תשובה /
 * דחייה / הסרת גרסה).
 *
 * כללי ברזל (משה, 2026-11-06): **לא מוחקים, שומרים הכול, מתעדים הכול.** כל קובץ שעובר כאן (המקור שהורד, הקובץ הערוך,
 * ה-PDF המומר, הקובץ שפורסם) נשמר בדרייב תחת _ארכיון/"חומרי עבודה – הערות כלליות"/"הערה #<id>" ומזהיו נרשמים
 * ב-material_fixes.artifacts; כל פעולה נרשמת ב-audit_logs (entity material_fix) וב-agent_events (logFixEvent).
 * שורות משנות סטטוס בלבד. בלי "server-only" – רץ גם מסקריפט tsx.
 */
import JSZip from "jszip";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { materialFixes, materials, users } from "@/db/schema";
import { convertOfficeToPdf, driveDownload, driveIdFromUrl } from "@/lib/driveBridgeCore";
import { categoryPathNames, driveCreateFolder, ensureArchiveFolders, loadCategories } from "@/lib/driveTreeCore";
import { replaceDocxInPlace } from "@/lib/agentFileReplace";
import { checkEditedDocx, paragraphDiff, plainText, type EditCheckResult } from "@/lib/docx-edit-check";
import { applyDocxFixes, compactText, isDocxName } from "@/lib/docx-fixes";
import { getFixesForViewer } from "@/lib/fixes";
import { REPLY_LIBRARY_ERROR, validateReplyText } from "@/lib/reply-text";
import { logFixEvent } from "@/lib/fix-events";
import { getPrivateVersion, publishPrivateVersion, removePrivateVersion, uploadFileToFolder } from "@/lib/private-versions";
import type { AgentEventSource } from "@/lib/agentEvents";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const ARTIFACTS_FOLDER_NAME = "חומרי עבודה – הערות כלליות";

/** מי מפעיל: הסוכן (actorId null) / המנהלת; ip כשמגיע דרך ה-API */
export type Actor = { actorId?: number | null; source?: AgentEventSource; ip?: string | null; via: "script" | "api" | "admin" };

export type ArtifactKind = "original" | "edited" | "rendered" | "published";
export type FixArtifact = { kind: ArtifactKind; driveId: string; name: string; at: string; size: number };

type Complaint = Awaited<ReturnType<typeof loadComplaint>>;

export async function loadComplaint(fixId: number) {
  if (!Number.isInteger(fixId) || fixId <= 0) throw new Error("חסר fixId");
  const [row] = await db
    .select({ fix: materialFixes, m: materials, userName: users.name })
    .from(materialFixes)
    .innerJoin(materials, eq(materials.id, materialFixes.materialId))
    .leftJoin(users, eq(users.id, materialFixes.userId))
    .where(eq(materialFixes.id, fixId));
  if (!row) throw new Error(`הערה ${fixId} לא נמצאה`);
  if (row.fix.kind !== "general") throw new Error(`הערה ${fixId} היא תיקון מסומן (kind=${row.fix.kind}) — לטפל ב-agent-fix-suggest.ts`);
  const driveId = driveIdFromUrl(row.m.fileUrl);
  if (!driveId) throw new Error(`לחומר ${row.m.id} אין קובץ דרייב`);
  return { ...row, driveId };
}

function requirePending(fix: { id: number; status: string }) {
  if (fix.status !== "pending") throw new Error(`הערה ${fix.id} במצב ${fix.status}, לא pending — לא נוגעים`);
}

export function parseArtifacts(json: string | null | undefined): FixArtifact[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as FixArtifact[]) : [];
  } catch {
    return [];
  }
}

/* ---------- קבצי עבודה (artifacts) – נשמרים לתמיד ---------- */

let artifactsRoot: string | null = null;
async function artifactsFolderFor(fixId: number): Promise<string> {
  if (!artifactsRoot) {
    const archive = await ensureArchiveFolders();
    artifactsRoot = await driveCreateFolder(ARTIFACTS_FOLDER_NAME, archive.root);
  }
  return driveCreateFolder(`הערה #${fixId}`, artifactsRoot);
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

/** שומר קובץ עבודה בדרייב ורושם אותו על ההערה (artifacts) וביומן. כשל בשמירה לא מפיל את הפעולה – נרשם. */
export async function keepFixArtifact(opts: { fixId: number; materialId: number; kind: ArtifactKind; name: string; bytes: Uint8Array | Buffer; mimeType?: string; actor: Actor; note?: string }): Promise<FixArtifact | null> {
  try {
    const folderId = await artifactsFolderFor(opts.fixId);
    const name = `${opts.kind} ${stamp()} – ${opts.name}`.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 200);
    const { fileId, size } = await uploadFileToFolder({
      folderId,
      name,
      bytes: opts.bytes,
      mimeType: opts.mimeType ?? DOCX_MIME,
      description: `קובץ עבודה (${opts.kind}) של הערה כללית #${opts.fixId} על חומר #${opts.materialId}. נשמר לתמיד.${opts.note ? `\n${opts.note.slice(0, 300)}` : ""}`,
      appProperties: { archived: "1", archiveKind: "fixArtifact", fixId: String(opts.fixId), artifactKind: opts.kind },
    });
    const art: FixArtifact = { kind: opts.kind, driveId: fileId, name, at: new Date().toISOString(), size };
    const [row] = await db.select({ artifacts: materialFixes.artifacts }).from(materialFixes).where(eq(materialFixes.id, opts.fixId));
    const list = [...parseArtifacts(row?.artifacts), art];
    await db.update(materialFixes).set({ artifacts: JSON.stringify(list) }).where(eq(materialFixes.id, opts.fixId));
    await logFixEvent({
      fixId: opts.fixId,
      materialId: opts.materialId,
      action: `fix.general.artifact.${opts.kind}`,
      actorId: opts.actor.actorId ?? null,
      source: opts.actor.source,
      ip: opts.actor.ip ?? null,
      summary: `נשמר קובץ עבודה (${opts.kind}) בדרייב: ${name} (${fileId})`,
      details: { driveId: fileId, name, size, via: opts.actor.via },
    });
    return art;
  } catch (e) {
    console.error("keepFixArtifact failed", e instanceof Error ? e.message : e);
    await logFixEvent({ fixId: opts.fixId, materialId: opts.materialId, action: "fix.general.artifact.failed", actorId: opts.actor.actorId ?? null, source: opts.actor.source, summary: `שמירת קובץ עבודה (${opts.kind}) נכשלה: ${e instanceof Error ? e.message : e}`, details: { via: opts.actor.via } });
    return null;
  }
}

/* ---------- list / get ---------- */

export async function listPendingGeneral() {
  const rows = await db
    .select({ fix: materialFixes, m: materials, userName: users.name })
    .from(materialFixes)
    .innerJoin(materials, eq(materials.id, materialFixes.materialId))
    .leftJoin(users, eq(users.id, materialFixes.userId))
    .where(and(eq(materialFixes.status, "pending"), eq(materialFixes.kind, "general")))
    .orderBy(materialFixes.createdAt);
  return rows.map(({ fix, m, userName }) => ({
    fixId: fix.id,
    materialId: m.id,
    title: m.title,
    fileName: m.fileName,
    isDocx: isDocxName(m.fileName),
    userId: fix.userId,
    userName,
    complaint: fix.requestText,
    createdAt: fix.createdAt,
    /** הודעת המשך בשרשור קיים (parentId = ההערה הראשונה, turn = מספר ההודעה של המורה) – ההיסטוריה המלאה ב---get */
    parentId: fix.parentId ?? null,
    turn: fix.turn ?? 1,
    commentators: fix.reason === "commentators",
  }));
}

/* ---------- שרשור (שיחה עד 5 הודעות של המורה) ---------- */

export type ThreadEntry = { fixId: number; turn: number; status: string; teacherText: string; agentReply: string | null; at: Date };

/** כל ההודעות בשרשור של ההערה (של אותה מורה, אותו חומר), מהישנה לחדשה. שרשור בלי המשך = ההערה עצמה בלבד. */
export async function loadThread(fix: { id: number; parentId: number | null; userId: number | null; materialId: number }): Promise<ThreadEntry[]> {
  const root = fix.parentId ?? fix.id;
  const rows = await db
    .select()
    .from(materialFixes)
    .where(and(eq(materialFixes.materialId, fix.materialId), eq(materialFixes.kind, "general"), or(eq(materialFixes.id, root), eq(materialFixes.parentId, root))))
    .orderBy(asc(materialFixes.id));
  return rows
    .filter((r) => r.userId === fix.userId && r.status !== "cancelled" && r.status !== "rejected")
    .map((r, i) => ({ fixId: r.id, turn: r.turn ?? i + 1, status: r.status, teacherText: r.requestText, agentReply: r.replyText, at: r.createdAt }));
}

/* ---------- הקובץ שהמורה רואה (בסיס העריכה) ---------- */

export type OwnFixInfo = { id: number; original: string; corrected: string; embeddedBefore: boolean };

export type ViewerBase = {
  bytes: Buffer;
  /** מאיפה: הגרסה הפרטית הפעילה שלה, או הקובץ המשותף החי */
  source: "private-version" | "shared";
  privateVersionId: number | null;
  /** התיקונים המסומנים של המורה (pending/private) שהוחלו על הבסיס עכשיו (לא היו בו עד כה) */
  appliedOwnFixes: OwnFixInfo[];
  /** תיקונים מסומנים שלה שנמצאים כבר בגרסה הפרטית הפעילה (embedded) */
  alreadyEmbedded: OwnFixInfo[];
  /** תיקונים מסומנים שלא נמצא להם מקום בבסיס (הטקסט המקורי לא נמצא) – לא נכנסו */
  notApplied: OwnFixInfo[];
  /** כל התיקונים המסומנים שלה (לבדיקה שהקובץ הערוך לא מאבד אותם) */
  allOwnFixes: OwnFixInfo[];
};

/**
 * הקובץ שהמורה רואה ושעליו הסוכן אמור לעבוד (כשמחליטים --private / --answer): הגרסה הפרטית הפעילה שלה (אם יש) – אחרת
 * המשותף – ועליו התיקונים המסומנים שלה עצמה ("סימון בדף", pending/private) שעוד לא שולבו בגרסה הפרטית, מוחלים כמו בהורדה
 * נקייה. כך גרסה פרטית חדשה לא מאבדת לא את הגרסה הפרטית הקודמת ולא תיקון ידני שהמורה עשתה (בלי זה: גרסה חדשה נבנתה מהמשותף
 * והחליפה את הקודמת – "ההדגשות שנוספו בגרסה הקודמת לא נכללו", הערה #24).
 * base="shared": רק המשותף החי, בלי כלום ממנה (ל---merge: מה שמתפרסם לכולן לא כולל תיקונים אישיים שלא נבדקו).
 */
export async function loadViewerBase(m: typeof materials.$inferSelect, userId: number | null, sharedBytes: Buffer, base: "viewer" | "shared" = "viewer"): Promise<ViewerBase> {
  const empty: ViewerBase = { bytes: sharedBytes, source: "shared", privateVersionId: null, appliedOwnFixes: [], alreadyEmbedded: [], notApplied: [], allOwnFixes: [] };
  if (base === "shared" || !userId || !isDocxName(m.fileName)) return empty;
  let bytes = sharedBytes;
  let source: ViewerBase["source"] = "shared";
  const pv = await getPrivateVersion(m.id, userId);
  if (pv) {
    const pvDrive = driveIdFromUrl(pv.fileUrl);
    if (!pvDrive) throw new Error(`לגרסה הפרטית הפעילה #${pv.id} אין קובץ דרייב תקין`);
    bytes = Buffer.from((await driveDownload(pvDrive)).bytes);
    source = "private-version";
  }
  const own = ((await getFixesForViewer([m.id], userId)).get(m.id) ?? []).filter((f) => f.own);
  const info = (f: (typeof own)[number]): OwnFixInfo => ({ id: f.id, original: f.originalText, corrected: f.correctedText, embeddedBefore: !!f.embedded });
  const allOwnFixes = own.map(info);
  const alreadyEmbedded = allOwnFixes.filter((f) => f.embeddedBefore);
  const toApply = own.filter((f) => !f.embedded);
  let appliedIds: number[] = [];
  if (toApply.length > 0) {
    const r = await applyDocxFixes(
      new Uint8Array(bytes),
      toApply.map((f) => ({ id: f.id, originalText: f.originalText, correctedText: f.correctedText, occurrence: f.occurrence })),
    );
    appliedIds = r.applied;
    if (r.applied.length > 0) bytes = Buffer.from(r.bytes);
  }
  return {
    bytes,
    source,
    privateVersionId: pv?.id ?? null,
    appliedOwnFixes: allOwnFixes.filter((f) => appliedIds.includes(f.id)),
    alreadyEmbedded,
    notApplied: allOwnFixes.filter((f) => !f.embeddedBefore && !appliedIds.includes(f.id)),
    allOwnFixes,
  };
}

/** האם הטקסט המתוקן של כל תיקון מסומן שלה נמצא בקובץ הערוך (השוואה דחוסה – בלי רווחים וניקוד) */
export async function ownFixesPresence(editedBytes: Uint8Array | Buffer, own: OwnFixInfo[]): Promise<(OwnFixInfo & { present: boolean })[]> {
  if (own.length === 0) return [];
  const text = compactText(paragraphsOf(await docXmlOf(editedBytes)).join(" "));
  return own.map((f) => ({ ...f, present: text.includes(compactText(f.corrected)) }));
}

async function docXmlOf(bytes: Uint8Array | Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const n = Object.keys(zip.files).find((x) => x.split("\\").join("/") === "word/document.xml");
  return n ? zip.file(n)!.async("string") : "";
}

export function paragraphsOf(xml: string): string[] {
  return (xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((p) => plainText(p));
}

export type GetResult = {
  fixId: number;
  status: string;
  materialId: number;
  title: string;
  fileName: string;
  isDocx: boolean;
  category: string | null;
  userId: number | null;
  userName: string | null;
  complaint: string;
  existingPrivateVersion: { id: number; createdAt: Date; note: string | null } | null;
  /** שיחה: ההערה הראשונה + הודעות ההמשך שלה ותשובות הסוכן (מהישנה לחדשה); thisTurn = מספר ההודעה הנוכחית של המורה */
  thread: ThreadEntry[];
  thisTurn: number;
  /** על מה עובדים: "viewer" = מה שהמורה רואה (גרסה פרטית/משותף + תיקונים מסומנים שלה); "shared" = המשותף בלבד */
  base: {
    kind: "viewer" | "shared";
    source: ViewerBase["source"];
    privateVersionId: number | null;
    appliedOwnFixes: OwnFixInfo[];
    alreadyEmbedded: OwnFixInfo[];
    notApplied: OwnFixInfo[];
  };
  artifacts: FixArtifact[];
  paragraphs: string[];
  bytes: Uint8Array;
};

/** מוריד את הקובץ החי של ההערה; בפעם הראשונה שומר אותו כקובץ עבודה "original" (תמונת מצב של מה שהסוכן ראה). */
export async function getComplaint(fixId: number, actor: Actor, opts: { base?: "viewer" | "shared" } = {}): Promise<GetResult> {
  const { fix, m, driveId, userName } = await loadComplaint(fixId);
  const dl = await driveDownload(driveId);
  const baseKind = opts.base ?? "viewer";
  const vb = await loadViewerBase(m, fix.userId, Buffer.from(dl.bytes), baseKind);
  const bytes = new Uint8Array(vb.bytes);
  const thread = await loadThread(fix);
  const paragraphs = isDocxName(m.fileName) ? paragraphsOf(await docXmlOf(bytes)) : [];
  const { byId } = await loadCategories();
  const cat = byId.get(m.categoryId);
  const existing = fix.userId ? await getPrivateVersion(m.id, fix.userId) : null;
  let artifacts = parseArtifacts(fix.artifacts);
  await logFixEvent({
    fixId,
    materialId: m.id,
    action: "fix.general.get",
    actorId: actor.actorId ?? null,
    source: actor.source,
    ip: actor.ip ?? null,
    summary: `הסוכן הוריד את הקובץ החי "${m.fileName}" (${dl.size} בתים, דרייב ${driveId}) לבדיקת ההערה`,
    details: { driveId, size: dl.size, paragraphs: paragraphs.length, via: actor.via, existingPrivateVersion: existing?.id ?? null, base: baseKind, baseSource: vb.source, appliedOwnFixes: vb.appliedOwnFixes.map((f) => f.id), alreadyEmbedded: vb.alreadyEmbedded.map((f) => f.id), turn: fix.turn ?? 1 },
  });
  if (!artifacts.some((a) => a.kind === "original")) {
    const art = await keepFixArtifact({
      fixId,
      materialId: m.id,
      kind: "original",
      name: m.fileName,
      bytes,
      actor,
      note:
        baseKind === "viewer"
          ? `הקובץ שהמורה רואה כפי שהיה כשהסוכן התחיל לטפל (${vb.source === "private-version" ? "הגרסה הפרטית שלה" : "המשותף"}${vb.appliedOwnFixes.length ? ` + ${vb.appliedOwnFixes.length} תיקונים מסומנים שלה` : ""})`
          : "הקובץ המשותף החי כפי שהיה כשהסוכן התחיל לטפל",
    });
    if (art) artifacts = [...artifacts, art];
  }
  return {
    fixId,
    status: fix.status,
    materialId: m.id,
    title: m.title,
    fileName: m.fileName,
    isDocx: isDocxName(m.fileName),
    category: cat ? categoryPathNames(cat.id, byId).join(" / ") : null,
    userId: fix.userId,
    userName,
    complaint: fix.requestText,
    existingPrivateVersion: existing ? { id: existing.id, createdAt: existing.createdAt, note: existing.note } : null,
    thread,
    thisTurn: fix.turn ?? 1,
    base: { kind: baseKind, source: vb.source, privateVersionId: vb.privateVersionId, appliedOwnFixes: vb.appliedOwnFixes, alreadyEmbedded: vb.alreadyEmbedded, notApplied: vb.notApplied },
    artifacts,
    paragraphs,
    bytes,
  };
}

/* ---------- check (+ render) ---------- */

export type CheckResult = EditCheckResult & {
  /** מול מה נבדק: "viewer" = מה שהמורה רואה (ברירת מחדל, ל---private/--answer); "shared" = המשותף החי (ל---merge) */
  against: "viewer" | "shared";
  /** התיקונים המסומנים של המורה: האם התיקון המתוקן נמצא בקובץ הערוך (present=false = הערוך מאבד אותו) */
  ownFixes: { id: number; original: string; corrected: string; present: boolean }[];
  diff: { removed: string[]; added: string[] };
  pdf: Uint8Array | null;
  renderError: string | null;
  artifacts: FixArtifact[];
};

/**
 * בודק docx ערוך מול הקובץ החי (תמיד החי עכשיו – לא original ישן), ולבקשה ממיר ל-PDF דרך צינור ההגשה האמיתי
 * (תיקוני-הגשה + Oracle/LibreOffice). הקובץ הערוך וה-PDF נשמרים כקבצי עבודה.
 */
export async function checkEdited(opts: { fixId: number; bytes: Uint8Array | Buffer; render: boolean; actor: Actor; keep?: boolean; against?: "viewer" | "shared" }): Promise<CheckResult> {
  const { fix, m, driveId } = await loadComplaint(opts.fixId);
  if (!isDocxName(m.fileName)) throw new Error(`הקובץ "${m.fileName}" אינו docx — אי אפשר לערוך`);
  const against = opts.against ?? "viewer";
  const live = Buffer.from((await driveDownload(driveId)).bytes);
  const vb = await loadViewerBase(m, fix.userId, live, against);
  const base = vb.bytes;
  const res = await checkEditedDocx(base, opts.bytes);
  const diff = paragraphDiff(await docXmlOf(base), await docXmlOf(opts.bytes));
  // תיקון ידני של המורה שהקובץ הערוך מאבד – אזהרה (הסוכן צריך לשלב אותו או לוודא שהסרתו מכוונת)
  const ownFixes = against === "viewer" ? await ownFixesPresence(opts.bytes, vb.allOwnFixes) : [];
  for (const f of ownFixes) {
    if (!f.present) res.warnings.push(`התיקון הידני של המורה (#${f.id}) «${f.original.slice(0, 40)}» ← «${f.corrected.slice(0, 40)}» לא נמצא בקובץ הערוך – שלבו אותו בקובץ (או ודאו שהסרתו מכוונת)`);
  }
  let pdf: Uint8Array | null = null;
  let renderError: string | null = null;
  if (opts.render && res.ok) {
    try {
      pdf = await convertOfficeToPdf({ bytes: new Uint8Array(opts.bytes), mimeType: DOCX_MIME, name: m.fileName });
    } catch (e) {
      renderError = e instanceof Error ? e.message : String(e);
    }
  }
  await logFixEvent({
    fixId: opts.fixId,
    materialId: m.id,
    action: "fix.general.check",
    actorId: opts.actor.actorId ?? null,
    source: opts.actor.source,
    ip: opts.actor.ip ?? null,
    summary: `בדיקת docx ערוך: ${res.ok ? "עבר" : "נכשל"} (${res.errors.length} שגיאות, ${res.warnings.length} אזהרות)${opts.render ? pdf ? `, הומר ל-PDF (${pdf.length} בתים)` : `, המרה נכשלה: ${renderError}` : ""}`,
    details: { ok: res.ok, against, ownFixesMissing: ownFixes.filter((f) => !f.present).map((f) => f.id), errors: res.errors, warnings: res.warnings, stats: res.stats, added: diff.added.slice(0, 10), removed: diff.removed.slice(0, 10), via: opts.actor.via, status: fix.status },
  });
  const artifacts: FixArtifact[] = [];
  if (opts.keep !== false) {
    const a = await keepFixArtifact({ fixId: opts.fixId, materialId: m.id, kind: "edited", name: m.fileName, bytes: opts.bytes, actor: opts.actor, note: `בדיקה: ${res.ok ? "עבר" : "נכשל: " + res.errors.join("; ")}` });
    if (a) artifacts.push(a);
    if (pdf) {
      const b = await keepFixArtifact({ fixId: opts.fixId, materialId: m.id, kind: "rendered", name: m.fileName.replace(/\.docx$/i, ".pdf"), bytes: pdf, mimeType: "application/pdf", actor: opts.actor, note: "PDF שהומר בצינור ההגשה האמיתי" });
      if (b) artifacts.push(b);
    }
  }
  return { ...res, against, ownFixes: ownFixes.map((f) => ({ id: f.id, original: f.original, corrected: f.corrected, present: f.present })), diff, pdf, renderError, artifacts };
}

/* ---------- החלטות ---------- */

/** תשובה למורה לא מזכירה את אתר/ספריית המקור (ר' src/lib/reply-text.ts) – זורק שגיאה ברורה כדי שהסוכן ינסח מחדש */
function assertReplyText(note: string) {
  const v = validateReplyText(note);
  if (!v.ok) throw new Error(v.error || REPLY_LIBRARY_ERROR);
}

async function prepareEdited(fixId: number, bytes: Uint8Array | Buffer, note: string, actor: Actor, against: "viewer" | "shared" = "viewer") {
  if (!note || note.trim().length < 3) throw new Error('חובה note — מה תוקן, ניסוח אל המורה (בנקבה, בלי פרטים טכניים)');
  if (note.length > 600) throw new Error("ה-note ארוך מדי (עד 600 תווים)");
  assertReplyText(note);
  const loaded = await loadComplaint(fixId);
  requirePending(loaded.fix);
  if (!isDocxName(loaded.m.fileName)) throw new Error(`הקובץ "${loaded.m.fileName}" אינו docx — אי אפשר לערוך; השתמשו ב-answer`);
  const check = await checkEdited({ fixId, bytes, render: false, actor, keep: false, against });
  if (!check.ok) throw new Error("הקובץ הערוך לא עבר את הבדיקות מול הקובץ החי — לא נעשה כלום:\n- " + check.errors.join("\n- "));
  if (check.stats.changedEntries.length === 0) throw new Error("הקובץ הערוך זהה לקובץ החי — אין מה לפרסם (אם אין מה לשנות: answer)");
  return { ...loaded, note: note.trim(), check };
}

export type DecisionResult = { mode: "DRY-RUN" | "APPLY"; action: string; fixId: number; materialId: number; fileName: string; summary: string; details: Record<string, unknown> };

/** ברירת המחדל: הגרסה המתוקנת רק למורה שביקשה */
export async function decidePrivate(opts: { fixId: number; bytes: Uint8Array | Buffer; note: string; apply: boolean; actor: Actor }): Promise<DecisionResult> {
  const p = await prepareEdited(opts.fixId, opts.bytes, opts.note, opts.actor);
  if (!p.fix.userId) throw new Error("להערה אין מבקשת (userId ריק) — אין למי לפרסם גרסה פרטית. answer או reject");
  const existing = await getPrivateVersion(p.m.id, p.fix.userId);
  const base = { fixId: opts.fixId, materialId: p.m.id, fileName: p.m.fileName, action: "private" };
  const details = { userId: p.fix.userId, replacesPrivateVersion: existing?.id ?? null, stats: p.check.stats, warnings: p.check.warnings, ownFixesMissing: p.check.ownFixes.filter((f) => !f.present).map((f) => f.id), turn: p.fix.turn ?? 1, note: p.note, via: opts.actor.via };
  if (!opts.apply) {
    await logFixEvent({ fixId: opts.fixId, materialId: p.m.id, action: "fix.general.private.dryrun", actorId: opts.actor.actorId ?? null, source: opts.actor.source, ip: opts.actor.ip ?? null, summary: `dry-run: גרסה פרטית למשתמשת #${p.fix.userId} (לא נכתב כלום)`, details });
    return { ...base, mode: "DRY-RUN", summary: "DRY-RUN: לא נכתב כלום. להחלה: apply", details };
  }
  const r = await publishPrivateVersion({ material: p.m, userId: p.fix.userId, fixId: opts.fixId, bytes: opts.bytes, note: p.note, via: `agent-general-fix/${opts.actor.via}`, actorId: opts.actor.actorId, ip: opts.actor.ip });
  // התיקונים המסומנים של המורה שנמצאים בתוך הקובץ הערוך סומנו "שולבו בגרסה הזו" (לא יוחלו שוב בהגשה); אלה שאינם בו – חוזרים להתחולל בהגשה
  const presentIds = p.check.ownFixes.filter((f) => f.present).map((f) => f.id);
  const absentIds = p.check.ownFixes.filter((f) => !f.present).map((f) => f.id);
  if (presentIds.length) await db.update(materialFixes).set({ embeddedVersionId: r.versionId }).where(inArray(materialFixes.id, presentIds));
  if (absentIds.length) await db.update(materialFixes).set({ embeddedVersionId: null }).where(inArray(materialFixes.id, absentIds));
  await db
    .update(materialFixes)
    .set({ status: "private", replyText: p.note, adminNote: `הסוכן ערך גרסה פרטית למבקשת (גרסה #${r.versionId}, דרייב ${r.fileId}); הקובץ המשותף לא שונה`, publishedAt: new Date() })
    .where(and(eq(materialFixes.id, opts.fixId), eq(materialFixes.status, "pending")));
  const art = await keepFixArtifact({ fixId: opts.fixId, materialId: p.m.id, kind: "published", name: p.m.fileName, bytes: opts.bytes, actor: opts.actor, note: `פורסם כגרסה פרטית #${r.versionId}` });
  await logFixEvent({
    fixId: opts.fixId,
    materialId: p.m.id,
    action: "fix.general.private",
    actorId: opts.actor.actorId ?? null,
    source: opts.actor.source,
    ip: opts.actor.ip ?? null,
    summary: `החלטה: גרסה פרטית #${r.versionId} למשתמשת #${p.fix.userId}; ההערה סומנה private. הקובץ המשותף לא שונה`,
    details: { ...details, versionId: r.versionId, fileId: r.fileId, driveName: r.driveName, replacedVersionId: r.replacedVersionId, publishedArtifact: art?.driveId ?? null, complaint: p.fix.requestText.slice(0, 300) },
  });
  return { ...base, mode: "APPLY", summary: `OK: גרסה פרטית #${r.versionId} (דרייב ${r.fileId}) פורסמה למשתמשת #${p.fix.userId}. ההערה סומנה private. הקובץ המשותף לא שונה.`, details: { ...details, versionId: r.versionId, fileId: r.fileId } };
}

/** לכל המורות: הקובץ המשותף מוחלף במקום, עם גיבוי (replaceDocxInPlace) */
export async function decideMerge(opts: { fixId: number; bytes: Uint8Array | Buffer; note: string; why: string; apply: boolean; actor: Actor }): Promise<DecisionResult> {
  const why = opts.why?.trim();
  if (!why || why.length < 5) throw new Error('חובה why — למה התיקון נכון לכל המורות ובמה אימתתם (נכנס לתיאור הקובץ ולגיבוי)');
  // --merge נבנה על המשותף החי בלבד (לא על הגרסה הפרטית של המורה ולא על תיקונים אישיים שלא נבדקו – זה מה שיתפרסם לכולן)
  const p = await prepareEdited(opts.fixId, opts.bytes, opts.note, opts.actor, "shared");
  if (p.fix.reason === "commentators") throw new Error("בקשה למפרשים נוספים נשמרת תמיד כגרסה פרטית לאותה מורה (--private) – אסור --merge");
  const base = { fixId: opts.fixId, materialId: p.m.id, fileName: p.m.fileName, action: "merge" };
  const details = { stats: p.check.stats, warnings: p.check.warnings, note: p.note, why, via: opts.actor.via };
  if (!opts.apply) {
    await logFixEvent({ fixId: opts.fixId, materialId: p.m.id, action: "fix.general.merge.dryrun", actorId: opts.actor.actorId ?? null, source: opts.actor.source, ip: opts.actor.ip ?? null, summary: "dry-run: החלפת הקובץ המשותף (לא נכתב כלום)", details });
    return { ...base, mode: "DRY-RUN", summary: "DRY-RUN: לא נכתב כלום (הקובץ המשותף לא הוחלף). להחלה: apply", details };
  }
  const r = await replaceDocxInPlace({ m: p.m, fileId: p.driveId, bytes: opts.bytes, note: `הערה כללית #${opts.fixId}: «${p.fix.requestText.slice(0, 200)}» — ${why}`, keepName: true, via: `general-fix-merge/${opts.actor.via}` });
  await db
    .update(materialFixes)
    .set({ status: "merged", replyText: p.note, adminNote: `שולב בקובץ המשותף ע"י הסוכן: ${why} · גיבוי הגרסה הקודמת בדרייב: ${r.backupId}`, publishedAt: new Date() })
    .where(and(eq(materialFixes.id, opts.fixId), eq(materialFixes.status, "pending")));
  // גרסה פרטית קודמת של המבקשת לאותו חומר מיותרת עכשיו (המשותף כולל את התיקון) – מסומנת removed, הקובץ נשמר
  let removedVersion: number | null = null;
  if (p.fix.userId) {
    const existing = await getPrivateVersion(p.m.id, p.fix.userId);
    if (existing) {
      await removePrivateVersion(existing.id, { reason: `הקובץ המשותף הוחלף (הערה #${opts.fixId})`, actorId: opts.actor.actorId, source: opts.actor.source === "admin" ? "admin" : "claude", ip: opts.actor.ip });
      removedVersion = existing.id;
    }
  }
  const art = await keepFixArtifact({ fixId: opts.fixId, materialId: p.m.id, kind: "published", name: p.m.fileName, bytes: opts.bytes, actor: opts.actor, note: `פורסם לכל המורות (גיבוי הקודם: ${r.backupId})` });
  await logFixEvent({
    fixId: opts.fixId,
    materialId: p.m.id,
    action: "fix.general.merge",
    actorId: opts.actor.actorId ?? null,
    source: opts.actor.source,
    ip: opts.actor.ip ?? null,
    summary: `החלטה: הקובץ המשותף הוחלף לכל המורות (גיבוי ${r.backupId}); ההערה סומנה merged`,
    details: { ...details, backupId: r.backupId, backupName: r.backupName, oldSize: r.oldSize, newSize: r.newSize, removedPrivateVersion: removedVersion, publishedArtifact: art?.driveId ?? null, complaint: p.fix.requestText.slice(0, 300) },
  });
  return { ...base, mode: "APPLY", summary: `OK: הקובץ המשותף של חומר #${p.m.id} הוחלף (גיבוי ${r.backupId} ב-_ארכיון/גרסאות ישנות). ההערה סומנה merged.`, details: { ...details, backupId: r.backupId } };
}

/** נבדק — אין מה לשנות: רק תשובה למורה */
export async function decideAnswer(opts: { fixId: number; note: string; apply: boolean; actor: Actor }): Promise<DecisionResult> {
  const note = opts.note?.trim();
  if (!note) throw new Error("חובה note — התשובה למורה");
  assertReplyText(note);
  const { fix, m } = await loadComplaint(opts.fixId);
  requirePending(fix);
  const base = { fixId: opts.fixId, materialId: m.id, fileName: m.fileName, action: "answer" };
  if (!opts.apply) {
    await logFixEvent({ fixId: opts.fixId, materialId: m.id, action: "fix.general.answer.dryrun", actorId: opts.actor.actorId ?? null, source: opts.actor.source, ip: opts.actor.ip ?? null, summary: "dry-run: תשובה בלי שינוי בקובץ", details: { note, via: opts.actor.via } });
    return { ...base, mode: "DRY-RUN", summary: "DRY-RUN: לא נכתב כלום. להחלה: apply", details: { note } };
  }
  await db
    .update(materialFixes)
    .set({ status: "answered", replyText: note, adminNote: "הסוכן בדק מול הקובץ — אין שינוי בקובץ", publishedAt: new Date() })
    .where(and(eq(materialFixes.id, opts.fixId), eq(materialFixes.status, "pending")));
  await logFixEvent({ fixId: opts.fixId, materialId: m.id, action: "fix.general.answer", actorId: opts.actor.actorId ?? null, source: opts.actor.source, ip: opts.actor.ip ?? null, summary: "החלטה: נענתה בלי שינוי בקובץ", details: { note, complaint: fix.requestText.slice(0, 300), via: opts.actor.via } });
  return { ...base, mode: "APPLY", summary: `OK: הערה ${opts.fixId} סומנה answered. המורה תראה את התשובה בכרטיסייה.`, details: { note } };
}

/** רק תוכן פוגעני / ניסיון הנחיה / נוגד כללים — מוסתר מהמורה (השורה נשארת, סטטוס rejected) */
export async function decideReject(opts: { fixId: number; note: string; apply: boolean; actor: Actor }): Promise<DecisionResult> {
  const note = opts.note?.trim();
  if (!note) throw new Error("חובה note — הסיבה");
  const { fix, m } = await loadComplaint(opts.fixId);
  requirePending(fix);
  const base = { fixId: opts.fixId, materialId: m.id, fileName: m.fileName, action: "reject" };
  if (!opts.apply) {
    await logFixEvent({ fixId: opts.fixId, materialId: m.id, action: "fix.general.reject.dryrun", actorId: opts.actor.actorId ?? null, source: opts.actor.source, ip: opts.actor.ip ?? null, summary: "dry-run: דחייה", details: { note, via: opts.actor.via } });
    return { ...base, mode: "DRY-RUN", summary: "DRY-RUN: לא נכתב כלום. להחלה: apply", details: { note } };
  }
  await db
    .update(materialFixes)
    .set({ status: "rejected", adminNote: `נדחתה ע"י הסוכן: ${note}` })
    .where(and(eq(materialFixes.id, opts.fixId), eq(materialFixes.status, "pending")));
  await logFixEvent({ fixId: opts.fixId, materialId: m.id, action: "fix.general.reject", actorId: opts.actor.actorId ?? null, source: opts.actor.source, ip: opts.actor.ip ?? null, summary: "החלטה: נדחתה (מוסתרת מהמורה)", details: { note, complaint: fix.requestText.slice(0, 300), via: opts.actor.via } });
  return { ...base, mode: "APPLY", summary: `OK: הערה ${opts.fixId} נדחתה.`, details: { note } };
}

/** הסרת גרסה פרטית (השורה → removed, הקובץ נשאר) */
export async function decideRemoveVersion(opts: { versionId: number; note: string; apply: boolean; actor: Actor }): Promise<{ mode: "DRY-RUN" | "APPLY"; summary: string }> {
  const note = opts.note?.trim();
  if (!note) throw new Error("חובה note — הסיבה");
  if (!opts.apply) return { mode: "DRY-RUN", summary: `DRY-RUN: גרסה פרטית #${opts.versionId} הייתה מסומנת removed (הקובץ נשאר בדרייב). להחלה: apply` };
  const ok = await removePrivateVersion(opts.versionId, { reason: note, actorId: opts.actor.actorId, source: opts.actor.source === "admin" ? "admin" : "claude", ip: opts.actor.ip });
  return { mode: "APPLY", summary: ok ? `OK: גרסה פרטית ${opts.versionId} הוסרה (הקובץ נשמר בדרייב, בתת-תיקיית "לא פעילות").` : `גרסה ${opts.versionId} לא נמצאה או כבר הוסרה.` };
}
