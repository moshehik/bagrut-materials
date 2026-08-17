/** פענוח user-agent מינימלי – דפדפן / מערכת הפעלה / סוג מכשיר */
export type UAInfo = { browser: string; os: string; device: "mobile" | "tablet" | "desktop" | "bot" | "unknown" };

export function parseUA(ua: string | null | undefined): UAInfo {
  if (!ua) return { browser: "—", os: "—", device: "unknown" };
  const s = ua;

  let browser = "אחר";
  if (/bot|crawler|spider|slurp|facebookexternalhit|preview/i.test(s)) browser = "בוט";
  else if (/Edg\//.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/.test(s)) browser = "Opera";
  else if (/SamsungBrowser/.test(s)) browser = "Samsung";
  else if (/Chrome\/|CriOS\//.test(s)) browser = "Chrome";
  else if (/Firefox\/|FxiOS\//.test(s)) browser = "Firefox";
  else if (/Safari\//.test(s) && /Version\//.test(s)) browser = "Safari";
  else if (/MSIE|Trident\//.test(s)) browser = "IE";

  let os = "אחר";
  if (/Windows NT/.test(s)) os = "Windows";
  else if (/Android/.test(s)) os = "Android";
  else if (/iPhone|iPad|iPod/.test(s)) os = "iOS";
  else if (/Mac OS X|Macintosh/.test(s)) os = "macOS";
  else if (/CrOS/.test(s)) os = "ChromeOS";
  else if (/Linux/.test(s)) os = "Linux";

  let device: UAInfo["device"] = "desktop";
  if (browser === "בוט") device = "bot";
  else if (/iPad|Tablet|(Android(?!.*Mobile))/.test(s)) device = "tablet";
  else if (/Mobi|iPhone|Android.*Mobile/.test(s)) device = "mobile";

  return { browser, os, device };
}

/** תיאור קצר לטבלאות: "Chrome · Windows" */
export function shortUA(ua: string | null | undefined): string {
  if (!ua) return "—";
  const { browser, os, device } = parseUA(ua);
  const dev = device === "mobile" ? " 📱" : device === "tablet" ? " 📟" : "";
  return `${browser} · ${os}${dev}`;
}
