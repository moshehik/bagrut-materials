import Image from "next/image";
import s from "@/app/home.module.css";
import goatHouseLogoImg from "../../public/images/goat-house-logo.png";

/** לוגו "לו״ז העניין" — איור העז והלוח עם הכיתוב מוטבע בתוך התמונה */
export function GoatCalendarArt() {
  return (
    <div className={s.paper}>
      <Image
        src={goatHouseLogoImg}
        alt="לו״ז העניין — בית לחומרי הבגרות"
        fill
        sizes="(max-width: 900px) 300px, 460px"
        priority
        quality={100}
      />
    </div>
  );
}
