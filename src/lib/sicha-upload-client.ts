// העלאה בחתיכות של קובץ שיחה (Blob בוטל, עוברים דרך /api/sichot/upload/chunk+finish → דרייב).
// משותף לטופס "להעלות שיחה חדשה" ולחלונית "הוספת קובץ" בכרטיס שיעור קיים.
const CHUNK_BYTES = 4 * 1024 * 1024;

async function postChunk(session: string, index: number, chunk: ArrayBuffer): Promise<void> {
  const res = await fetch(`/api/sichot/upload/chunk?session=${session}&index=${index}`, {
    method: "POST",
    body: chunk,
    headers: { "content-type": "application/octet-stream" },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `שגיאה ${res.status}`);
}

export async function uploadChunked(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ url: string; sig: string; contentType?: string; size: number }> {
  const buf = await file.arrayBuffer();
  const session = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(36).padStart(2, "0"),
  )
    .join("")
    .slice(0, 24);
  const totalParts = Math.max(1, Math.ceil(buf.byteLength / CHUNK_BYTES));
  for (let i = 0, n = 0; i < buf.byteLength; i += CHUNK_BYTES, n++) {
    await postChunk(session, n, buf.slice(i, Math.min(i + CHUNK_BYTES, buf.byteLength)));
    onProgress(Math.round(((n + 1) / totalParts) * 100));
  }
  const res = await fetch("/api/sichot/upload/finish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: buf.byteLength,
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `איחוד הקובץ נכשל (${res.status})`);
  return { url: j.url as string, sig: j.sig as string, contentType: j.contentType as string | undefined, size: buf.byteLength };
}
