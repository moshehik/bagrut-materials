/** npx tsx --conditions=react-server --test scripts/seo.test.ts  (mail.ts מייבא server-only) */
import test from "node:test";
import assert from "node:assert/strict";
import { absoluteUrl, breadcrumbJsonLd, homeJsonLd, jsonLdString, pageSeo, siteOrigin } from "../src/lib/seo";

test("כתובות: מוחלטות, בלי סלאש כפול ובלי סלאש בסוף", () => {
  assert.ok(!siteOrigin().endsWith("/"));
  assert.equal(absoluteUrl("/"), siteOrigin());
  assert.equal(absoluteUrl("/subjects/torah"), `${siteOrigin()}/subjects/torah`);
  assert.equal(absoluteUrl("map"), `${siteOrigin()}/map`);
});

test("JSON-LD: '<' מוברח כך שמחרוזת בתוכן לא סוגרת את תג ה-script", () => {
  const s = jsonLdString({ name: "</script><script>alert(1)</script>" });
  assert.ok(!s.includes("<"));
  assert.equal(JSON.parse(s).name, "</script><script>alert(1)</script>");
});

test("פירורי לחם: מיקום רץ מ-1, הדף הראשון הוא דף הבית, כתובות מוחלטות", () => {
  const b = breadcrumbJsonLd([{ name: "תורה", path: "/subjects/torah" }, { name: "בא", path: "/subjects/torah/bo" }]);
  assert.deepEqual(b.itemListElement.map((i) => i.position), [1, 2, 3]);
  assert.equal(b.itemListElement[0].item, absoluteUrl("/"));
  assert.equal(b.itemListElement[2].item, absoluteUrl("/subjects/torah/bo"));
});

test("דף הבית: ארגון + אתר עם שמות חלופיים ושפה, מקושרים ב-@id", () => {
  const [org, site] = homeJsonLd() as Record<string, unknown>[];
  assert.equal(org["@type"], "Organization");
  assert.equal(site["@type"], "WebSite");
  assert.equal(site.inLanguage, "he-IL");
  assert.ok(Array.isArray(site.alternateName) && (site.alternateName as string[]).length >= 2);
  assert.deepEqual(site.publisher, { "@id": org["@id"] });
});

test("pageSeo: קנוני בלי פרמטרים, תמונת שיתוף נשמרת ב-openGraph של העמוד", () => {
  const m = pageSeo({ title: "בא · תורה", path: "/subjects/torah/bo", description: "תיאור" });
  assert.equal(m.alternates.canonical, "/subjects/torah/bo");
  assert.equal(m.openGraph.url, "/subjects/torah/bo");
  assert.ok(m.openGraph.images[0].url.endsWith("og-image.png"));
  assert.ok(pageSeo({ title: "x", path: "/x" }).description.length > 20, "בלי תיאור – תיאור ברירת המחדל");
});
