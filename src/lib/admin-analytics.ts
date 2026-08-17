/** עזרים משותפים לעמודי הניתוח בניהול (ללא תלות בשרת) */

export type SP = Record<string, string | string[] | undefined>;

export function sp1(sp: SP, key: string): string {
  const v = sp[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export function spInt(sp: SP, key: string, def = 0): number {
  const n = parseInt(sp1(sp, key), 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

/** מפרש תאריך מ-input[type=date] (YYYY-MM-DD). endOfDay = סוף היום */
export function parseDate(s: string, endOfDay = false): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + (endOfDay ? "T23:59:59.999" : "T00:00:00"));
  return isNaN(d.getTime()) ? null : d;
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export function minutesAgo(n: number): Date {
  return new Date(Date.now() - n * 60 * 1000);
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
}

export function fmtDuration(sec: number | null | undefined): string {
  const s = Math.max(0, Math.round(Number(sec ?? 0)));
  if (s < 60) return `${s} שנ׳`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}:${String(r).padStart(2, "0")} דק׳` : `${m} דק׳`;
  const h = Math.floor(m / 60);
  return `${h}:${String(m % 60).padStart(2, "0")} שע׳`;
}

export function agoText(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `לפני ${s} שנ׳`;
  if (s < 3600) return `לפני ${Math.floor(s / 60)} דק׳`;
  if (s < 86400) return `לפני ${Math.floor(s / 3600)} שע׳`;
  return `לפני ${Math.floor(s / 86400)} ימים`;
}

/** בונה querystring תוך שמירת פילטרים קיימים */
export function qs(base: Record<string, string | number | undefined | null>, override: Record<string, string | number | undefined | null> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...base, ...override })) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** CSV עם BOM (Excel בעברית) */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  return "﻿" + lines.join("\r\n");
}

export function csvResponse(name: string, csv: string) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}

/** צבע צ'יפ לפעולה בלוג לפי קידומת */
export function actionTone(action: string): string {
  const a = action.toLowerCase();
  if (a.startsWith("login") || a.startsWith("register") || a.startsWith("logout")) return "bg-blue-soft text-blue-deep";
  if (a.startsWith("download")) return "bg-gold-soft text-gold";
  if (a.startsWith("purchase") || a.startsWith("payment") || a.startsWith("transaction") || a.startsWith("cart"))
    return "bg-emerald-50 text-emerald-700";
  if (a.startsWith("user")) return "bg-pink-soft text-pink";
  if (a.startsWith("material") || a.startsWith("category")) return "bg-oak-soft text-oak-deep";
  if (a.startsWith("settings")) return "bg-violet-50 text-violet-700";
  if (a.includes("delete") || a.includes("suspend") || a.includes("refund") || a.startsWith("error"))
    return "bg-red-50 text-red-700";
  return "bg-foreground/5 text-foreground/70";
}
