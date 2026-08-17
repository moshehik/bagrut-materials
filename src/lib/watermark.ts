import "server-only";
import { PDFDocument, rgb, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SITE_NAME } from "./constants";

let fontBytes: Uint8Array | null = null;
async function loadFont() {
  if (!fontBytes) {
    fontBytes = await readFile(
      path.join(process.cwd(), "src", "assets", "fonts", "Alef-Regular.ttf"),
    );
  }
  return fontBytes;
}

/** מסדר טקסט עברי לתצוגה ויזואלית (pdf-lib לא מבצע bidi) */
function visualHebrew(s: string) {
  // מפצל למקטעים של עברית / לא-עברית, הופך את סדר המקטעים ואת האותיות העבריות
  const tokens = s.match(/[֐-׿\s]+|[^֐-׿\s]+|\s+/g) ?? [s];
  return tokens
    .map((t) => (/[֐-׿]/.test(t) ? [...t].reverse().join("") : t))
    .reverse()
    .join("");
}

export type StampInfo = {
  personalCode: string;
  userName: string;
  email: string;
};

/**
 * מטביע על כל עמוד ב-PDF: שם האתר + כל הזכויות שמורות + מספר אישי של המורידה.
 * החתימה האישית מאפשרת זיהוי אם הקובץ מועבר הלאה.
 */
export async function stampPdf(input: Uint8Array | ArrayBuffer, info: StampInfo) {
  const pdf = await PDFDocument.load(input, { ignoreEncryption: true });
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await loadFont(), { subset: true });

  // המספר האישי נשאר מחוץ למחרוזת העברית כדי שלא יתהפך; בהיפוך ויזואלי הוא יופיע בסוף המשפט (בצד שמאל)
  const footer =
    visualHebrew(`© ${SITE_NAME} – כל הזכויות שמורות. אין להעביר לאחר. הורד ע"י מנויה מס'`) +
    ` ${info.personalCode}`;
  const diagonal = `${info.personalCode}  •  ${info.email}`;

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();

    // כותרת תחתונה קטנה
    const fs = 8;
    const tw = font.widthOfTextAtSize(footer, fs);
    page.drawText(footer, {
      x: Math.max(12, (width - tw) / 2),
      y: 10,
      size: fs,
      font,
      color: rgb(0.35, 0.35, 0.45),
    });

    // סימן מים אלכסוני שקוף עם המספר האישי
    const dfs = Math.max(18, Math.min(width, height) / 18);
    const dw = font.widthOfTextAtSize(diagonal, dfs);
    page.drawText(diagonal, {
      x: width / 2 - dw / 2.6,
      y: height / 2 - dfs,
      size: dfs,
      font,
      color: rgb(0.2, 0.4, 0.8),
      opacity: 0.09,
      rotate: degrees(32),
    });

    // מספר אישי קטן בפינה העליונה
    page.drawText(`#${info.personalCode}`, {
      x: 12,
      y: height - 16,
      size: 7,
      font,
      color: rgb(0.5, 0.5, 0.55),
      opacity: 0.8,
    });
  }

  pdf.setProducer(SITE_NAME);
  pdf.setSubject(`Licensed to ${info.personalCode}`);
  pdf.setKeywords([SITE_NAME, info.personalCode]);
  return pdf.save();
}
