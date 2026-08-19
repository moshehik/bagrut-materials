import Image from "next/image";
import s from "@/app/home.module.css";
import goatImg from "../../public/logo-goat.png";
import calendarImg from "../../public/logo-calendar.png";

/** לוגו "לו״ז העניין" מפוצל לשתי שכבות — העז מונפשת בנפרד כאילו היא קופצת החוצה מהלוח */
export function GoatCalendarArt() {
  return (
    <>
      <div className={s.calendarLayer}>
        <Image src={calendarImg} alt="" fill sizes="(max-width: 900px) 300px, 370px" priority />
      </div>
      <div className={s.goatLayer}>
        <Image src={goatImg} alt="" fill sizes="(max-width: 900px) 80px, 100px" priority />
      </div>
      <span className={s.meh} aria-hidden>
        מהההה!
      </span>
    </>
  );
}
