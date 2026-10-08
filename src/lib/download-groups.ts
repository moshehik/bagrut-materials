import { and, count, eq, inArray } from "drizzle-orm";
import { materialServable } from "@/lib/data";
import { db } from "@/db";
import { categories, materials } from "@/db/schema";
import { classifyMaterial, type CardType } from "@/lib/material-card-types";
import { jerusalemIso } from "@/lib/hebrew-date";

/** שורת הורדה גולמית (אחרי join לחומר, ובלוח המנהלת גם למשתמשת) */
export type DlRow = {
  createdAt: Date;
  materialId: number;
  title: string;
  kind: "student_sheet" | "teacher_sheet" | "presentation" | "past_exam" | "tips" | "ideas" | "other";
  categoryId: number;
  userId?: number;
  userName?: string;
};

export type CalItem = {
  materialId: number;
  title: string;
  /** סוג ההורדה (שכפול לתלמידה, בוחן…); "forum" = פעילות בפורום; null = אחר */
  type: CardType | "forum" | null;
  time: string;
  /** שורת משנה (בפורום: באיזה שרשור) */
  sub?: string;
  /** קישור לפריט (בפורום: ההודעה המדויקת) */
  href?: string;
};

/** הורדות של אותה תיקייה באותו יום (ובלוח המנהלת – של אותה משתמשת) */
export type CalGroup = {
  dateIso: string;
  categoryId: number;
  /** שם התיקייה בלבד – מוצג בתא היום */
  folder: string;
  /** נתיב מלא (מקצוע › … › תיקייה) – מוצג ברשימת היום */
  chain: string;
  who?: string;
  /** הורדו כל הקבצים שבתיקייה (תיקייה שלמה) */
  whole: boolean;
  /** כמה קבצים יש בתיקייה בסך הכול */
  total: number;
  items: CalItem[];
  /** קבוצת פורום (תגובות/הודעות שפורסמו), לא הורדות */
  forum?: boolean;
  /** קישור לתיקייה/לפורום של היחידה */
  href?: string;
};

export const TYPE_ORDER: (CardType | "forum" | "other")[] = [
  "student",
  "teacher",
  "quiz",
  "quiz-answers",
  "exam",
  "exam-answers",
  "dictation",
  "discussions",
  "enrichment",
  "skills",
  "prep",
  "presentation",
  "events",
  "characters",
  "places",
  "alternative",
  "reflection",
  "workbook",
  "test",
  "forum",
  "other",
];

export const typeOf = (m: { title: string; kind: DlRow["kind"] }): CardType | null => classifyMaterial(m);
const typeKey = (t: CardType | "forum" | null) => t ?? "other";

const hhmm = (d: Date) =>
  d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });

/**
 * מקבץ הורדות לפי (יום, תיקייה[, משתמשת]) ומחליט אם הורדה תיקייה שלמה:
 * כל הקבצים הפעילים שבתיקייה (ולפחות שניים) הורדו באותו יום.
 * type – סינון לפי סוג ההורדה (נקבע אחרי ההכרעה "תיקייה שלמה", כך שהיא לא משתנה בסינון).
 */
export async function buildGroups(rows: DlRow[], opts: { withWho?: boolean; type?: string } = {}): Promise<CalGroup[]> {
  if (!rows.length) return [];
  const catIds = [...new Set(rows.map((r) => r.categoryId))];
  const [cats, totals] = await Promise.all([
    db.select({ id: categories.id, title: categories.title, parentId: categories.parentId }).from(categories),
    db
      .select({ categoryId: materials.categoryId, n: count() })
      .from(materials)
      .where(and(inArray(materials.categoryId, catIds), eq(materials.status, "active"), materialServable))
      .groupBy(materials.categoryId),
  ]);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const totalOf = new Map(totals.map((t) => [t.categoryId, Number(t.n)]));

  const chainOf = (id: number): string[] => {
    const out: string[] = [];
    let cur: number | null = id;
    let guard = 0;
    while (cur !== null && guard++ < 20) {
      const c = byId.get(cur);
      if (!c) break;
      out.unshift(c.title);
      cur = c.parentId;
    }
    return out;
  };

  const map = new Map<string, CalGroup & { _ids: Set<number>; _first: number }>();
  for (const r of rows) {
    const dateIso = jerusalemIso(r.createdAt);
    const key = `${dateIso}|${r.categoryId}|${opts.withWho ? (r.userId ?? 0) : 0}`;
    let g = map.get(key);
    if (!g) {
      const chain = chainOf(r.categoryId);
      g = {
        dateIso,
        categoryId: r.categoryId,
        folder: chain[chain.length - 1] ?? "תיקייה",
        chain: chain.join(" › "),
        who: opts.withWho ? r.userName : undefined,
        whole: false,
        total: totalOf.get(r.categoryId) ?? 0,
        items: [],
        _ids: new Set(),
        _first: r.createdAt.getTime(),
      };
      map.set(key, g);
    }
    g._ids.add(r.materialId);
    g.items.push({ materialId: r.materialId, title: r.title, type: typeOf(r), time: hhmm(r.createdAt) });
  }

  const out: CalGroup[] = [];
  for (const g of [...map.values()].sort((a, b) => a._first - b._first)) {
    g.whole = g.total >= 2 && g._ids.size >= g.total;
    if (opts.type) g.items = g.items.filter((i) => typeKey(i.type) === opts.type);
    if (!g.items.length) continue;
    const { _ids, _first, ...clean } = g;
    void _ids;
    void _first;
    out.push(clean);
  }
  return out;
}
