/**
 * תצוגה חיה של נוסח חדש בחלון "עריכת שינויים": הדפדפן שולח לתצוגה המקדימה (/api/preview/[id]?draft=…) את הטקסט שסומן
 * והנוסח החדש שלפני שהתיקון נשלח, והדף נטען עם ההחלפה באותה צורה כמו ב"לצפייה בשינויים" (המקור מסומן והתיקון בתכלת).
 * הטקסט עובר כ-JSON בקידוד base64url (קצר יותר מ-percent-encoding בעברית). בלי תלות בשרת/בדפדפן – משמש את שניהם.
 */
export type DraftEdit = { q: string; c: string; o?: number };

const MAX_EDITS = 3;
const MAX_TEXT = 1500;
/** מעל זה כתובת הבקשה גדולה מדי והתצוגה החיה מדולגת */
export const MAX_DRAFT_PARAM = 7000;

export function encodeDraft(edits: DraftEdit[]): string | null {
  const clean = edits
    .filter((e) => e.q.trim().length >= 2 && e.c.trim().length > 0 && e.q.length <= MAX_TEXT && e.c.length <= MAX_TEXT)
    .slice(0, MAX_EDITS)
    .map((e) => ({ q: e.q.trim(), c: e.c.trim(), ...(e.o ? { o: e.o } : {}) }));
  if (clean.length === 0) return null;
  const bytes = new TextEncoder().encode(JSON.stringify(clean));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const out = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return out.length <= MAX_DRAFT_PARAM ? out : null;
}

export function decodeDraft(param: string | null): DraftEdit[] | null {
  if (!param || param.length > MAX_DRAFT_PARAM) return null;
  try {
    const b64 = param.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const list = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!Array.isArray(list)) return null;
    const out: DraftEdit[] = [];
    for (const x of list.slice(0, MAX_EDITS)) {
      if (!x || typeof x !== "object") continue;
      const { q, c, o } = x as Record<string, unknown>;
      if (typeof q !== "string" || typeof c !== "string") continue;
      if (q.trim().length < 2 || c.trim().length === 0 || q.length > MAX_TEXT || c.length > MAX_TEXT) continue;
      out.push({ q: q.trim(), c: c.trim(), ...(typeof o === "number" && Number.isInteger(o) && o > 0 ? { o } : {}) });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}
