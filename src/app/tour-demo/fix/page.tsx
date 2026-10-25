import type { Metadata } from "next";
import type { Material } from "@/db/schema";
import type { Entitlement } from "@/lib/data";
import { MaterialTypeCard } from "@/components/material-type-card";
import { TourFixSwap } from "@/components/tour-fix-swap";

export const metadata: Metadata = { title: "דוגמה לעריכת שינויים", robots: { index: false, follow: false } };

/**
 * דוגמה ציבורית לסיור באתר: אותה כרטיסייה ואותו חלון ״לעריכת שינויים בקובץ״ כמו בפרק האמיתי,
 * אבל על קובץ לדוגמה, ובלי שליחה לשרת (fixDemo). הסיור מפעיל אותם בעצמו.
 */
export default function TourDemoFixPage() {
  const material = {
    id: 1,
    title: "דף לתלמידה – דוגמה",
    fileName: "דוגמה.docx",
    kind: "student",
    access: "paid",
    price: 1500,
    allowDownload: true,
    allowPreview: false,
    status: "active",
    downloads: 0,
  } as unknown as Material;
  const owner: Entitlement = { ok: true, via: "single" };

  const card = (withFixes: boolean) => (
    <MaterialTypeCard
      material={material}
      entitlement={owner}
      bundleHref="/pricing"
      type="student"
      folderTitle="פרק לדוגמה"
      currentPath="/tour-demo/fix"
      plainViewSrc="/tour-demo-sample.pdf"
      fixesViewSrc="/tour-demo-sample-changes.pdf"
      fixDemo
      fixes={withFixes ? [{ number: 1, originalText: "הטעות שסימנת", correctedText: "התיקון שלך", own: true }] : []}
    />
  );

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <TourFixSwap before={card(false)} after={card(true)} />
    </div>
  );
}
