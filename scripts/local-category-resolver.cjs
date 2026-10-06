// resolver: local relative path (under "חומרים מוכנים מחדש") -> categoryId
/**
 * מיפוי נתיב קובץ מקומי (יחסית ל"חומרים מוכנים מחדש/") ← קטגוריה באתר (categoryId).
 * נבדק מול יומן הייבוא של 14.9.2026: 1,178 קבצים נכונים, 0 שגויים. cats = [{id,parent,title,path:string[]}].
 */
module.exports = function makeResolver(cats) {
const nrm = (s) => s.normalize("NFC").replace(/[-‎‏]/g, "").replace(/["'׳״`’“”]/g, "").replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
const LET = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90, ק: 100, ר: 200, ש: 300, ת: 400 };
const FIN = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };
const num = (t) => [...t.replace(/[^א-ת]/g, "").replace(/[ךםןףץ]/g, (c) => FIN[c])].reduce((a, c) => a + (LET[c] || 0), 0);
const chapRange = (t) => {
  const q = nrm(t);
  const m = q.match(/פרק(?:ים)?\s+([א-ת]+(?:-[א-ת]+)*(?:,\s*[א-ת]+(?:-[א-ת]+)*)*)/);
  if (!m) return null;
  const ns = m[1].split(/\s*[-,]\s*/).map(num);
  return [ns[0], ns[ns.length - 1]];
};
const strip = (s) => nrm(s).replace(/\([^)]*\)/g, "").replace(/ - .*$/, "").replace(/^פרשת /, "").replace(/^פרק /, "").trim();
const words = (s) => new Set(strip(s).split(/[ \/>]+/).filter((w) => w.length > 1));
const catN = cats.map((c) => ({ ...c, pn: c.path.map(nrm), leaf: strip(c.title), cr: /^פרק/.test(nrm(c.title)) ? chapRange(c.title) : chapRange(c.title), pathText: nrm(c.path.join(" > ")) }));
const byId = new Map(cats.map((c) => [c.id, c]));

// ---- overrides: [regex on dir path, categoryId | function] ----
const OVERRIDES = [
  [/^נביא\/נביא 5 יחידות\/מלכים א\/פרק ג-ד$/, 531],
  [/^נביא\/נביא 5 יחידות\/מלכים א\/פרק ה-ו$/, 532],
  [/^נביא\/נביא 5 יחידות\/מלכים ב\/פרק ד-ה$/, 537],
  [/^נביא\/נביא 5 יחידות\/מלכים ב\/פרק ד$/, 536],
  [/^תורה 5 יחידות\/חומש דברים חיצוני\/ואתחנן\/מבחן$/, 449],
  [/^תורה 5 יחידות\/חומש בראשית חיצוני$/, 428],
  [/^תורה 5 יחידות\/חומש ויקרא חלופה 2 פנימית\/בקיאות בחומש ויקרא\//, 1087],
  [/^נביא\/נביא הערכה חילופית\/[^/]+\/בקיאות\//, 526],
  [/^תורה 5 יחידות\/חומש דברים חיצוני\/דברים\/מבחן על פרקים ב וג$/, 445],
  [/^תורה 5 יחידות\/חומש דברים חיצוני\/דברים\/מבחן פרק א$/, 446],
  [/^תורה 5 יחידות\/חומש דברים חיצוני\/הקדמת הרמבן$/, 444],
  [/^תורה 5 יחידות\/חומש דברים חיצוני\/ואתחנן$/, 449],
  [/^כתובים\/חלופות כתובים\/מגילת אסתר\/(חוברת עבודה מלאה|רפלקציה מסכמת[^/]*|)$/, 589],
  [/^כתובים\/חלופות כתובים\/מגילת רות\/(חוברת עבודה מלאה|רפלקציה מסכמת[^/]*|)$/, 584],
];

function track(rel) {
  return {
    u3: /3 יחידות/.test(rel),
    u5: /5 יחידות/.test(rel),
    alt: /חלופות כתובים/.test(rel),
    hear: /נביא הערכה חילופית/.test(rel),
    int: /פנימית/.test(rel),
    ext: /חיצונ/.test(rel),
  };
}

function resolve(rel) {
  const parts = rel.split("/");
  const dirs = parts.slice(0, -1);
  const dirPath = dirs.join("/");
  for (const [re, id] of OVERRIDES) if (re.test(dirPath)) return { cat: id, path: byId.get(id).path.join(" > "), note: "override" };

  const leafRaw = dirs[dirs.length - 1];
  const leaf = strip(leafRaw);
  const fr = chapRange(leafRaw);
  const anc = dirs.slice(0, -1);
  const ancW = new Set(anc.flatMap((a) => [...words(a)]));
  const parentStrip = anc.length ? strip(anc[anc.length - 1]) : "";
  const tr = track(rel);
  const leafIsChapter = /^פרק/.test(nrm(leafRaw));
  if (!leafIsChapter && fr && tr.hear) {
    const hc = catN.filter((c) => c.cr && c.cr[0] === fr[0] && c.cr[1] === fr[1] && /הערכה בית ספרית - נביאים ראשונים/.test(c.pathText));
    const pb = hc.filter((c) => c.pn.slice(0, -1).map(strip).includes(parentStrip));
    const pick = pb.length === 1 ? pb : hc;
    if (pick.length === 1) return { cat: pick[0].id, path: pick[0].path.join(" > "), note: "topic-range" };
    return { why: "נושא בהערכה חילופית לא חד-משמעי", cands: pick.map((x) => x.id + ":" + x.title) };
  }
  const restrict = /חלופה שלישית לפנימית/.test(rel) ? /בגרות 3 יחידות/ : /חומש במדבר חלופה שלישית/.test(rel) ? /בגרות 5 יחידות/ : null;
  const cands = catN.filter((c) => (!restrict || restrict.test(c.pathText)) && ((leafIsChapter && fr && c.cr && c.cr[0] === fr[0] && c.cr[1] === fr[1] && (/^פרק/.test(nrm(leafRaw)) ? /^פרק/.test(nrm(c.title)) : true)) || c.leaf === leaf));
  if (!cands.length) return { why: "אין צומת בשם/טווח פרק תואם", leaf: leafRaw };
  const score = (c) => {
    let s = 0;
    const pw = new Set(c.pn.flatMap((x) => [...words(x)]));
    for (const w of ancW) if (pw.has(w)) s++;
    const T = c.pathText;
    // direct parent/book match (exact, handles "מלכים א" vs "מלכים ב")
    const ancestorsStripped = c.pn.slice(0, -1).map(strip);
    if (parentStrip && ancestorsStripped.includes(parentStrip)) s += 6;
    if (parentStrip && ancestorsStripped[ancestorsStripped.length - 1] === parentStrip) s += 3;
    // צומת "משותף" (כותרת כמו "שאלון חיצוני (3 ו-5 יח"ל)") שייך לשני המסלולים – לא מענישים ולא מתגמלים לפיו
    const shared = /3 ו-?5 יח/.test(T);
    if (tr.u3 && (/3 יח/.test(T) || shared)) s += 3;
    if (tr.u3 && /5 יח/.test(T) && !shared) s -= 3;
    if (tr.u5 && !tr.u3 && (/5 יח|בגרות 5/.test(T) || shared)) s += 3;
    if (tr.u5 && !tr.u3 && /3 יח/.test(T) && !shared && !/5 יח|בגרות 5/.test(T)) s -= 3;
    if (tr.alt && /חלופות כתובים/.test(T)) s += 3;
    if (tr.hear && /הערכה בית ספרית/.test(T)) s += 3;
    if (tr.int && /פנימית|הערכה בית ספרית/.test(T)) s += 2;
    if (tr.ext && /חיצונ/.test(T)) s += 2;
    if (tr.ext && /פנימית|הערכה בית ספרית/.test(T) && !/חיצונ/.test(T)) s -= 2;
    const top = nrm(parts[0]).replace(/ .*$/, "");
    if (!T.startsWith(top)) s -= 5;
    return s;
  };
  const sc = cands.map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s);
  const top = sc.filter((x) => x.s === sc[0].s);
  if (top.length === 1) return { cat: top[0].c.id, score: top[0].s, path: top[0].c.path.join(" > ") };
  const dm = Math.max(...top.map((x) => x.c.path.length));
  const deep = top.filter((x) => x.c.path.length === dm);
  if (deep.length === 1) return { cat: deep[0].c.id, score: deep[0].s, path: deep[0].c.path.join(" > "), note: "deepest" };
  return { why: "מועמדים רבים", cands: top.map((x) => x.c.id + ":" + x.c.path.slice(1).join(">")).slice(0, 5) };
}
return { resolve, nrm, byId };
};
