"use client";

import { useEffect, useRef, useState } from "react";
import { ForumComposer } from "@/components/forum-forms";
import { ForumFeed, type FeedEntry } from "@/components/forum-feed";

/** פורום הדוגמה של הסיור: מה שהמורה כותבת מופיע ברשימה, ואחרי רגע מורה אחרת עונה לה. הכול בזיכרון הדף, שום דבר לא נשלח. */

export const TOUR_NEW_ID = 100;
const ME = 1;

export function ForumTourDemo({ initial }: { initial: FeedEntry[] }) {
  const [entries, setEntries] = useState(initial);
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function onPost(kind: FeedEntry["kind"], body: string) {
    setEntries((prev) => [
      { id: TOUR_NEW_ID, kind, userId: ME, author: "0001", when: "הרגע", body, answers: [] },
      ...prev.filter((e) => e.id !== TOUR_NEW_ID),
    ]);
    if (kind !== "question") return;
    timer.current = window.setTimeout(() => {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === TOUR_NEW_ID
            ? {
                ...e,
                answers: [
                  {
                    id: TOUR_NEW_ID + 1,
                    userId: 2,
                    author: "1307",
                    when: "הרגע",
                    body: "אצלי עבד להתחיל מסיפור קצר, לחלק את הפרק לחלקים קטנים ולסיים כל חלק בשאלה אחת פשוטה.",
                  },
                ],
              }
            : e,
        ),
      );
    }, 2200);
  }

  return (
    <>
      <ForumComposer categoryId={0} demo onDemoPost={onPost} />
      <ForumFeed entries={entries} meId={ME} canParticipate demo />
    </>
  );
}
