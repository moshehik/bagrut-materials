import type { MaterialKind } from "@/db/schema";

/** יוצר slug: אותיות לטיניות קטנות, ספרות, עברית ומקפים בלבד */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/["'״׳]/g, "")
    .replace(/[\s_/\\]+/g, "-")
    .replace(/[^a-z0-9֐-׿-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** ניחוש סוג חומר לפי שם הקובץ */
export function detectKind(fileName: string): MaterialKind {
  const n = fileName;
  if (n.includes("למורה")) return "teacher_sheet";
  if (n.includes("לתלמיד")) return "student_sheet";
  if (n.includes("מצגת") || /\.pptx?$/i.test(n)) return "presentation";
  if (n.includes("בגרות") || n.includes("בגרויות")) return "past_exam";
  if (n.includes("טיפים")) return "tips";
  if (n.includes("רעיונות") || n.includes("חידות")) return "ideas";
  return "other";
}

export function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "image/png",
  "image/jpeg",
  "audio/mpeg",
  "video/mp4",
  "application/zip",
  "application/x-zip-compressed",
];

export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
