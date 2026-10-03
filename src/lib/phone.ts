/**
 * נרמול מספר טלפון ישראלי לספרות בלבד בפורמט מקומי (05XXXXXXXX / 0XXXXXXXX).
 * מקבל רווחים/מקפים/סוגריים וקידומת +972 / 972. מחזיר null אם אינו מספר ישראלי תקין.
 */
export function normalizeIsraeliPhone(raw: string): string | null {
  let d = raw.replace(/[\s\-().]/g, "");
  if (d.startsWith("+972")) d = "0" + d.slice(4);
  else if (d.startsWith("972")) d = "0" + d.slice(3);
  if (!/^\d+$/.test(d)) return null;
  // נייד: 05X + 7 ספרות (10 סה"כ). קווי/VoIP: 0 + 8 ספרות (9) או 07X + 7 (10).
  if (/^05\d{8}$/.test(d) || /^07\d{8}$/.test(d) || /^0[2-489]\d{7}$/.test(d)) return d;
  return null;
}

export const PHONE_ERROR = "מספר טלפון לא תקין (למשל 050-1234567)";
