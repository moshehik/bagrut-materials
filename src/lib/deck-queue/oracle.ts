import "server-only";

/**
 * לקוח לשרת הנוטבוק (Oracle, Flask + notebooklm-py מאחורי Caddy). התחברות בסיסמה ← cookie; מתבצעת פעם אחת בכל tick.
 * הכתובת והסיסמה: env NBLM_BASE / NBLM_SITE_PASSWORD (Vercel, 3 סביבות). הסיסמה לא נרשמת ללוגים.
 */
const CALL_TIMEOUT_MS = 25_000;
const DOWNLOAD_TIMEOUT_MS = 150_000;

export type OracleClient = {
  call: (method: "GET" | "POST" | "DELETE", path: string, body?: unknown) => Promise<{ code: number; json: unknown }>;
  downloadPdf: (oracleJobId: string) => Promise<Uint8Array>;
};

function base(): string {
  return (process.env.NBLM_BASE || "https://nblm.chavarivkalandauhydrotherapy.co.il").trim().replace(/\/+$/, "");
}

export async function oracleLogin(): Promise<OracleClient> {
  const password = (process.env.NBLM_SITE_PASSWORD || "").trim();
  if (!password) throw new Error("NBLM_SITE_PASSWORD לא מוגדר בשרת");
  const r = await fetch(base() + "/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "password=" + encodeURIComponent(password),
    redirect: "manual",
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  const sc = r.headers.get("set-cookie");
  if (!sc) throw new Error(`התחברות לנוטבוק נכשלה (${r.status})`);
  const cookie = sc.split(";")[0];
  return {
    async call(method, path, body) {
      const res = await fetch(base() + path, {
        method,
        headers: { Cookie: cookie, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      const txt = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(txt);
      } catch {
        json = { raw: txt.slice(0, 300) };
      }
      return { code: res.status, json };
    },
    async downloadPdf(oracleJobId) {
      const res = await fetch(`${base()}/api/download-file/${encodeURIComponent(oracleJobId)}`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      const buf = new Uint8Array(await res.arrayBuffer());
      const magic = String.fromCharCode(...buf.slice(0, 4));
      if (res.status !== 200 || magic !== "%PDF") throw new Error(`הקובץ שהורד אינו PDF (${res.status})`);
      return buf;
    },
  };
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});

/** יוצר מחברת ומוסיף לה את המקור; מחזיר מזהה מחברת וג'וב טעינת המקור */
export async function startNotebook(c: OracleClient, jobId: string, sourceText: string): Promise<{ notebookId: string; oracleJobId: string }> {
  const created = asObj(asObj(asObj((await c.call("POST", "/api/notebooks", { title: `תור-${jobId.slice(0, 40)}-${Date.now()}` })).json).data).notebook);
  const nb = created.id;
  if (typeof nb !== "string" || !nb) throw new Error("יצירת מחברת נכשלה");
  const add = asObj((await c.call("POST", `/api/notebooks/${nb}/sources`, { content: sourceText, type: "text", title: "סצנות" })).json);
  if (typeof add.job_id !== "string") {
    await c.call("DELETE", `/api/notebooks/${nb}`).catch(() => {});
    throw new Error("הוספת מקור נכשלה");
  }
  return { notebookId: nb, oracleJobId: add.job_id };
}

export async function startGenerate(c: OracleClient, notebookId: string, description: string): Promise<string> {
  const g = asObj((await c.call("POST", "/api/generate", { kind: "slide-deck", notebook_id: notebookId, description, options: { format: "detailed" } })).json);
  if (typeof g.job_id !== "string") throw new Error("אין job_id: " + JSON.stringify(g).slice(0, 200));
  return g.job_id;
}

export async function startDownload(c: OracleClient, notebookId: string, artifactId: string): Promise<string> {
  const d = asObj((await c.call("POST", "/api/download", { kind: "slide-deck", notebook_id: notebookId, mode: "artifact", artifact_id: artifactId })).json);
  if (typeof d.job_id !== "string") throw new Error("אין download job");
  return d.job_id;
}

export async function deleteNotebook(c: OracleClient, notebookId: string | null): Promise<void> {
  if (!notebookId) return;
  try {
    await c.call("DELETE", `/api/notebooks/${notebookId}`);
  } catch {}
}

/** סטטוס חשבונות (מכסה). כשל = "לא ידוע" ולא חוסם */
export async function allSlidesExhausted(c: OracleClient): Promise<boolean> {
  try {
    const j = asObj(asObj((await c.call("GET", "/api/accounts")).json).data);
    return j.all_slides_exhausted === true;
  } catch {
    return false;
  }
}
