import { notFound } from "next/navigation";
import type { Material } from "@/db/schema";
import type { Entitlement } from "@/lib/data";
import { CARD_ROWS, EXTRA_TYPES, type CardType } from "@/lib/material-card-types";
import { MaterialTypeCard } from "@/components/material-type-card";
import { ForumCard } from "@/components/forum-card";
import { FolderBundleBanner } from "@/components/folder-bundle-banner";

export const dynamic = "force-dynamic";

/** עמוד דוגמה לעיצוב הכרטיסיות עם נתוני דמה – זמין רק בפיתוח מקומי, לא באתר החי */
export default function CardPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const fake = (id: number, title: string, price = 1500): Material =>
    ({
      id,
      title,
      fileName: "דמו.docx",
      kind: "other",
      access: "paid",
      price,
      allowDownload: true,
      allowPreview: false,
      status: "active",
      downloads: 0,
    }) as unknown as Material;

  const buyer: Entitlement = { ok: false, reason: "purchase" };
  const owner: Entitlement = { ok: true, via: "single" };
  const folder = "פרק י״ד";

  // כל הסוגים; בשורה הראשונה והשנייה חסרים סוגים בכוונה, כדי להראות "לא בכל קובץ יש מהכל"
  const all = CARD_ROWS.flat();
  const idOf = (t: CardType) => all.indexOf(t) + 1;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl font-black">דוגמת כרטיסיות – {folder}</h1>
      <p className="mt-2 text-muted">נתוני דמה בלבד. עמוד זה לא קיים באתר החי.</p>

      <h2 className="mt-10 text-xl font-bold">כך נראית כרטיסייה של קובץ שכבר נעשו בו תיקונים (מי שרכשה)</h2>
      <div className="mt-8 mtc-grid">
        <MaterialTypeCard
          material={fake(300, "student")}
          entitlement={owner}
          bundleHref="/checkout?bundle=1"
          type="student"
          folderTitle={folder}
          currentPath="/card-preview"
          fixesViewSrc="/_demo/view-with-changes.pdf"
          plainViewSrc="/_demo/plain.pdf"
          fixes={[
            { number: 1, originalText: "ירד אל מצרים", correctedText: "ירד אל ארץ גושן" },
            { number: 2, originalText: "בשנת ג׳תתק״ד", correctedText: "בשנת ג׳תתקצ״ד" },
            { number: 3, originalText: "המלך שלח את שליחיו", correctedText: "המלך שלח את שריו" },
          ]}
        />
      </div>

      <h2 className="mt-10 text-xl font-bold">כך רואה מי שעוד לא רכשה</h2>
      <div className="mt-6">
        <FolderBundleBanner categoryId={1} price={1500} owned={false} />
      </div>
      <div className="mt-8 mtc-grid">
        {CARD_ROWS.flatMap((row) =>
          [...row, ...(row.length < 2 ? ["pad" as const] : [])].map((t) =>
            t === "pad" ? (
              <div key={`pad-${row[0]}`} aria-hidden className="hidden md:block" />
            ) : (
              <MaterialTypeCard
                key={t}
                material={fake(0 + idOf(t), t, 1500 + idOf(t) * 100)}
                entitlement={buyer}
                bundleHref="/checkout?bundle=1"
                type={t}
                folderTitle={folder}
                currentPath="/card-preview"
              />
            ),
          ),
        )}
        <ForumCard folderTitle={folder} />
      </div>

      <h2 className="mt-14 text-xl font-bold">סוגים נוספים (אירועים, דמויות, מקומות, הערכה חלופית ועוד)</h2>
      <div className="mt-8 mtc-grid">
        {EXTRA_TYPES.map((t, i) => (
          <MaterialTypeCard
            key={t}
            material={fake(500 + i, t === "generic" ? "דף עזר לסימן נב (1)" : t === "test" ? "מבחן מחצית א בדינים" : t === "alternative" ? "הערכה חלופית - מגילת אסתר פרק ב" : t === "workbook" ? "מגילת רות - חוברת עבודה מלאה (פרקים א-ד + רפלקציה)" : t === "reflection" ? "רפלקציה מסכמת - מגילת אסתר" : `${t === "events" ? "אירועים" : t === "characters" ? "דמויות" : "מקומות"} - שמואל ב`)}
            entitlement={buyer}
            bundleHref="/checkout?bundle=1"
            type={t}
            folderTitle={folder}
            currentPath="/card-preview"
          />
        ))}
      </div>

      <h2 className="mt-14 text-xl font-bold">כך רואה מי שיש לה מנוי או שכבר רכשה את התיקייה</h2>
      <div className="mt-6">
        <FolderBundleBanner categoryId={1} price={1500} owned={true} />
      </div>
      <div className="mt-8 mtc-grid">
        {CARD_ROWS.flatMap((row) =>
          [...row, ...(row.length < 2 ? ["pad" as const] : [])].map((t) =>
            t === "pad" ? (
              <div key={`pad-${row[0]}`} aria-hidden className="hidden md:block" />
            ) : (
              <MaterialTypeCard
                key={t}
                material={fake(100 + idOf(t), t, 1500 + idOf(t) * 100)}
                entitlement={owner}
                bundleHref="/checkout?bundle=1"
                type={t}
                folderTitle={folder}
                currentPath="/card-preview"
              />
            ),
          ),
        )}
        <ForumCard folderTitle={folder} />
      </div>

    </div>
  );
}
