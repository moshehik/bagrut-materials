"use client";

import { useState, useTransition } from "react";
import { Clock, Loader2 } from "lucide-react";
import {
  AnswerButton,
  CopyButton,
  DeleteButton,
  ReportButton,
} from "@/components/forum-forms";
import { KindTag, ThinIcon } from "@/components/forum-kind-icon";
import { editThread } from "@/lib/actions/forum";
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
 * מתחת להודעה – התשובות/התגובות באותו צבע בגוון בהיר יותר ("תשובה" לשאלה, "תגובה" להערה/טיפ).
 * לכל הודעה יש לחצן תשובה/תגובה, ולמי שכתבה – "מחיקה".
 * `canParticipate` = מנויה/רוכשת מחוברת (ר' userCanUseUnitForum); בלי זה התוכן מטושטש ואין לחצנים.
 * `demo` = עמוד הדוגמה, שום דבר לא נשלח.
 */
export function ForumFeed({
  entries,
  meId,
  canParticipate,
  canView = canParticipate,
  isAdmin = false,
  demo = false,
}: {
  entries: FeedEntry[];
  meId: number | null;
  canParticipate: boolean;
  /** צפייה בתוכן המלא (ביחידה חינמית גם אורחת צופה, בלי להגיב); ברירת מחדל = canParticipate */
  canView?: boolean;
  /** מנהלת: יכולה למחוק כל הודעה ותשובה (גם של אחרות) */
  isAdmin?: boolean;
  demo?: boolean;
}) {
  const blur = canView ? "" : "select-none blur-[3px]";
  const [filter, setFilter] = useState<"all" | ForumKind>("all");
  // שורת הסינון מוצגת רק אחרי לחיצה על לחצן הסינון; סגירה מאפסת לתצוגת הכול
  const [filterOpen, setFilterOpen] = useState(false);
  const shown =
    filter === "all" ? entries : entries.filter((e) => e.kind === filter);

  // עריכה במקום של הערה/טיפ: הטקסט הופך לתיבת כתיבה; אחרי שינוי הלחצן הופך ל"שמירה"
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [editError, setEditError] = useState<string>();
  const [saving, startSave] = useTransition();

  function startEdit(t: FeedEntry) {
    setEditId(t.id);
    setDraft(t.body);
    setEditError(undefined);
  }
  function stopEdit() {
    setEditId(null);
    setEditError(undefined);
  }
  function save(t: FeedEntry) {
    if (demo) {
      stopEdit();
      return;
    }
    const fd = new FormData();
    fd.set("id", String(t.id));
    fd.set("body", draft);
    startSave(async () => {
      const res = await editThread(undefined, fd);
      if (res?.ok) stopEdit();
      else setEditError(res?.error ?? "השמירה נכשלה, נסי שוב");
    });
  }

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
        const editing = editId === t.id;
        const dirty = editing && draft.trim() !== t.body.trim();
        return (
          <article
            key={t.id}
            id={`t-${t.id}`}
            className={`fk-${t.kind} scroll-mt-24 animate-fade-up`}
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
          >
            <div className="forum-box">
              <KindTag kind={t.kind} />
              {editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") stopEdit();
                  }}
                  rows={4}
                  minLength={4}
                  maxLength={8000}
                  autoFocus
                  disabled={saving}
                  className="gate-input !bg-white resize-y forum-edit-area"
                  aria-label={`עריכת ה${t.kind === "tip" ? "טיפ" : "הערה"}`}
                />
              ) : (
                <p
                  className={`whitespace-pre-wrap leading-relaxed ${blur}`}
                  aria-hidden={!canView}
                >
                  {canView ? t.body : t.body.slice(0, 140)}
                </p>
              )}
              {editing && editError && (
                <p role="alert" className="mt-1 text-base text-[#8a1508]">
                  {editError}
                </p>
              )}
              <Meta author={t.author} mine={mine} when={t.when} />
              {(canView || canParticipate) && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {canView && <CopyButton text={t.body} />}
                  {canParticipate && (
                    <AnswerButton threadId={t.id} kind={t.kind} demo={demo} />
                  )}
                  {canParticipate && mine && t.kind !== "question" && (
                    <>
                      <button
                        type="button"
                        className={`forum-del${dirty ? " forum-del-save" : ""}`}
                        disabled={saving}
                        aria-label={dirty ? "שמירת השינויים" : editing ? "ביטול העריכה" : "עריכה"}
                        data-tip={dirty ? "שמירה" : editing ? "ביטול העריכה" : "עריכה"}
                        onClick={() => {
                          if (dirty) save(t);
                          else if (editing) stopEdit();
                          else startEdit(t);
                        }}
                      >
                        {saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ThinIcon name={dirty ? "check" : "edit"} />
                        )}
                      </button>
                      {dirty && (
                        <button
                          type="button"
                          className="forum-del"
                          disabled={saving}
                          aria-label="ביטול העריכה"
                          data-tip="ביטול"
                          onClick={stopEdit}
                        >
                          <ThinIcon name="close" />
                        </button>
                      )}
                    </>
                  )}
                  {canParticipate && !mine && !isAdmin && (
                    <ReportButton target={{ threadId: t.id }} demo={demo} initiallyReported={t.reported} />
                  )}
                  {canParticipate &&
                    (isAdmin || (mine && !(t.kind === "question" && t.answers.length > 0))) && (
                    <DeleteButton
                      id={t.id}
                      scope="thread"
                      demo={demo}
                      warn={
                        t.answers.length > 0
                          ? "למחוק את ההודעה? גם התגובות עליה יימחקו."
                          : "למחוק את ההודעה?"
                      }
                    />
                  )}
                </div>
              )}
            </div>

            {t.answers.length > 0 && (
              <div className="mt-3 ms-5 sm:ms-10 space-y-3 border-s-[3px] border-black/40 ps-3 sm:ps-4">
                {t.answers.map((a) => {
                  const mineAnswer = meId !== null && a.userId === meId;
                  return (
                    <div key={a.id} className={`fk-${t.kind}`}>
                      <div className="forum-box forum-box-reply">
                        <KindTag kind={t.kind === "question" ? "answer" : "reply"} />
                        <p
                          className={`whitespace-pre-wrap leading-relaxed ${blur}`}
                          aria-hidden={!canView}
                        >
                          {canView ? a.body : a.body.slice(0, 140)}
                        </p>
                        <Meta
                          author={a.author}
                          mine={mineAnswer}
                          when={a.when}
                        />
                        {(canView || canParticipate) && (
                          <div className="mt-2 flex items-center gap-2">
                            {canView && <CopyButton text={a.body} />}
                            {canParticipate && !mineAnswer && !isAdmin && (
                              <ReportButton
                                target={{ postId: a.id }}
                                demo={demo}
                                initiallyReported={a.reported}
                              />
                            )}
                            {canParticipate && (mineAnswer || isAdmin) && (
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
