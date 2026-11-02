import { CARD_STYLES } from "@/lib/material-card-types";

/** תיבת "הוספת תוכן / רעיון" בדפי השיעור והסרטון: תכלת מכובד (גוף + פס תחתון) */
export const IDEA_BOX_COLORS = { "--mtc-body": "#bcd3f0", "--mtc-strip": "#3f6aa0" } as React.CSSProperties;

/** צבע לכל קובץ בשיעור, לפי הסדר – כל קובץ בצבע אחר (התכלת הוא אחד מהם, לא כולם) */
export const FILE_COLORS = [
  CARD_STYLES.student,
  CARD_STYLES.quiz,
  CARD_STYLES.exam,
  CARD_STYLES.prep,
  CARD_STYLES.presentation,
  CARD_STYLES.dictation,
  CARD_STYLES.skills,
].map((c) => ({ body: c.body, strip: c.strip }));

export const fileColor = (i: number) => FILE_COLORS[i % FILE_COLORS.length];

/** אותה תיבה בדף הסרטון: נשארת בגוון הטורקיז */
export const VIDEO_IDEA_BOX_COLORS = { "--mtc-body": "#8fded2", "--mtc-strip": "#1f9a8d" } as React.CSSProperties;
