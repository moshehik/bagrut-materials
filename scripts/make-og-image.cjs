/**
 * יוצר את תמונת השיתוף של האתר (public/images/og-image.png, 1200×630): רקע כחול כהה, הלוגו הלבן במרכז ומתחתיו הסיסמה בזהב.
 * רץ פעם אחת (פלט סטטי, בכתובת קבועה); להרצה מחדש: node scripts/make-og-image.cjs
 * הטקסט מצויר כנתיב SVG על ידי sharp עם גופן המערכת – מספיק לפלט חד-פעמי.
 */
const sharp = require("sharp");
const path = require("path");
const W = 1200, H = 630;
(async () => {
  const logo = await sharp(path.join(__dirname, "../public/images/logo-white.png")).resize({ width: 640 }).toBuffer();
  const lh = (await sharp(logo).metadata()).height;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#16244e"/>
    <rect x="22" y="22" width="${W - 44}" height="${H - 44}" rx="28" fill="none" stroke="#ffd45a" stroke-width="5"/>
    <text x="${W / 2}" y="${H - 92}" text-anchor="middle" direction="rtl" font-family="Arial, Segoe UI, sans-serif" font-size="46" fill="#ffd45a">מתמקדים בעיקר – שיעורים מוכנים למורות</text>
  </svg>`;
  await sharp(Buffer.from(svg))
    .composite([{ input: logo, left: Math.round((W - 640) / 2), top: Math.round((H - 120 - lh) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(__dirname, "../public/images/og-image.png"));
  console.log("ok", W, H);
})();
