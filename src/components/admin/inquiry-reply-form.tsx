"use client";

import { useActionState, useState } from "react";
import { Send, AlertCircle, Info } from "lucide-react";
import { replyToInquiryAction, setInquiryStatusAction, type InquiryState } from "@/lib/actions/inquiries";
import { MAX_REPLY, type InquiryStatus } from "@/lib/inquiry-logic";

type Props = {
  inquiry: { id: number; name: string; email: string; status: InquiryStatus };
  defaultSubject: string;
  templates: { id: string; label: string; text: string }[];
};

/** טופס תשובה לפנייה: נושא, תבנית, גוף. התשובה יוצאת במייל לכתובת הפונה; הכפתורים האחרים משנים סטטוס בלבד */
export function InquiryReplyForm({ inquiry, defaultSubject, templates }: Props) {
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState("");
  
  const [state, action, pending] = useActionState<InquiryState, FormData>(async (prev, fd) => {
    const r = await replyToInquiryAction(prev, fd);
    if (r?.ok) {
      setBody("");
    }
    return r;
  }, undefined);

  // התבנית היא פעולת "הוסיפי": הרשימה חוזרת ל"בחרי" אחרי הבחירה, כדי שלא תסתור את הטקסט שנערך אחר כך
  const pickTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setBody((cur) => (cur.trim() ? cur.trimEnd() + "\n\n" + t.text : t.text));
  };

  const first = inquiry.name.trim().split(/\s+/)[0];

  return (
    <form action={action} className="inq-form">
      <input type="hidden" name="id" value={inquiry.id} />

      <div className="inq-row">
        <div className="inq-field inq-grow">
          <label htmlFor="inq-subject">נושא</label>
          <input
            id="inq-subject"
            name="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            className="gate-input"
          />
        </div>
        <div className="inq-field inq-tpl">
          <label htmlFor="inq-tpl">תבנית תשובה</label>
          <select
            id="inq-tpl"
            value=""
            onChange={(e) => pickTemplate(e.target.value)}
            className="gate-input inq-select"
          >
            <option value="">הוסיפי תבנית…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="inq-field">
        <label htmlFor="inq-body">התשובה</label>
        <textarea
          id="inq-body"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          maxLength={MAX_REPLY}
          placeholder="כתבי כאן את התשובה, או הוסיפי תבנית מהרשימה."
          className="gate-input inq-body"
        />
        <div className="inq-meta">
          <span>החתימה &quot;צוות לו״ז העניין&quot; נוספת אוטומטית</span>
          <span dir="ltr">
            {body.length} / {MAX_REPLY}
          </span>
        </div>
      </div>

      <p className="inq-note">
        <Info className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          התשובה נשלחת מכתובת האתר אל <bdi dir="ltr">{inquiry.email}</bdi> כטקסט רגיל. אם {first} תשיב למייל, התשובה
          תגיע לתיבת המייל של האתר ולא אלייך אישית.
        </span>
      </p>

      {state?.error && (
        <div role="alert" className="gate-card mt-3 flex items-start gap-2 !bg-[#f4c4bb]">
          <AlertCircle className="mt-1 h-4 w-4 shrink-0" aria-hidden />
          <span>{state.error}</span>
        </div>
      )}
      {state?.ok && (
        <div role="status" className="gate-card mt-3 inline-block animate-pop">
          ✓ {state.ok}
        </div>
      )}

      <div className="inq-actions">
        <button type="submit" disabled={pending} className="btn btn-gold btn-gate py-2 disabled:opacity-50">
          <Send className="h-4 w-4" aria-hidden /> {pending ? "שולחת…" : "שלחי תשובה"}
        </button>
        <button
          type="submit"
          name="status"
          value={inquiry.status === "open" ? "closed" : "open"}
          formAction={setInquiryStatusAction}
          formNoValidate
          disabled={pending}
          className="btn gate-skip py-2"
        >
          {inquiry.status === "open" ? "סגרי בלי מענה" : "החזירי להמתנה"}
        </button>
        {inquiry.status !== "spam" && (
          <button
            type="submit"
            name="status"
            value="spam"
            formAction={setInquiryStatusAction}
            formNoValidate
            disabled={pending}
            className="btn gate-skip ms-auto py-2"
          >
            סמני כספאם
          </button>
        )}
      </div>
    </form>
  );
}
