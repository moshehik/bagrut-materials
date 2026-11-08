/** בדיקות ל-src/lib/reply-text.ts: npx tsx --test scripts/reply-text.test.ts */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mentionsSourceLibrary, sanitizeReplyForDisplay, validateReplyText } from "../src/lib/reply-text";

test("מזהה את שמות המקור האסורים (גם עם תחילית)", () => {
  for (const t of ["כפי שמופיע בספריא", "מתוך ספריא", "הספריה", "בספרייה", "(ספריא)", "מ-Sefaria", "sefaria", "וספריא", "באתר ספאריה"]) {
    assert.equal(mentionsSourceLibrary(t), true, t);
  }
});

test("לא תופס מילים תקינות דומות", () => {
  for (const t of ["ספריהם של חכמים", "ספרי דברים מביא", "בספרי הנביאים", "הספרים נוספו", "ספרייה" + "ם", "מפרשים נוספים: אבן עזרא ורמב\"ן"]) {
    assert.equal(mentionsSourceLibrary(t), false, t);
  }
});

test("validateReplyText דוחה עם הודעה בעברית ומאשר טקסט נקי", () => {
  const bad = validateReplyText("הדברים הובאו מפירוש אבן עזרא כפי שהוא מופיע בספריא.");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.error, /ספריא/);
  assert.deepEqual(validateReplyText("נוסף פירוש אבן עזרא לפסוק י״ב."), { ok: true });
});

test("הסרה בתצוגה: המשפט מהדוגמה של המורה", () => {
  assert.equal(
    sanitizeReplyForDisplay("הדברים הובאו מפירוש אבן עזרא כפי שהוא מופיע בספריא."),
    "הדברים הובאו מפירוש אבן עזרא.",
  );
});

test("הסרה בתצוגה: פסיק, 'מתוך', סוגריים", () => {
  assert.equal(sanitizeReplyForDisplay("נוסף הרמב״ן לפסוק ה, כפי שמובא בספריא."), "נוסף הרמב״ן לפסוק ה.");
  assert.equal(sanitizeReplyForDisplay("נוסף פירוש רש״י מתוך ספריא."), "נוסף פירוש רש״י.");
  assert.equal(sanitizeReplyForDisplay("נוסף פירוש רש״י (ספריא) לפסוק ג."), "נוסף פירוש רש״י לפסוק ג.");
  assert.equal(sanitizeReplyForDisplay("נוסף פירוש רש״י (מתוך ספריא) לפסוק ג."), "נוסף פירוש רש״י לפסוק ג.");
});

test("הסרה בתצוגה: לא נוגע בשאר המשפטים ובשורות אחרות", () => {
  const text = "נוסף האבן עזרא, כפי שהוא מופיע בספריא.\nבנוסף קוצרה שאלה 3.";
  assert.equal(sanitizeReplyForDisplay(text), "נוסף האבן עזרא.\nבנוסף קוצרה שאלה 3.");
});

test("שמרני: תבנית לא מוכרת – מחזיר את הטקסט המקורי; טקסט נקי – ללא שינוי; null נשאר null", () => {
  const odd = "ספריא היא המקור לכל הדברים שנוספו.";
  assert.equal(sanitizeReplyForDisplay(odd), odd);
  const clean = "קוצרה שאלה 3 ונוסף פירוש רש״י.";
  assert.equal(sanitizeReplyForDisplay(clean), clean);
  assert.equal(sanitizeReplyForDisplay(null), null);
  assert.equal(sanitizeReplyForDisplay(undefined), null);
});
