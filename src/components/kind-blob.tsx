import { KIND_BLOBS } from "@/lib/kind-blobs.generated";

/**
 * כתם הרקע של מספרי הדף הראשי (kind-blob-N.png) כ-SVG מוטמע: מסנן אתרוג/נטפרי הציג את הכתם הראשון כריבוע בהיר (תמונה שלא נבדקה).
 * נתונים: scripts/gen-kind-blobs.cjs. שתי שכבות: הכתם (צבע + שקיפות) והטבעת הכהה מעליו.
 */
export function KindBlob({ n, className }: { n: 1 | 2 | 3 | 4; className?: string }) {
  const d = KIND_BLOBS[n];
  return (
    <svg className={className} viewBox={`0 0 ${d.w} ${d.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <path d={d.blobD} fill={d.blobFill} fillOpacity={d.blobOpacity} fillRule="evenodd" />
      <path d={d.ringD} fill={d.ringFill} fillRule="evenodd" />
    </svg>
  );
}
