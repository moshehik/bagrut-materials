/**
 * מייצר את src/lib/mail-logo.generated.ts: לוגו האתר (כולל הכיתוב המקורי שלו) כשתי טבלאות HTML של תאים צבעוניים (פיקסל-ארט
 * עם דחיסת ריצות לפי שורה), להצגה בגוף מייל. למה: בלקוחות מייל אי אפשר SVG מוטבע (ג'ימייל מסיר), ותמונות מוחלפות/מטושטשות
 * בנטפרי; טבלה צבעונית היא HTML רגיל שעובד בכל לקוח וגם בנטפרי. מקור: word/media/logoLozHainyan.png (ארגומנט) או public/images/logo.png.
 *   - חלק עליון (בית + שעון + אגוזים): תאים של 2px, 12 צבעים;
 *   - חלק תחתון (הכיתוב "לו״ז העניין" + "בית לחומרי הבגרות"): תאים של 1px, 4 צבעים – חד יותר וזול בבייטים.
 * הרצה: node scripts/gen-mail-logo.cjs [נתיב ללוגו]   (מגבלת ג'ימייל: ~102KB למייל כולו – הפלט צריך להישאר קטן)
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SRC = process.argv[2] || path.join(__dirname, "..", "public", "images", "logo.png");
const WIDTH_PX = 280;

const hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/** אזור מהלוגו (יחסי 0..1) → טבלת תאים. cell = פיקסלים לתא, k = מספר צבעים */
async function region(meta, { x0, x1, y0, y1 }, cell, k, widthPx) {
  const crop = { left: Math.round(meta.width * x0), top: Math.round(meta.height * y0), width: Math.round(meta.width * (x1 - x0)), height: Math.round(meta.height * (y1 - y0)) };
  const COLS = Math.round(widthPx / cell);
  const ROWS = Math.round((COLS * crop.height) / crop.width);
  // דגימה פי 3 ואז "הכי כהה בתא" לקווים דקים: בלי זה הקווים הבהירים-דקים של הבית נעלמים בהקטנה (ממוצע מבהיר אותם)
  const S = 3;
  const big = await sharp(SRC).flatten({ background: "#ffffff" }).extract(crop).resize({ width: COLS * S, height: ROWS * S, fit: "fill", kernel: "lanczos3" }).removeAlpha().raw().toBuffer();
  const data = Buffer.alloc(COLS * ROWS * 3);
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      let sr = 0, sg = 0, sb = 0, dark = null, dl = 1e9;
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
        const p = ((y * S + dy) * COLS * S + (x * S + dx)) * 3;
        const r = big[p], g = big[p + 1], b = big[p + 2];
        sr += r; sg += g; sb += b;
        const l = lum(r, g, b);
        if (l < dl) { dl = l; dark = [r, g, b]; }
      }
      const n9 = S * S, avg = [sr / n9, sg / n9, sb / n9];
      const al = lum(avg[0], avg[1], avg[2]);
      // תא עם פיקסל כהה בהרבה מהממוצע = קו דק → מחזקים אותו
      const w = dl < al - 18 ? 0.65 : 0;
      const q = (y * COLS + x) * 3;
      data[q] = avg[0] * (1 - w) + dark[0] * w;
      data[q + 1] = avg[1] * (1 - w) + dark[1] * w;
      data[q + 2] = avg[2] * (1 - w) + dark[2] * w;
    }
  }
  const n = COLS * ROWS;
  const px = (i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
  const sample = [];
  for (let i = 0; i < n; i++) sample.push(px(i));
  let centers = [[255, 255, 255]];
  while (centers.length < k) {
    let best = null, bd = -1;
    for (const p of sample) {
      let m = 1e9;
      for (const c of centers) m = Math.min(m, (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2);
      if (m > bd) { bd = m; best = p; }
    }
    centers.push(best);
  }
  const assign = new Uint8Array(n);
  for (let it = 0; it < 10; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const p = px(i);
      let b = 0, bd = 1e9;
      for (let c = 0; c < centers.length; c++) {
        const d = (p[0] - centers[c][0]) ** 2 + (p[1] - centers[c][1]) ** 2 + (p[2] - centers[c][2]) ** 2;
        if (d < bd) { bd = d; b = c; }
      }
      assign[i] = b;
      sum[b][0] += p[0]; sum[b][1] += p[1]; sum[b][2] += p[2]; sum[b][3]++;
    }
    centers = centers.map((c, i) => (sum[i][3] ? [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]] : c));
    centers[0] = [255, 255, 255]; // רקע לבן = בלי bgcolor (שקוף על כרטיס המייל הלבן)
  }
  // קידוד קצר: מלבנים (colspan+rowspan) במקום ריצות, בלי מרכאות ובלי תגי סגירה (אופציונליים ב-HTML) – מקטין ~40% ומאפשר רזולוציה כפולה
  // תחת מגבלת ג'ימייל (~102KB). הרקע הלבן הוא גם מלבנים (תאים בלי bgcolor) כדי שהטבלה תישאר רציפה.
  const w = COLS * cell;
  const used = new Uint8Array(n);
  const rowsHtml = Array.from({ length: ROWS }, () => "");
  for (let r = 0; r < ROWS; r++) {
    for (let x = 0; x < COLS; x++) {
      if (used[r * COLS + x]) continue;
      const col = assign[r * COLS + x];
      let cw = 0;
      while (x + cw < COLS && !used[r * COLS + x + cw] && assign[r * COLS + x + cw] === col) cw++;
      let ch = 1;
      grow: while (r + ch < ROWS) {
        for (let i = 0; i < cw; i++) if (used[(r + ch) * COLS + x + i] || assign[(r + ch) * COLS + x + i] !== col) break grow;
        ch++;
      }
      for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) used[(r + j) * COLS + x + i] = 1;
      rowsHtml[r] += `<td${cw > 1 ? ` colspan=${cw}` : ""}${ch > 1 ? ` rowspan=${ch}` : ""}${col === 0 ? "" : ` bgcolor=${hex(centers[col])}`}>`;
    }
  }
  let html = `<table role=presentation dir=ltr cellpadding=0 cellspacing=0 border=0 align=center width=${w} style="width:${w}px;max-width:100%;margin:0 auto;border-collapse:collapse;font-size:0;line-height:0">`;
  html += `<tr height=1>${`<td width=${cell} height=1>`.repeat(COLS)}`; // שורת מידות קבועה לעמודות (לא כל לקוח מייל מכבד colgroup)
  for (let r = 0; r < ROWS; r++) html += `<tr height=${cell}>${rowsHtml[r]}`;
  html += "</table>";
  return { html, rows: ROWS, cols: COLS };
}

(async () => {
  const meta = await sharp(SRC).metadata();
  // פריסה בשתי עמודות (בלי תפר חוצה): שמאל = אגוזים + חצי הבית (2px) לכל הגובה; ימין = חצי הבית העליון (2px) ומתחתיו הכיתוב (1px, חד יותר)
  const half = WIDTH_PX / 2;
  const left = await region(meta, { x0: 0.04, x1: 0.5, y0: 0.03, y1: 0.86 }, 1, 7, half);
  const leftBottom = await region(meta, { x0: 0.04, x1: 0.5, y0: 0.86, y1: 0.97 }, 1, 4, half);
  const rightTop = await region(meta, { x0: 0.5, x1: 0.96, y0: 0.03, y1: 0.69 }, 1, 7, half);
  const rightBottom = await region(meta, { x0: 0.5, x1: 0.96, y0: 0.69, y1: 0.97 }, 1, 4, half);
  const html = `<table role="presentation" dir="ltr" cellpadding="0" cellspacing="0" border="0" align="center" width="${WIDTH_PX}" style="width:${WIDTH_PX}px;max-width:100%;margin:0 auto;border-collapse:collapse" aria-label="לו״ז העניין – בית לחומרי הבגרות"><tr><td valign="top" width="${half}">${left.html}${leftBottom.html}</td><td valign="top" width="${half}">${rightTop.html}${rightBottom.html}</td></tr></table>`;
  fs.writeFileSync(
    path.join(__dirname, "..", "src/lib/mail-logo.generated.ts"),
    "// קובץ שנוצר אוטומטית ע״י scripts/gen-mail-logo.cjs — לא לערוך ידנית.\n" + `export const MAIL_LOGO_HTML = ${JSON.stringify(html)};\n`,
  );
  console.log("left", left.cols + "x" + left.rows, "rightTop", rightTop.cols + "x" + rightTop.rows, "rightBottom", rightBottom.cols + "x" + rightBottom.rows, "html bytes", html.length);
})();
