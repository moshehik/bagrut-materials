/**
 * בדיקת/חימום ציור-מחדש וקטורי של תמונות גוף ב-PDF (נטפרי מחליף כל תמונה ב-PDF; ר' docs/netfree.md, pdf-vectorize-images.ts).
 * לכל docx שברשימת _images-in-lessons-report.json (פלט scripts/find-images-in-docx.cjs): ממיר דרך Oracle האמיתי
 * (בלי הציור הוקטורי), מריץ vectorizePdfImages, שומר ל-_vec_pdf_out/ ומדווח עמודים / אובייקטי תמונה לפני-אחרי / בתים / שניות.
 * יבש לגמרי: לא מעלה כלום לדרייב/DB.
 *
 * הרצה:  npx tsx --conditions=react-server scripts/warm-pdf-cache.ts [חלק משם הקובץ ...] [--keep-orig]
 * (NODE_OPTIONS=--use-system-ca; env מ-.env.local)
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import fs from "fs";
import path from "path";
import { createHash } from "node:crypto";
import { PDFDocument, PDFName, PDFRawStream, PDFRef } from "pdf-lib";
import { convertOfficeToPdf } from "../src/lib/driveBridgeCore";
import { vectorizePdfImages } from "../src/lib/pdf-vectorize-images";

const ROOT = "חומרים מוכנים מחדש";
const OUT = "_vec_pdf_out";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function countImages(doc: PDFDocument): number {
  let n = 0;
  doc.context.enumerateIndirectObjects().forEach(([, o]: [PDFRef, unknown]) => {
    if (o instanceof PDFRawStream && String(o.dict.get(PDFName.of("Subtype"))) === "/Image") n++;
  });
  return n;
}

(async () => {
  const args = process.argv.slice(2);
  const keepOrig = args.includes("--keep-orig");
  const filters = args.filter((a) => !a.startsWith("--"));
  const report: { file: string }[] = JSON.parse(fs.readFileSync("_images-in-lessons-report.json", "utf8"));
  fs.mkdirSync(OUT, { recursive: true });
  const seen = new Map<string, string>(); // md5 של docx -> שורת סיכום (קבצים זהים מדלגים)
  for (const row of report) {
    const rel = row.file.replace(/\\/g, "/");
    if (filters.length && !filters.some((f) => rel.includes(f))) continue;
    const full = path.join(ROOT, rel);
    const bytes = fs.readFileSync(full);
    const md5 = createHash("md5").update(bytes).digest("hex");
    if (seen.has(md5)) {
      console.log(`SKIP (זהה ל-${seen.get(md5)}): ${rel}`);
      continue;
    }
    seen.set(md5, path.basename(rel));
    const base = path.basename(rel, ".docx");
    try {
      const t0 = Date.now();
      const before = await convertOfficeToPdf({ bytes, mimeType: DOCX, name: path.basename(rel), vectorizeImages: false });
      const tConv = (Date.now() - t0) / 1000;
      const docB = await PDFDocument.load(before);
      const pagesB = docB.getPageCount();
      const imgsB = countImages(docB);
      const t1 = Date.now();
      const stats = { timedOut: false };
      const per: string[] = [];
      const n = await vectorizePdfImages(docB, {
        stats,
        onImage: (i) => per.push(`${i.ref}:${i.w}x${i.h}:${i.ok ? Math.round(i.opsBytes / 1024) + "KB-ops" : i.reason}:${(i.ms / 1000).toFixed(1)}s`),
      });
      const after = await docB.save({ useObjectStreams: false });
      const tVec = (Date.now() - t1) / 1000;
      const docA = await PDFDocument.load(after);
      fs.writeFileSync(path.join(OUT, `${base}.pdf`), after);
      if (keepOrig) fs.writeFileSync(path.join(OUT, `${base}.orig.pdf`), before);
      console.log(
        `${rel}\n   pages ${pagesB}->${docA.getPageCount()}  images ${imgsB}->${countImages(docA)} (vectorized ${n})  bytes ${before.length}->${after.length}  convert ${tConv.toFixed(1)}s vectorize ${tVec.toFixed(1)}s${stats.timedOut ? "  TIMEDOUT" : ""}\n   ${per.join(" | ")}`,
      );
    } catch (e) {
      console.log(`FAIL ${rel}: ${e instanceof Error ? e.message : e}`);
    }
  }
  process.exit(0);
})().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
