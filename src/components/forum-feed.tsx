"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import {
  AnswerButton,
  DeleteButton,
  ReportButton,
} from "@/components/forum-forms";
import { KindTag, ThinIcon } from "@/components/forum-kind-icon";
import { forumAuthor, type ForumKind } from "@/lib/forum-utils";

export type FeedAnswer = {
  id: number;
  body: string;
  when: string;
  userId: number;
  author: string;
  /** המשתמשת הנוכחית כבר דיווחה על התשובה (דיווח פתוח) */
  reported?: boolean;
};
export type FeedEntry = {
  id: number;
  kind: ForumKind;
  body: string;
  /** תאריך ושעה מעוצבים (forumWhen) */
  when: string;
  userId: number;
  /** המספר האישי של הכותבת (users.personalCode) */
  author: string;
  answers: FeedAnswer[];
  /** המשתמשת הנוכחית כבר דיווחה על ההודעה (דיווח פתוח) */
  reported?: boolean;
};

/** שורת "מי כתבה ומתי" בתוך ריבוע */
function Meta({
  author,
  mine,
  when,
}: {
  author: string;
  mine: boolean;
  when: string;
}) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm gate-soft">
      <span>{mine ? "את" : forumAuthor(author)}</span>
      <span className="flex items-center gap-1">
        <Clock className="h-3 w-3" aria-hidden /> {when}
      </span>
    </p>
  );
}

/**
 * רשימת ההודעות בפורום: כל הודעה בריבוע בצבע לפי הסוג, ובראשו (באפור) שם הסוג: שאלה / הערה / טיפ;
 * מתחת לשאלה – התשובות בזהב בהיר עם התווית "תשובה". לשאלה יש לחצן "תשובה", ולמי שכתבה – "מחיקה".
 * `canParticipate` = פרימיום מחובר; בלי זה התוכן מטושטש ואין לחצנים.
 * `demo` = עמוד הדוגמה, שום דבר לא נשלח.
 */
export function ForumFeed({
  entries,
  meId,
  canParticipate,
  isAdmin = false,
  demo = false,
}: {
  entries: FeedEntry[];
  meId: number | null;
  canParticipate: boolean;
  /** מנהלת: יכולה למחוק כל הודעה ותשובה (גם של אחרות) */
  isAdmin?: boolean;
  demo?: boolean;
}) {
  const blur = canParticipate ? "" : "select-none blur-[3px]";
  const [filter, setFilter] = useState<"all" | ForumKind>("all");
  // שורת הסינון מוצגת רק אחרי לחיצה על לחצן הסינון; סגירה מאפסת לתצוגת הכול
  const [filterOpen, setFilterOpen] = useState(false);
  const shown =
    filter === "all" ? entries : entries.filter((e) => e.kind === filter);

  // סינון: הכול / שאלות ותשובות (שאלה מגיעה עם התשובות שלה) / טיפים / הערות
  const tabs: { key: "all" | ForumKind; label: string; cls: string }[] = [
    { key: "all", label: "הכול", cls: "fk-all" },
    { key: "question", label: "שאלות ותשובות", cls: "fk-question" },
    { key: "tip", label: "טיפים", cls: "fk-tip" },
    { key: "note", label: "הערות", cls: "fk-note" },
  ];

  return (
    <div className="space-y-5">
      <button
        type="button"
        className="forum-del forum-del-gold"
        aria-label="סינון ההודעות"
        aria-expanded={filterOpen}
        data-tip={filterOpen ? "סגירת הסינון" : "סינון ההודעות"}
        onClick={() => {
          if (filterOpen) setFilter("all");
          setFilterOpen(!filterOpen);
        }}
      >
        <ThinIcon name="filter" />
      </button>

      {filterOpen && (
        <div
          className="flex flex-wrap items-center gap-2 animate-fade-up"
          role="group"
          aria-label="סינון ההודעות"
        >
          <span className="text-lg">הצגה:</span>
          {tabs.map((tab) => {
            const n =
              tab.key === "all"
                ? entries.length
                : entries.filter((e) => e.kind === tab.key).length;
            return (
              <button
                key={tab.key}
                type="button"
                className={`forum-kind-btn !text-lg !py-0.5 !px-4 ${tab.cls}`}
                aria-pressed={filter === tab.key}
                onClick={() => setFilter(tab.key)}
              >
                {tab.label} ({n})
              </button>
            );
          })}
        </div>
      )}

      {shown.length === 0 && (
        <p className="gate-card text-center text-xl">
          אין עדיין הודעות מהסוג הזה ביחידה.
        </p>
      )}

      {shown.map((t, i) => {
        const mine = meId !== null && t.userId === meId;
        return (
          <article
            key={t.id}
            id={`t-${t.id}`}
            className={`fk-${t.kind} scroll-mt-24 animate-fade-up`}
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
          >
            <div className="forum-box">
              <KindTag kind={t.kind} />
              <p
                className={`whitespace-pre-wrap leading-relaxed ${blur}`}
                aria-hidden={!canParticipate}
              >
                {canParticipate ? t.body : t.body.slice(0, 140)}
              </p>
              <Meta author={t.author} mine={mine} when={t.when} />
              {canParticipate && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {t.kind === "question" && (
                    <AnswerButton threadId={t.id} demo={demo} />
                  )}
                  {!mine && !isAdmin && (
                    <ReportButton target={{ threadId: t.id }} demo={demo} initiallyReported={t.reported} />
                  )}
                  {(mine || isAdmin) && (
                    <DeleteButton
                      id={t.id}
                      scope="thread"
                      demo={demo}
                      warn={
                        t.kind === "question" && t.answers.length > 0
                          ? "למחוק את השאלה? גם התשובות עליה יימחקו."
                          : "למחוק את ההודעה?"
                      }
                    />
                  )}
                </div>
              )}
            </div>

            {t.answers.length > 0 && (
              <div className="mt-3 ms-5 sm:ms-10 space-y-3 border-s-[3px] border-[#ffd45a]/70 ps-3 sm:ps-4">
                {t.answers.map((a) => {
                  const mineAnswer = meId !== null && a.userId === meId;
                  return (
                    <div key={a.id} className="fk-answer">
                      <div className="forum-box forum-box-answer">
                        <span className="forum-gold-ring" aria-hidden="true" />
                        <KindTag kind="answer" />
                        <p
                          className={`whitespace-pre-wrap leading-relaxed ${blur}`}
                          aria-hidden={!canParticipate}
                        >
                          {canParticipate ? a.body : a.body.slice(0, 140)}
                        </p>
                        <Meta
                          author={a.author}
                          mine={mineAnswer}
                          when={a.when}
                        />
                        {canParticipate && (
                          <div className="mt-2 flex items-center gap-2">
                            {!mineAnswer && !isAdmin && (
                              <ReportButton
                                target={{ postId: a.id }}
                                demo={demo}
                                initiallyReported={a.reported}
                              />
                            )}
                            {(mineAnswer || isAdmin) && (
                              <DeleteButton
                                id={a.id}
                                scope="reply"
                                demo={demo}
                                warn="למחוק את התשובה?"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
