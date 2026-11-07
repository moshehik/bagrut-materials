/**
 * גוף תגובה מבייטים בזיכרון: קבצים גדולים (מעל ~3MB) נשלחים כזרם. פונקציות שרת בוורסל מוגבלות ל-4.5MB בגוף תגובה רגיל,
 * אבל תגובה מוזרמת לא מוגבלת – חשוב ל-PDF של מצגות אחרי המרת הרקעים לרשת צבעים (כ-13MB למצגת של 18 שקפים).
 */
const STREAM_ABOVE = 3 * 1024 * 1024;
const CHUNK = 256 * 1024;

export function bytesBody(bytes: Uint8Array): BodyInit {
  if (bytes.byteLength <= STREAM_ABOVE) return new Uint8Array(bytes) as unknown as BodyInit;
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(offset, Math.min(offset + CHUNK, bytes.byteLength)));
      offset += CHUNK;
    },
  }) as unknown as BodyInit;
}
