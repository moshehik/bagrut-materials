"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Hourglass, Send } from "lucide-react";
import { submitFollowUp } from "@/lib/actions/fixes";
import { MAX_THREAD_TURNS, type ThreadView } from "@/lib/private-version-logic";
import { sanitizeReplyForDisplay } from "@/lib/reply-text";
import styles from "./fix-thread.module.css";

/** הודעה שנשלחה עכשיו ועוד לא הגיעה מהשרת ברשימת השרשורים (מוצגת מיד כ"נבדקת"); threadId=null = הערה חדשה */
export type OptimisticMsg = { key: string; threadId: number | null; text: string; commentators: boolean };

type Item = ThreadView["items"][number];

/** מה מוצג כשהסוכן ענה בלי ניסוח (reply ריק): לפי הסטטוס */
function fallbackReply(status: string, hasPrivateVersion: boolean): string {
  if (status === "private") return hasPrivateVersion ? "הקובץ תוקן עבורך. הקובץ המתוקן מוצג משמאל." : "הקובץ תוקן עבורך.";
  if (status === "merged") return "ההערה שולבה בקובץ לכל המורות.";
  return "ההערה נבדקה.";
}

const leftText = (left: number) => (left === 1 ? "נשארה הודעה אחת" : `נשארו ${left} הודעות`);

/**
 * שיחה עם הצוות על הערה כללית / מפרשים נוספים: כל שרשור כרשימת הודעות (שלה מול "תשובה"), שעון חול כשהודעה ממתינה
 * (התשובה מופיעה כאן לבד – הבדיקה התקופתית רצה ב-FixRequestButton), ואחרי תשובה – תיבה להמשך (שאלה / הבהרה / בקשת תיקון
 * נוספת על מה שנעשה), עד MAX_THREAD_TURNS הודעות שלה בשרשור. הקובץ המתוקן נטען בצד החלון (גרסה פרטית) ע"י ההורה.
 */
export function FixThreads({
  materialId,
  threads,
  optimistic,
  hasPrivateVersion,
  onSent,
}: {
  materialId: number;
  threads: ThreadView[];
  optimistic: OptimisticMsg[];
  hasPrivateVersion: boolean;
  /** הודעת המשך נשלחה בהצלחה: ההורה מוסיף אותה כממתינה ומרענן את הנתונים */
  onSent: (m: OptimisticMsg) => void;
}) {
  // שרשור = הנתונים מהשרת + הודעות המשך שנשלחו עכשיו; הערה חדשה שנשלחה עכשיו – שרשור זמני משלה
  const blocks: { rootId: number | null; commentators: boolean; items: Item[] }[] = threads.map((t) => ({
    rootId: t.rootId,
    commentators: t.commentators,
    items: [
      ...t.items,
      ...optimistic
        .filter((o) => o.threadId === t.rootId)
        .map((o, i) => ({ id: -(i + 1), turn: t.items.length + i + 1, status: "pending", text: o.text, reply: null, at: "" })),
    ],
  }));
  for (const o of optimistic.filter((x) => x.threadId === null)) {
    blocks.push({ rootId: null, commentators: o.commentators, items: [{ id: -1, turn: 1, status: "pending", text: o.text, reply: null, at: "" }] });
  }
  if (blocks.length === 0) return null;
  return (
    <div className={styles.threads}>
      {blocks.map((b, i) => (
        <ThreadBlock key={b.rootId ?? `new-${i}`} materialId={materialId} block={b} hasPrivateVersion={hasPrivateVersion} showFileNote={i === blocks.length - 1} onSent={onSent} />
      ))}
    </div>
  );
}

function ThreadBlock({
  materialId,
  block,
  hasPrivateVersion,
  showFileNote,
  onSent,
}: {
  materialId: number;
  block: { rootId: number | null; commentators: boolean; items: Item[] };
  hasPrivateVersion: boolean;
  showFileNote: boolean;
  onSent: (m: OptimisticMsg) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const used = block.items.length;
  const last = block.items[used - 1];
  const waiting = last.status === "pending";
  const left = Math.max(0, MAX_THREAD_TURNS - used);
  const canReply = !waiting && left > 0 && block.rootId !== null;

  const send = () => {
    if (block.rootId === null || text.trim().length < 3) return;
    const sent = text.trim();
    setError(null);
    start(async () => {
      try {
        const res = await submitFollowUp({ materialId, threadId: block.rootId!, text: sent });
        if (res?.ok) {
          setText("");
          onSent({ key: `f${Date.now()}`, threadId: block.rootId, text: sent, commentators: block.commentators });
        } else {
          setError(res?.error ?? "לא הצלחנו לשלוח. נסי שוב.");
        }
      } catch {
        setError("לא הצלחנו לשלוח כרגע. נסי שוב.");
      }
    });
  };

  return (
    <section className={styles.thread} aria-label={block.commentators ? "בקשה למפרשים נוספים" : "הערה כללית"}>
      <h4 className={styles.head}>{block.commentators ? "בקשה למפרשים נוספים" : "הערה כללית"}</h4>
      <ol className={styles.msgs}>
        {block.items.map((it, idx) => {
          const reply = it.status === "pending" ? null : (sanitizeReplyForDisplay(it.reply) ?? fallbackReply(it.status, hasPrivateVersion));
          return (
            <li key={it.id} className={styles.pair}>
              <div className={styles.me}>{it.text}</div>
              {it.status === "pending" ? (
                <div className={styles.wait} role="status">
                  <Hourglass className={styles.waitIcon} strokeWidth={1.75} aria-hidden />
                  <span>ההערה שלך נבדקת – התשובה תופיע כאן</span>
                </div>
              ) : (
                <>
                  <div className={styles.reply}>
                    <span className={styles.replyTag}>תשובה</span>
                    {reply}
                  </div>
                  {showFileNote && idx === block.items.length - 1 && it.status === "private" && hasPrivateVersion ? (
                    <span className={styles.fileNote}>
                      <CheckCircle2 className={styles.fileNoteIcon} strokeWidth={1.75} aria-hidden />
                      הקובץ המתוקן נטען משמאל
                    </span>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
      </ol>

      {canReply ? (
        <div className={styles.more}>
          <textarea
            rows={2}
            maxLength={2000}
            value={text}
            placeholder="שאלה או בקשה על מה שנעשה…"
            aria-label="הודעה להמשך השיחה"
            onChange={(e) => setText(e.target.value)}
          />
          {error ? <p className={styles.error}>{error}</p> : null}
          <div className={styles.moreRow}>
            <span className={styles.counter}>{leftText(left)}</span>
            <button type="button" className={styles.send} disabled={pending || text.trim().length < 3} onClick={send}>
              <Send className={styles.sendIcon} strokeWidth={1.75} aria-hidden />
              {pending ? "שולחת…" : "שליחה"}
            </button>
          </div>
        </div>
      ) : !waiting && left === 0 ? (
        <p className={styles.full}>מוצו {MAX_THREAD_TURNS} ההודעות בשיחה הזו. אפשר לפתוח הערה חדשה.</p>
      ) : null}
    </section>
  );
}
