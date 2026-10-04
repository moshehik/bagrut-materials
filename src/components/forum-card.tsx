import Image from "next/image";

/**
 * כרטיסיית הפורום בתוך תיקייה: אותו מבנה כמו כרטיסיות החומרים, אבל זו לא רכישה –
 * לחיצה על האגוזים מכניסה לפורום של היחידה (פתוח גם למי שלא רכשה).
 * הצבע (כחול-אפרפר מכובד) ייחודי – אף כרטיסיית חומר אחרת לא משתמשת בו.
 */
export function ForumCard({ folderTitle }: { folderTitle: string }) {
  return (
    <article
      className="mtc relative"
      style={{ "--mtc-body": "#c5d3ee", "--mtc-strip": "#6b7fa6" } as React.CSSProperties}
    >
      <header className="mtc-head">
        <Image
          src="/images/mat-cards/art4/forum.webp"
          alt=""
          width={636}
          height={260}
          className="mtc-art mtc-art-wide"
          aria-hidden
        />
        <h3 className="mtc-title" aria-label={`פורום - ${folderTitle}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/mat-cards/label-forum.webp"
            alt=""
            width={108}
            height={30}
            className="mtc-label"
            style={{ "--w": 108 } as React.CSSProperties}
            aria-hidden
          />
          <span className="mtc-chapter" aria-hidden>
            - {folderTitle}
          </span>
        </h3>
      </header>

      <a href="#unit-forum" className="mtc-body mtc-forum-body" aria-label={`כניסה לפורום – ${folderTitle}`}>
        <span className="mtc-forum-text">בואי לתרום מהידע שלך על החומר הזה ולהיתרם</span>
        <Image
          src="/images/nuts/many-03.webp"
          alt=""
          width={120}
          height={120}
          className="mtc-forum-nuts"
          aria-hidden
        />
      </a>
    </article>
  );
}
