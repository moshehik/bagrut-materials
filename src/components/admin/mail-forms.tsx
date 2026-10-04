"use client";

import { useActionState, useState } from "react";
import { Send, Users, Paperclip, Copy, Check } from "lucide-react";
import { sendManualMail, broadcastMail, type MailState } from "@/lib/actions/mail";

function Status({ state }: { state: MailState }) {
  if (!state) return null;
  if (state.error) return <p className="text-sm text-red-600 font-medium">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-green-700 font-medium">✓ {state.ok}</p>;
  return null;
}

/** מודאל/טופס "שליחת מייל" – אל, עותק, נושא, תוכן, קובץ מצורף (כמו במודל) */
export function ManualMailForm({ defaultTo = "" }: { defaultTo?: string }) {
  const [state, action, pending] = useActionState<MailState, FormData>(sendManualMail, undefined);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          אל (To)
          <input name="to" required defaultValue={defaultTo} dir="ltr" className="input mt-1 font-normal" placeholder="a@b.com, c@d.com" />
        </label>
        <label className="text-sm font-semibold">
          עותק (CC)
          <input name="cc" dir="ltr" className="input mt-1 font-normal" />
        </label>
      </div>
      <label className="block text-sm font-semibold">
        נושא
        <input name="subject" required className="input mt-1 font-normal" />
      </label>
      <label className="block text-sm font-semibold">
        תוכן
        <textarea name="body" required rows={7} className="input mt-1 font-normal" />
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <Paperclip className="h-4 w-4 text-muted" aria-hidden /> קובץ מצורף
        <input type="file" name="attachment" className="text-xs font-normal" />
      </label>
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={pending}>
          <Send className="h-4 w-4" aria-hidden /> {pending ? "שולח…" : "שליחה"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

/** דיוור לקבוצה */
export function BroadcastForm() {
  const [state, action, pending] = useActionState<MailState, FormData>(broadcastMail, undefined);
  const [audience, setAudience] = useState("all");
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          קהל יעד
          <select name="audience" value={audience} onChange={(e) => setAudience(e.target.value)} className="input mt-1 font-normal">
            <option value="all">כל המשתמשות</option>
            <option value="subscribers">מנויות פעילות</option>
            <option value="premium">מנויות פרימיום</option>
          </select>
        </label>
      </div>
      <label className="block text-sm font-semibold">
        נושא
        <input name="subject" required className="input mt-1 font-normal" />
      </label>
      <label className="block text-sm font-semibold">
        תוכן <span className="text-xs text-muted font-normal">(אפשר לכתוב {"{שם}"} וזה יוחלף בשם המורה)</span>
        <textarea name="body" required rows={7} className="input mt-1 font-normal" />
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <Paperclip className="h-4 w-4 text-muted" aria-hidden /> קובץ מצורף
        <input type="file" name="attachment" className="text-xs font-normal" />
      </label>
      <div className="flex items-center gap-3">
        <button
          className="btn btn-gold"
          disabled={pending}
          onClick={(e) => {
            if (!confirm("לשלוח דיוור לכל הקבוצה שנבחרה?")) e.preventDefault();
          }}
        >
          <Users className="h-4 w-4" aria-hidden /> {pending ? "שולח…" : "שליחת דיוור"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

/** רשימת כתובות המייל של המשתמשות עם העתקה (כמו FullEmailListModal במודל) */
export function EmailList({ rows }: { rows: { id: number; name: string; email: string }[] }) {
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const filtered = rows.filter(
    (r) => r.name.includes(q) || r.email.toLowerCase().includes(q.toLowerCase()),
  );
  const copy = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם או מייל" className="input max-w-xs py-2" />
        <button type="button" className="btn btn-ghost text-sm py-2" onClick={() => copy(filtered.map((r) => r.email).join(", "), "all")}>
          {copied === "all" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} העתקת כל הכתובות ({filtered.length})
        </button>
      </div>
      <div className="max-h-80 overflow-auto rounded-xl border border-foreground/5">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white text-muted text-right">
            <tr>
              <th className="py-2 px-3 font-medium">#</th>
              <th className="py-2 px-3 font-medium">שם</th>
              <th className="py-2 px-3 font-medium">מייל</th>
              <th className="py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={r.id} className="border-t border-foreground/5">
                <td className="py-1.5 px-3 text-muted">{i + 1}</td>
                <td className="py-1.5 px-3 font-semibold">{r.name}</td>
                <td className="py-1.5 px-3" dir="ltr">{r.email}</td>
                <td className="py-1.5 px-3">
                  <button type="button" className="text-blue-deep hover:underline text-xs" onClick={() => copy(r.email, String(r.id))}>
                    {copied === String(r.id) ? "הועתק ✓" : "העתקה"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
