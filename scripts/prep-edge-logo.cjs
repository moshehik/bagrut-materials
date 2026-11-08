/**
 * מכין את public/images/edge-logo.png מסמל Microsoft Edge שהמורה סיפקה: מסיר את הרקע הלבן (הצפה מהשוליים: פיקסלים בהירים שמחוברים לשוליים הופכים לשקופים,
 * כולל החור של ה-"e" שפתוח כלפי חוץ), וממזער ל-256px. אחר כך scripts/gen-colour-svgs.cjs הופך אותו ל-SVG מוטמע (נטפרי חוסם תמונות).
 * הרצה: node scripts/prep-edge-logo.cjs <נתיב-לתמונת-המקור>
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

(async () => {
  const src = process.argv[2];
  if (!src || !fs.existsSync(src)) throw new Error("חסר נתיב לתמונת המקור");
  const SIZE = 256;
  const { data, info } = await sharp(src).ensureAlpha().resize(SIZE, SIZE, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } }).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const isLight = (i) => data[i * 4 + 3] < 40 || (data[i * 4] > 235 && data[i * 4 + 1] > 235 && data[i * 4 + 2] > 235);
  const bg = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (bg[i] || !isLight(i)) return;
    bg[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % W, y = (i / W) | 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  for (let i = 0; i < W * H; i++) if (bg[i]) data[i * 4 + 3] = 0;
  // החלקת שפה: פיקסל אטום שצמוד לרקע שקוף – אלפא חלקי (מונע שולי לבן)
  const out = Buffer.from(data);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (bg[i]) continue;
      let n = 0;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (bg[j]) n++;
      if (n && data[i * 4] > 200 && data[i * 4 + 1] > 200 && data[i * 4 + 2] > 200) out[i * 4 + 3] = 0;
    }
  }
  const dest = path.join(__dirname, "..", "public", "images", "edge-logo.png");
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png().toFile(dest);
  console.log("written", dest, "transparent px", bg.reduce((a, b) => a + b, 0));
})();
