"use client";

import { useState, useActionState } from "react";
import Image from "next/image";
import { ChevronDown, Send } from "lucide-react";
import { faqQuestionAction, type MailState } from "@/lib/actions/mail";
import s from "@/app/home.module.css";
import faqNutImg from "../../public/images/faq-nut.png";
import { NutCrackArt } from "@/components/nut-crack-art";

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "מתי עולים עוד מקצועות?",
    a: "אנו עושות כל מאמץ כדי למלא את מפת הבגרויות במהירות האפשרית ובמקצועיות המירבית.",
  },
  {
    q: "איך אני אדע אם החומר מתאים לי?",
    a: "בכל מקצוע יחידת החומר הראשונה פתוחה לכולן, כך תוכלי להתרשם מהתוכן המושקע.",
  },
  {
    q: "לאיזה סוג סמינרים החומר מתאים?",
    a: "לכל תיכון במחוז החרדי המכין את התלמידות שלו למבחני הבגרות.\nעם זאת תמיד תוכלי לבחור מחומרי העשרה את המדוייק ביותר לתלמידות שלך.",
  },
  {
    q: "למה עדיף רכישת חומר מהאתר מאשר רכישת חוברת?",
    a: "דבר ראשון החומר נשאר אצלך לתמיד!\nשנית, מדובר בפורמט מדוייק יותר של שיעור, כזה שמספק את חווית הלמידה מחומרי העשרה, הנאת ההתחדשות, וסיוע למאותגרות ארגון להתחיל כל שיעור בדף חדש.",
  },
  {
    q: "איך החומר מחולק?",
    a: "החומר מחולק לתתי נושאים. לדג' בתורה תקבלי פרק ספציפי.",
  },
  {
    q: "עד מתי אני יכולה להתרחב ממקצוע אחד לשלושה?",
    a: "כל עוד לא הסתיים המנוי תוכלי להוסיף מקצועות נוספים.",
  },
  {
    q: "מה מקבלים בכל יחידת שיעור?",
    a: "בכל שיעור ישנם חבילה קבועה וחבילה משתנה.\nהחבילה הרחבה כוללת שכפול לתלמידה, שכפול למורה, דף העשרה, דף מיומניות או חווית למידה, בוחן, תשובות לבוחן, דף בקיאות להכנה מתוך הספר, מאגר שאלות בגרות, תשובות למאגר השאלות מבגרויות וסיכום להכתבה.\nבהמשך יעלו עוד פיצ'רים מרגשים ואפילו מצגת!",
  },
  {
    q: "מה הרמה של התוכן?",
    a: "הרמה מוקפדת וגבוהה כראוי להכנה איכותית ויסודית לבחינות הבגרות, אך במקביל החומרים מונגשים בשפה ברורה ומובנת, כזאת שתתאים גם ללקויות למידה.",
  },
  {
    q: "האם בשיעורי קודש יש צורך בשימוש בספר?",
    a: "אותיות מחכימות, ולשם כך מיועד דף הבקיאות וההכנה המיועד ללמידה מקדימה עצמאית של התלמידה מתוך החומש, הנביא או המאמר. עם זאת, כל החומר הדרוש קיים גם בדפים עצמם, כך שתוכלי לדעת בוודאות שהכנת את התלמידה לבגרות בצורה המיטבית.",
  },
  {
    q: "באיזה סוג קובץ התוכן יורד?",
    a: "התוכן יורד בקובץ PDF.",
  },
  {
    q: "מותר לי להעביר את החומר?",
    a: "לא.\nהחומר ששילמת עליו הוא לשימושך האישי בלבד.\nהפצה ופרסום של קובץ שלך עלול לחשוף אותך לתביעה.\n(מעוגן בהלכה ובחוק זכויות יוצרים)",
  },
  {
    q: "מותר למורה אחת להשתמש בחומר לכמה כיתות?",
    a: "כן, בתנאי שאינה מעבירה למורה אחרת.",
  },
  {
    q: "כמה חומרים אפשר להוריד בכל יום?",
    a: "ניתן להוריד כמות הגיונית ללמידה יומית. המערכת מזהה הורדות חריגות וחוסמת את המשתמשת.",
  },
  {
    q: "האם המחיר ישתנה בהמשך?",
    a: "כן, האתר כרגע במחיר היכרות. הירשמי עכשיו והרוויחי:)",
  },
  {
    q: "מה עושים אם מגלים טעות דחופה וזקוקים לשיעור באופן מיידי?",
    a: "ישנה מערכת קלה ופשוטה לתיקון מיידי, בנוסף לבקרת חומר שאנו עושות כל הזמן.",
  },
  {
    q: "איך אני אדע שהחומר באמת נכון?",
    a: "כל חומר עובר בדיקות קפדניות לפני שמועלה לאתר, בנוסף לכך מערכת התיקון המובנית קלה ופרקטית, מה שמהווה בקרה נוספת כדי להבטיח לך חומר מקצועי ובטוח לשימוש.",
  },
  {
    q: "האם ניתן לסמוך על החומרים להכנת הבגרויות?",
    a: "ניתן לסמוך על החומרים להכנה לבגרויות. זוהי מטרת האתר.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [state, action, pending] = useActionState<MailState, FormData>(faqQuestionAction, undefined);

  return (
    <div className={s.faq}>
      <h2 className="sec-h">בואי תפצחי את זה לעומק</h2>
      <NutCrackArt />

      <div className={s.faqList}>
        {FAQ_ITEMS.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={item.q} className={`${s.faqItem} ${isOpen ? s.faqItemOpen : ""}`}>
              <button
                type="button"
                className={s.faqQ}
                aria-expanded={isOpen}
                onClick={() => setOpenIndex(isOpen ? null : i)}
              >
                <span className={s.faqQInner}>
                  <Image src={faqNutImg} alt="" sizes="32px" className={s.faqNutIcon} aria-hidden />
                  {item.q}
                </span>
                <ChevronDown
                  className={`${s.faqChevron} ${isOpen ? s.faqChevronOpen : ""}`}
                  aria-hidden
                />
              </button>
              {isOpen && (
                <div className={`${s.faqA} animate-fade-up`}>
                  <p>{item.a}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={s.faqAsk}>
        {state?.ok ? (
          <p className={s.faqAskOk}>{state.ok}</p>
        ) : (
          <form action={action} className={s.faqAskForm}>
            <h3>יש לי עוד שאלה והיא...</h3>
            <label className={s.faqAskLabel}>
              השאלה שלי:
              <textarea name="question" required rows={3} className="input mt-1 font-normal" />
            </label>
            {/* honeypot */}
            <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
            <div className={`${s.faqAskActions} fix-gate-scope`}>
              <button className={`btn btn-primary text-sm py-2 fix-gate-btn ${s.faqSend}`} disabled={pending}>
                {pending ? "שולחת…" : "שליחה"}
                <Send className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />
              </button>
              {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
