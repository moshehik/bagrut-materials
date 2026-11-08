/**
 * מייצר את docs/netfree-full-code.md: הקוד המלא של כל פתרונות נטפרי באתר – הורדות וצפיות (PDF, מצגות, סרטונים),
 * אייקונים ואלמנטים (SVG במקום תמונות), ומיילים – מעתיק את קבצי המקור כפי שהם (לא סיכום).
 * קבצים מחוללים ענקיים (נתוני SVG / לוגו) נכללים בקטע התחלה בלבד, עם ציון הגודל – הסקריפט שמחולל אותם כלול במלואו.
 * מריצים:  node scripts/gen-netfree-docs.cjs   (מחדש בכל שינוי בקבצים שברשימה)
 * הריפו ציבורי: הרשימה כוללת רק קוד, לא קבצי env / סודות / כתובות /exec.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "docs", "netfree-full-code.md");
/** קבצים שמעל הגודל הזה (בתווים) נכללים בקטע התחלה בלבד */
const HEAD_ONLY_OVER = 60_000;
const HEAD_CHARS = 2500;

const SECTIONS = [
  {
    title: "1. הורדות וצפיות – PDF, מצגות (חותמת מים, לוגו וקטורי, רקעי שקפים, מצב לפי מי שמורידה)",
    intro:
      "כל PDF עובר `stampPdf`. נטפרי מחליף תמונות בתוך PDF ב\"התמונה לא נבדקה\", ולכן: הלוגו מוחלף בציור וקטורי, רקעי שקפים הופכים לרשת הצללה (shading סוג 5), וחותמת המים היא נתיבי אותיות. מי שלא בנטפרי מקבל את התמונות המקוריות.",
    files: [
      "src/lib/watermark.ts",
      "src/lib/watermark-geometry.ts",
      "src/lib/pdf-vector-logo.ts",
      "scripts/gen-pdf-logo.cjs",
      "src/lib/pdf-logo.generated.ts",
      "src/lib/pdf-mesh-images.ts",
      "src/lib/pdf-sweep.ts",
      "src/lib/pdf-vectorize-images.ts",
      "src/lib/image-vectorize.ts",
      "src/lib/stream-bytes.ts",
      "src/lib/netfree-mode.ts",
      "src/lib/docx-table-fit.ts",
      "src/lib/docx-blank-lines.ts",
      "src/lib/docx-header-clearance.ts",
      "src/lib/docx-line-borders.ts",
      "src/lib/docx-nikud-compat.ts",
      "src/lib/docx-rtl-paragraphs.ts",
    ],
  },
  {
    title: "2. נתיבי ה-API של הורדה, תצוגה, תיקייה וסרטון",
    intro:
      "כל קובץ עובר דרך הדומיין שלנו (נטפרי חוסם דומיינים חיצוניים). זיפ של תיקייה: בקבצים נפרדים כברירת מחדל, מייל מפוצל לכמה זיפים מצורפים, שם קובץ `<שם> <קוד אישי>`.",
    files: [
      "src/app/api/download/[id]/route.ts",
      "src/app/api/download-folder/[id]/route.ts",
      "src/app/api/preview/[id]/route.ts",
      "src/app/api/material-video/[id]/route.ts",
      "src/app/api/sichot/video/[id]/route.ts",
      "src/components/folder-all-actions.tsx",
    ],
  },
  {
    title: "3. זיהוי נטפרי בדפדפן והודעות למשתמשת",
    intro:
      "אין API או כותרת מתועדים לזיהוי נטפרי. הבדיקה: בקשה לקובץ וידאו קטן – בנטפרי חוזר סטטוס 418 עם דף HTML. התוצאה נשמרת בקוקי `nf` ובדפדפן, והשרת משתמש בה בהורדת מצגות.",
    files: [
      "src/lib/netfree-probe.ts",
      "src/components/netfree-detector.tsx",
      "src/components/netfree-notice.tsx",
      "src/components/netfree-download-gate.tsx",
      "src/components/sichot/sicha-video-viewer.tsx",
      "src/components/pdf-viewer.tsx",
      "public/netfree-test/detect.html",
    ],
  },
  {
    title: "4. סרטונים: שיתוף דרייב פר-משתמשת (רסיסים)",
    intro: "קישור דרייב ששותף למשתמשת מסוימת לא נחסם אוטומטית בנטפרי (קישור ציבורי נחסם). שיתוף ברסיסים של עותקי שרת כשיש תקרה למספר המשתמשות לקובץ.",
    files: ["src/lib/drive-share.ts", "src/lib/drive-share-core.ts", "scripts/create-video-share-tables.ts"],
  },
  {
    title: "5. אייקונים ואלמנטים: SVG במקום תמונות",
    intro:
      "נטפרי חוסם תמונות שאינן קובץ רגיל בכתובת קבועה. איורי קו הופכים ל-SVG מוטמע (`evenodd`), איורים צבעוניים לרשימת כתמים, והתמונות הרגילות נשארות קבצים בכתובת יציבה. אין data URI.",
    files: [
      "scripts/gen-line-icons.cjs",
      "src/lib/line-icons.generated.ts",
      "src/components/line-icon.tsx",
      "src/components/line-icon-client.tsx",
      "src/components/card-icons.tsx",
      "scripts/gen-colour-svgs.cjs",
      "src/lib/colour-svgs.generated.ts",
      "src/components/colour-svg.tsx",
      "src/app/error.tsx",
      "public/netfree-test/all-images.html",
    ],
  },
  {
    title: "6. מיילים",
    intro:
      "בלי תמונות במייל (נטפרי והג'ימייל מסננים תמונות): כותרת טקסט, קו כ-border, לוגו כטבלת HTML של תאים צבעוניים. שליחה דרך Apps Script עם גיבוי למכסה (`MAIL_SCRIPT_URL_2`); קישורי המייל תמיד לכתובת האתר החי.",
    files: [
      "src/lib/mail.ts",
      "scripts/gen-mail-logo.cjs",
      "src/lib/mail-logo.generated.ts",
      "docs/google-apps-script.gs",
      "docs/mail-script.md",
      "scripts/send-admin-mail.cjs",
    ],
  },
];

const EXTRA_CSS = {
  title: "7. עיצוב ההודעות (קטע CSS)",
  file: "src/app/globals.css",
  // קטע ה-CSS של הודעות נטפרי (.nf-*) ושל חלון הצפייה
  from: "/* הודעת \"הצפייה בסרטון חסומה בסינון\"",
  to: "/* פסי גלילה אלגנטיים בחלונות",
};

function lang(file) {
  const ext = path.extname(file).slice(1);
  return { ts: "ts", tsx: "tsx", cjs: "js", js: "js", md: "md", gs: "js", html: "html", css: "css" }[ext] || "";
}

function block(file, text, note) {
  const fence = text.includes("```") ? "~~~~" : "```";
  return `### \`${file}\`${note ? `  _(${note})_` : ""}\n\n${fence}${lang(file)}\n${text.replace(/\s+$/, "")}\n${fence}\n`;
}

let out = `# נטפרי – הקוד המלא של כל הפתרונות באתר

> נוצר אוטומטית על ידי \`node scripts/gen-netfree-docs.cjs\` (${new Date().toISOString().slice(0, 10)}). זה העתק של קבצי המקור כפי שהם, לא סיכום.
> הסבר, טבלאות ממצאים והנימוקים: [netfree-techniques.md](netfree-techniques.md) ו-[netfree.md](netfree.md).
> קבצים מחוללים גדולים נכללים בקטע התחלה בלבד; הסקריפט שמחולל אותם כלול במלואו.

## תוכן עניינים
${SECTIONS.map((s) => `- ${s.title}`).join("\n")}
- ${EXTRA_CSS.title}
`;

const missing = [];
let total = 0;
for (const sec of SECTIONS) {
  out += `\n---\n\n## ${sec.title}\n\n${sec.intro}\n\n`;
  for (const f of sec.files) {
    const full = path.join(ROOT, f);
    if (!fs.existsSync(full)) {
      missing.push(f);
      out += `### \`${f}\`  _(לא קיים בריפו)_\n\n`;
      continue;
    }
    let text = fs.readFileSync(full, "utf8").replace(/\r\n/g, "\n");
    total += text.length;
    if (text.length > HEAD_ONLY_OVER && /\.generated\./.test(f)) {
      out += block(f, text.slice(0, HEAD_CHARS) + "\n… [נקטע: " + text.length.toLocaleString("en") + " תווים בקובץ המלא – נוצר מהסקריפט שלמעלה]", "קובץ מחולל – התחלה בלבד");
    } else {
      out += block(f, text);
    }
    out += "\n";
  }
}

out += `\n---\n\n## ${EXTRA_CSS.title}\n\n`;
{
  const css = fs.readFileSync(path.join(ROOT, EXTRA_CSS.file), "utf8").replace(/\r\n/g, "\n");
  const a = css.indexOf(EXTRA_CSS.from);
  const b = css.indexOf(EXTRA_CSS.to, a + 1);
  out += a >= 0 && b > a ? block(EXTRA_CSS.file, css.slice(a, b), "הקטע של .nf-* בלבד") : "_(הקטע לא נמצא)_\n";
}

fs.writeFileSync(OUT, out);
console.log("written", path.relative(ROOT, OUT), (out.length / 1024).toFixed(0) + "KB", "sources", (total / 1024).toFixed(0) + "KB", missing.length ? "missing: " + missing.join(", ") : "");
