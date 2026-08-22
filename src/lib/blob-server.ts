import "server-only";

export { put, del } from "@vercel/blob";

export const CHUNK_PREFIX = "chunks/";

export function isSafeId(s: unknown): s is string {
  return /^[A-Za-z0-9_-]{6,64}$/.test(String(s ?? ""));
}
