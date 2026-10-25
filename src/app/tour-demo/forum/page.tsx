import type { Metadata } from "next";
import { type FeedEntry } from "@/components/forum-feed";
import { ForumTourDemo } from "@/components/forum-tour-demo";

export const metadata: Metadata = { title: "דוגמה לפורום", robots: { index: false, follow: false } };

/** דוגמה ציבורית לסיור באתר: אותם רכיבי פורום כמו ביחידה האמיתית, במצב demo – שום דבר לא נשלח ולא נשמר */
export default function TourDemoForumPage() {
  const entries: FeedEntry[] = [
    {
      id: 1,
      kind: "question",
      userId: 4,
      author: "4821",
      when: "03/10/26 21:14",
      body: "ניסיתי להתחיל ישר מהפסוק הראשון והבנות התעניינו פחות. מישהי ניסתה לפתוח בשאלה או בסיפור קצר לפני?",
      answers: [
        {
          id: 11,
          userId: 2,
          author: "1307",
          when: "03/10/26 22:02",
          body: "אצלי עבד לפתוח בשאלה: ״מה אתן עושות כשקשה לכן?״ ואז לקשר לפסוק הראשון. הבנות הרגישו שזה קרוב אליהן.",
        },
      ],
    },
    {
      id: 2,
      kind: "tip",
      userId: 3,
      author: "2954",
      when: "04/10/26 10:15",
      body: "דקה של שקט לפני הקריאה עושה פלאים, הבנות נכנסות לאווירה של הפרק.",
      answers: [],
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8">
      <div className="gate-panel forum-panel space-y-4 sm:!p-7">
        <span className="gold-ring" aria-hidden="true" />
        <div className="flex flex-col items-center text-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-white.png" alt="לו״ז העניין" width={1491} height={871} className="fix-gate-logo" />
          <h1 id="unit-forum-h" className="text-3xl sm:text-4xl leading-tight">
            פורום על פרק לדוגמה
          </h1>
        </div>
        <div className="gate-card" role="note">
          <p className="text-xl">
            <b className="font-normal text-2xl">שימי לב</b> לענות בשפה נאותה ומכבדת ואך ורק על יחידת החומר הזו.
          </p>
        </div>
        <ForumTourDemo initial={entries} />
      </div>
    </div>
  );
}
