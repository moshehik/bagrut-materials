import type { ReactNode, SVGProps } from "react";

/** אייקוני קו דק, שחורים, שקופים — לכרטיסי "מה בכל ערכת שיעור". מציירים את עצמם ב-hover (ראו .kindIcon ב-home.module.css) */

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

/** דף לתלמידה — עלה עם שורות להשלמה */
export function IconStudentPage(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path pathLength={1} d="M12 5h16l8 8v30H12z" />
      <path pathLength={1} d="M28 5v8h8" />
      <path pathLength={1} d="M17 21h5M26 21h5" />
      <path pathLength={1} d="M17 27h9M17 33h6" />
    </Base>
  );
}

/** דף למורה — אותו דף, עם וי של תשובה */
export function IconTeacherPage(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path pathLength={1} d="M10 5h16l8 8v25H10z" />
      <path pathLength={1} d="M26 5v8h8" />
      <path pathLength={1} d="M15 20h9M15 26h6" />
      <path pathLength={1} d="M31 30a7 7 0 1 0 0.01 0z" />
      <path pathLength={1} d="M28 32.5l2 2 4-4.5" />
    </Base>
  );
}

/** מצגת מלווה — מסך עם גרף עולה */
export function IconPresentation(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path pathLength={1} d="M6 9h36v25H6z" />
      <path pathLength={1} d="M24 34v6M18 40h12" />
      <path pathLength={1} d="M12 26l7-8 6 5 9-10" />
    </Base>
  );
}

/** בגרויות קודמות — דף עם שעון */
export function IconPastExams(props: SVGProps<SVGSVGElement>) {
  return (
    <Base {...props}>
      <path pathLength={1} d="M9 6h17l7 7v27H9z" />
      <path pathLength={1} d="M26 6v7h7" />
      <path pathLength={1} d="M14 21h9M14 27h5" />
      <path pathLength={1} d="M31 31a8 8 0 1 0 0.01 0z" />
      <path pathLength={1} d="M31 27v4l3 2" />
    </Base>
  );
}
