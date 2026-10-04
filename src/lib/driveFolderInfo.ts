/**
 * "קובץ המידע" של תיקייה (_מידע.txt): טקסט שהאתר מייצר מה-DB — מה חסר בחבילת הפרק, מה נוסף ומתי,
 * היסטוריית שמות והעברות, ומה בארכיון. האתר מעלה אותו לתיקייה בדרייב (driveUpsertTextFile) ומאפשר הורדה.
 * בלי "server-only" (משמש גם סקריפטים).
 */
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { categories, materials, driveEvents } from "@/db/schema";
import { CORE_TYPES, coreTypeOf, categoryPathNames, type CatRow, type DriveItem, ARCHIVE_SUB } from "@/lib/driveTreeCore";

type MatRow = typeof materials.$inferSelect;
type EvRow = typeof driveEvents.$inferSelect;

export type InfoSnapshot = {
  cats: CatRow[];
  byId: Map<number, CatRow>;
  children: Map<number | null, CatRow[]>;
  mats: MatRow[];
  matsByCat: Map<number, MatRow[]>;
  events: EvRow[];
  folderToCat: Map<string, CatRow>;
};

export async function loadInfoSnapshot(opts: { events?: number } = {}): Promise<InfoSnapshot> {
  const evLimit = opts.events ?? 20000;
  const [cats, mats, events] = await Promise.all([
    db.select().from(categories),
    db.select().from(materials),
    evLimit > 0 ? db.select().from(driveEvents).orderBy(desc(driveEvents.createdAt)).limit(evLimit) : Promise.resolve([] as EvRow[]),
  ]);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const children = new Map<number | null, CatRow[]>();
  for (const c of cats) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c]);
  for (const l of children.values()) l.sort((a, b) => a.sort - b.sort || a.id - b.id);
  const matsByCat = new Map<number, MatRow[]>();
  for (const m of mats) matsByCat.set(m.categoryId, [...(matsByCat.get(m.categoryId) ?? []), m]);
  const folderToCat = new Map(cats.filter((c) => c.driveFolderId).map((c) => [c.driveFolderId!, c]));
  return { cats, byId, children, mats, matsByCat, events, folderToCat };
}

const STATUS: Record<string, string> = { draft: "טיוטה", active: "פעיל", suspended: "מושהה" };
const fmt = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }) : "—";
const kb = (n: number | null | undefined) => (n ? `${Math.max(1, Math.round(n / 1024))}KB` : "—");

/** האם התיקייה היא "תיקיית חבילה" (יש בה לפחות קובץ אחד מהסוגים הסטנדרטיים) ומה חסר בה. */
export function packageStatus(snap: InfoSnapshot, categoryId: number) {
  const mats = snap.matsByCat.get(categoryId) ?? [];
  const present = new Set(mats.map((m) => coreTypeOf(m.fileName)).filter(Boolean) as string[]);
  if (!present.size) return null;
  return { present, missing: CORE_TYPES.filter((t) => !present.has(t.key)) };
}

function descendantsWithMissing(snap: InfoSnapshot, categoryId: number | null) {
  const out: { cat: CatRow; missing: string[] }[] = [];
  const walk = (id: number | null) => {
    for (const c of snap.children.get(id) ?? []) {
      const st = packageStatus(snap, c.id);
      if (st && st.missing.length && !c.excluded) out.push({ cat: c, missing: st.missing.map((t) => t.label) });
      walk(c.id);
    }
  };
  walk(categoryId);
  return out;
}

function countTree(snap: InfoSnapshot, categoryId: number | null): { folders: number; files: number } {
  let folders = 0;
  let files = 0;
  const walk = (id: number | null) => {
    for (const c of snap.children.get(id) ?? []) {
      folders++;
      files += (snap.matsByCat.get(c.id) ?? []).length;
      walk(c.id);
    }
  };
  walk(categoryId);
  return { folders, files };
}

function folderLabel(snap: InfoSnapshot, id: string | null | undefined) {
  if (!id) return "—";
  const first = id.split(",")[0];
  const c = snap.folderToCat.get(first);
  if (c) return categoryPathNames(c.id, snap.byId).join(" / ");
  return first === "" ? "—" : `תיקייה ${first.slice(0, 8)}`;
}

const line = (ch = "─") => ch.repeat(60);

/** מייצר את טקסט קובץ המידע לקטגוריה (או לשורש האתר כשהערך null). */
export function renderFolderInfo(snap: InfoSnapshot, categoryId: number | null, now = new Date()): string {
  const L: string[] = [];
  const cat = categoryId ? snap.byId.get(categoryId) : null;
  const title = cat ? categoryPathNames(cat.id, snap.byId).join(" / ") : "כל האתר (שורש הארכיון)";
  L.push(line("═"), `מידע תיקייה — ${title}`, line("═"));
  L.push(`נוצר ע"י האתר: ${fmt(now)}   (הקובץ מתעדכן מהניהול: סייר הקבצים ← "העלה לדרייב")`);
  if (cat) L.push(`מזהה קטגוריה: #${cat.id} · slug: ${cat.slug}${cat.excluded ? " · לא נדרש בבחינה" : ""}${cat.ready ? " · סומן 'מוכן'" : ""}`);

  const tree = countTree(snap, categoryId);
  const direct = cat ? snap.matsByCat.get(cat.id) ?? [] : [];
  L.push("", `סיכום: ${direct.length} קבצים בתיקייה זו · ${tree.folders} תיקיות-משנה · ${tree.files} קבצים בכל הענף`);

  // --- מה חסר ---
  L.push("", line(), "מה חסר", line());
  const st = cat ? packageStatus(snap, cat.id) : null;
  if (st) {
    for (const t of CORE_TYPES) L.push(`  ${st.present.has(t.key) ? "✔" : "✖"} ${t.label}`);
    L.push(st.missing.length ? `\n  חסרים ${st.missing.length} מתוך ${CORE_TYPES.length} קבצי החבילה.` : "\n  החבילה הסטנדרטית שלמה.");
  } else if (cat && direct.length === 0) {
    L.push("  אין קבצים בתיקייה זו עדיין.");
  } else if (cat) {
    L.push("  בתיקייה אין קבצי חבילה סטנדרטיים (קבצים מסוג אחר), לכן לא נבדק מה חסר.");
  }
  const desc = descendantsWithMissing(snap, categoryId);
  if (desc.length) {
    const skip = cat ? categoryPathNames(cat.id, snap.byId).length : 0;
    L.push("", `  פרקים בענף עם חבילה חלקית (${desc.length}):`);
    for (const d of desc.slice(0, 120)) L.push(`   • ${categoryPathNames(d.cat.id, snap.byId).slice(skip).join(" / ")} — חסר: ${d.missing.join(", ")}`);
    if (desc.length > 120) L.push(`   … ועוד ${desc.length - 120}`);
  }

  // --- קבצים בתיקייה ---
  if (direct.length) {
    L.push("", line(), `קבצים בתיקייה (${direct.length})`, line());
    for (const m of [...direct].sort((a, b) => a.fileName.localeCompare(b.fileName, "he"))) {
      L.push(`• ${m.fileName}`);
      L.push(`    סטטוס: ${STATUS[m.status] ?? m.status} · גודל: ${kb(m.size)} · נוסף: ${fmt(m.createdAt)}`);
      if (m.driveOriginalName && m.driveOriginalName !== m.fileName) L.push(`    שם ישן בדרייב: ${m.driveOriginalName}`);
    }
  }

  // --- נוסף לאחרונה ---
  const scopeCats = new Set<number>();
  const collect = (id: number | null) => {
    for (const c of snap.children.get(id) ?? []) {
      scopeCats.add(c.id);
      collect(c.id);
    }
  };
  if (cat) scopeCats.add(cat.id);
  collect(categoryId);
  const recent = snap.mats.filter((m) => scopeCats.has(m.categoryId)).sort((a, b) => +b.createdAt - +a.createdAt).slice(0, 15);
  if (recent.length) {
    L.push("", line(), "נוסף לאחרונה", line());
    for (const m of recent) L.push(`  ${fmt(m.createdAt)} · ${m.fileName}${!cat ? `  [${categoryPathNames(m.categoryId, snap.byId).slice(-2).join(" / ")}]` : ""}`);
  }

  // --- היסטוריית שמות והעברות ---
  const matIds = new Set(snap.mats.filter((m) => scopeCats.has(m.categoryId)).map((m) => m.id));
  const kinds = ["file.edit", "file.rename", "file.move", "file.archive", "file.restore", "folder.rename", "folder.move", "folder.create", "file.add"];
  const hist = snap.events
    .filter((e) => kinds.includes(e.kind))
    .filter((e) => (e.materialId && matIds.has(e.materialId)) || (e.categoryId && scopeCats.has(e.categoryId)))
    .slice(0, cat ? 80 : 40);
  if (hist.length) {
    L.push("", line(), `היסטוריית שמות והעברות (${hist.length} אחרונות)`, line());
    for (const e of hist) {
      const who = e.materialId
        ? snap.mats.find((m) => m.id === e.materialId)?.fileName ?? `חומר #${e.materialId}`
        : e.categoryId
          ? snap.byId.get(e.categoryId)?.title ?? ""
          : "";
      const what: Record<string, string> = {
        "file.edit": `נערך ע"י הסוכן: "${e.oldValue}" ← "${e.newValue}"`,
        "file.rename": `שונה שם: "${e.oldValue}" ← "${e.newValue}"`,
        "file.move": `הועבר: ${folderLabel(snap, e.oldValue)} ← ${folderLabel(snap, e.newValue)}`,
        "file.archive": `הועבר לארכיון (${e.newValue}) — שם: "${e.oldValue}"`,
        "file.restore": `שוחזר מהארכיון — ${e.newValue ?? ""}`,
        "file.add": `נוסף: "${e.newValue}"`,
        "folder.rename": `שונה שם תיקייה: "${e.oldValue}" ← "${e.newValue}"`,
        "folder.move": `הועברה תיקייה: ${folderLabel(snap, e.oldValue)} ← ${folderLabel(snap, e.newValue)}`,
        "folder.create": `נוצרה תיקייה "${e.newValue}"`,
      };
      L.push(`  ${fmt(e.createdAt)} · ${who ? who + " — " : ""}${what[e.kind] ?? e.kind}`);
    }
  }

  // --- תיקיות משנה ---
  const kids = snap.children.get(categoryId) ?? [];
  if (kids.length) {
    L.push("", line(), `תיקיות משנה (${kids.length})`, line());
    for (const k of kids) {
      const ct = countTree(snap, k.id);
      const own = (snap.matsByCat.get(k.id) ?? []).length;
      const miss = descendantsWithMissing(snap, k.id).length + (packageStatus(snap, k.id)?.missing.length ? 1 : 0);
      L.push(`  📁 ${k.title} — ${own + ct.files} קבצים${miss ? ` · ${miss} פרקים עם חסר` : ""}`);
    }
  }
  L.push("", line("═"));
  return L.join("\n");
}

/** קובץ המידע של תיקיית הארכיון — לפי תוכן התיקייה בדרייב (תיאור הקובץ מכיל סיבה ומקום קודם). */
export function renderArchiveInfo(items: { sub: keyof typeof ARCHIVE_SUB; item: DriveItem }[], now = new Date()): string {
  const L = [
    line("═"),
    "מידע — ארכיון",
    line("═"),
    `נוצר ע"י האתר: ${fmt(now)}`,
    "",
    "קבצים שלא מקושרים לאף חומר באתר, גרסאות ישנות, או לא ברורים. לא נמחק דבר — אפשר לשחזר מהסייר.",
    "",
  ];
  for (const k of Object.keys(ARCHIVE_SUB) as (keyof typeof ARCHIVE_SUB)[]) {
    const list = items.filter((i) => i.sub === k);
    L.push(line(), `${ARCHIVE_SUB[k]} (${list.length})`, line());
    for (const { item } of [...list].sort((a, b) => a.item.name.localeCompare(b.item.name, "he"))) {
      L.push(`• ${item.name}  [${kb(item.size)} · עודכן ${fmt(item.modifiedTime)}]`);
      const reason = item.description?.split("\n").find((l) => l.startsWith("הועבר לארכיון:"));
      if (reason) L.push(`    ${reason}`);
    }
    L.push("");
  }
  return L.join("\n");
}
