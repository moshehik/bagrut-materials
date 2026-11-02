import { ThumbsUp } from "lucide-react";

/** לייק קטן + מספר בעיגול, בזהב, בפינה השמאלית העליונה של כותרת הכרטיס; הטולטיפ (data-tip) מסביר */
export function EnjoyedBadge({ count, tip }: { count: number; tip: string }) {
  if (count <= 0) return null;
  return (
    <span className="sicha-enjoyed-badge" data-tip={tip} tabIndex={0} role="img" aria-label={tip}>
      <ThumbsUp className="h-4 w-4" aria-hidden />
      <span className="sicha-enjoyed-count">{count}</span>
    </span>
  );
}
