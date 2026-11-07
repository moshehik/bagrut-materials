/**
 * מכווץ נתיב SVG של potrace (פקודות M/C/L/Z מוחלטות, 3 ספרות אחרי הנקודה) לנתיב יחסי ברזולוציה של 0.1 יחידה.
 * למה: שני האיורים הגדולים בדף יחידה (שכפול למורה/לתלמידה) היו 46KB ב-HTML ועוד 46KB ב-RSC; נטפרי מחזיק ומסרוק את כל המסמך
 * לפני שהוא מוצג. 0.1 יחידה ב-viewBox של 420 = פחות מ-0.04 פיקסל בתצוגה, ולכן אין הבדל נראה.
 * החישוב נעשה בעשיריות שלמות (מעגלים את הנקודות המוחלטות ורק אז מחסרים), כך שאין סחף שמצטבר לאורך הנתיב.
 */
function minifyPath(d) {
  const tokens = d.match(/[MCLZmclz]|-?\d*\.?\d+/g) || [];
  let i = 0;
  let cx = 0; // הנקודה הנוכחית בעשיריות
  let cy = 0;
  let sx = 0; // תחילת תת-הנתיב
  let sy = 0;
  let out = "";
  let lastCmd = "";
  const t = (v) => Math.round(parseFloat(v) * 10);
  const fmt = (n) => {
    // n בעשיריות → מחרוזת קצרה ("-3.2", "5", ".4")
    const neg = n < 0;
    const a = Math.abs(n);
    const whole = Math.floor(a / 10);
    const frac = a % 10;
    let s = frac ? (whole ? `${whole}.${frac}` : `.${frac}`) : `${whole}`;
    if (neg) s = "-" + s;
    return s;
  };
  const push = (cmd, nums) => {
    let s = cmd === lastCmd && cmd !== "m" ? "" : cmd;
    nums.forEach((n) => {
      const f = fmt(n);
      // רווח רק בין שני מספרים, ולא לפני מספר שלילי (המינוס כבר מפריד)
      if (/[0-9.]$/.test(s || out) && !f.startsWith("-")) s += " ";
      s += f;
    });
    out += s;
    lastCmd = cmd;
  };
  let cmd = "";
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === "Z" || cmd === "z") {
      out += "z";
      lastCmd = "z";
      cx = sx;
      cy = sy;
      continue;
    }
    if (cmd === "M") {
      const x = t(tokens[i++]);
      const y = t(tokens[i++]);
      // m הראשונה היא מוחלטת בפועל; לכן את הראשונה כותבים כ-M
      if (out === "") {
        push("M", [x, y]);
        lastCmd = "M";
      } else {
        push("m", [x - cx, y - cy]);
      }
      cx = sx = x;
      cy = sy = y;
      cmd = "L"; // זוגות נוספים אחרי M הם L
    } else if (cmd === "C") {
      const n = [0, 1, 2, 3, 4, 5].map(() => t(tokens[i++]));
      push("c", [n[0] - cx, n[1] - cy, n[2] - cx, n[3] - cy, n[4] - cx, n[5] - cy]);
      cx = n[4];
      cy = n[5];
    } else if (cmd === "L") {
      const x = t(tokens[i++]);
      const y = t(tokens[i++]);
      push("l", [x - cx, y - cy]);
      cx = x;
      cy = y;
    } else {
      throw new Error("פקודת נתיב לא נתמכת: " + cmd);
    }
  }
  return out;
}

module.exports = { minifyPath };
