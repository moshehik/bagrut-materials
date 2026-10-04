import type { ReactNode, SVGProps } from "react";

/** אייקוני קו דק, שחורים, שקופים — לכרטיסי הנתונים בדף הבית. מציירים את עצמם ב-hover (ראו .kindIcon ב-home.module.css) */

function Base({ children, ...rest }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** כמות החומרים — ערימת דפים */
export function IconMaterials(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path pathLength={1} d="M16 9h16l7 7v24H16z" />
      <path pathLength={1} d="M32 9v7h7" />
      <path pathLength={1} d="M16 14H9v28h20v-2" />
      <path pathLength={1} d="M22 24h11M22 30h11M22 35h6" />
    </Base>
  );
}

/** כמות המקצועות — ספר פתוח */
export function IconSubjects(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path pathLength={1} d="M24 13c-4-3-10-4-17-4v26c7 0 13 1 17 4z" />
      <path pathLength={1} d="M24 13c4-3 10-4 17-4v26c-7 0-13 1-17 4z" />
      <path pathLength={1} d="M24 13v26" />
      <path pathLength={1} d="M12 17c3 0 6 .5 8 1.5M12 23c3 0 6 .5 8 1.5" />
    </Base>
  );
}

/** כמות ההורדות — חץ אל מגש */
export function IconDownloads(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path pathLength={1} d="M24 6v24" />
      <path pathLength={1} d="M14 21l10 10 10-10" />
      <path pathLength={1} d="M8 33v8h32v-8" />
    </Base>
  );
}

/** כמות הכניסות — עין */
export function IconVisits(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path pathLength={1} d="M4 24c5-9 12-14 20-14s15 5 20 14c-5 9-12 14-20 14S9 33 4 24z" />
      <path pathLength={1} d="M24 17a7 7 0 1 0 0.01 0z" />
      <path pathLength={1} d="M24 21.5a2.5 2.5 0 1 0 0.01 0z" />
    </Base>
  );
}
