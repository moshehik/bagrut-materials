import { FORUM_LABEL, type ForumKind } from "@/lib/forum-utils";

/** איקון קווי דק ומונפש בתוך כל לחצן סוג (קו שחור דק על הצבע). האנימציות ב-globals.css (fi-*) */
export function KindIcon({ kind }: { kind: ForumKind | "answer" | "reply" }) {
  const common = {
    className: "forum-kind-ico",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.1,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (kind === "answer" || kind === "reply")
    return (
      <svg {...common}>
        <g className="fi-bob">
          <path d="M9.5 5L4 10.5 9.5 16" />
          <path d="M4 10.5h9a7 7 0 0 1 7 7V19" />
        </g>
      </svg>
    );
  if (kind === "question")
    return (
      <svg {...common}>
        <g className="fi-bob">
          <path d="M12 3.5c4.7 0 8.5 3.1 8.5 7.2S16.7 17.9 12 17.9c-.9 0-1.8-.1-2.6-.4L5 20l1.1-3.6C4.6 15.2 3.5 13.1 3.5 10.7 3.5 6.6 7.3 3.5 12 3.5z" />
          <path className="fi-pulse" d="M9.9 9.2a2.2 2.2 0 1 1 3.4 1.8c-.8.5-1.3 1-1.3 1.8" />
          <path className="fi-pulse" d="M12 14.9h.01" strokeWidth={1.8} />
        </g>
      </svg>
    );
  if (kind === "note")
    return (
      <svg {...common}>
        <path className="fi-draw" pathLength={10} d="M3.5 21h8.5" />
        <g className="fi-pencil">
          <path d="M15.8 3.4l4.8 4.8L8.6 20.2l-5.1 1 1-5.1z" />
          <path d="M13.6 5.6l4.8 4.8" />
        </g>
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M12 2.8a6 6 0 0 0-3.7 10.7c.6.5 1 1.2 1 2h5.4c0-.8.4-1.5 1-2A6 6 0 0 0 12 2.8z" />
      <path d="M9.7 18.2h4.6M10.6 21h2.8" />
      <g className="fi-rays">
        <path d="M2.2 8.8h1.8M20 8.8h1.8M4.6 3.2l1.3 1.3M19.4 3.2l-1.3 1.3" />
      </g>
    </svg>
  );
}

/** שם הסוג באפור בראש הריבוע, עם האיקון הקווי הדק של אותו סוג (שאלה / הערה / טיפ / תשובה) */
export function KindTag({ kind }: { kind: ForumKind | "answer" | "reply" }) {
  return (
    <p className="forum-kind-tag">
      <KindIcon kind={kind} />
      {FORUM_LABEL[kind]}
    </p>
  );
}

/** אייקוני פעולה קוויים דקים (אותו סגנון כמו KindIcon): פח / אזהרה / תשובה / וי / סינון */
export function ThinIcon({
  name,
}: {
  name: "trash" | "warn" | "reply" | "check" | "filter" | "copy" | "edit" | "close";
}) {
  return (
    <svg
      className="forum-thin-ico"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "trash" && (
        <>
          <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5M14 11v5" />
        </>
      )}
      {name === "warn" && (
        <>
          <path d="M12 3.6l9.2 16H2.8z" />
          <path d="M12 10v4.4" />
          <path d="M12 17.2h.01" strokeWidth={1.8} />
        </>
      )}
      {name === "reply" && <path d="M9.5 5L4 10.5 9.5 16M4 10.5h9a7 7 0 0 1 7 7V19" />}
      {name === "filter" && <path d="M3.5 5h17l-6.5 7.6V19l-4 2v-8.4z" />}
      {name === "copy" && (
        <>
          <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
          <path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
        </>
      )}
      {name === "check" && <path d="M5 12.5l4.5 4.5L19 7.5" />}
      {name === "edit" && (
        <>
          <path d="M15.8 3.4l4.8 4.8L8.6 20.2l-5.1 1 1-5.1z" />
          <path d="M13.6 5.6l4.8 4.8" />
        </>
      )}
      {name === "close" && <path d="M6 6l12 12M18 6L6 18" />}
    </svg>
  );
}
