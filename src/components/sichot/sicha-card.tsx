import Link from "next/link";
import { Play } from "lucide-react";
import { SichaFileCard } from "./sicha-file-card";
import { EnjoyedBadge } from "./enjoyed-badge";
import { IDEA_BOX_COLORS } from "@/lib/sicha-colors";
import { UsageToggle, IdeaBox } from "./sicha-interactions";
import type { SichaSeminar } from "@/db/schema";

export type SichaCardData = {
  id: number;
  title: string;
  description: string | null;
  seminarType: SichaSeminar;
  fileName: string;
  /** קבצים נוספים באותו שיעור (הקובץ הראשי הוא fileName) */
  extraFiles?: { id: number; fileName: string }[];
  teacherName: string;
  usageCount: number;
  usedByMe: boolean;
  ideas: { id: number; body: string; teacherName: string }[];
  ideaContributorCount: number;
  /** סרטונים להעשרת השיעור שמורות קישרו לשיחה הזו – כל סרטון בכפתור משלו, שמוביל אליו בתיקיית "סרטונים" */
  videos?: { id: number; title: string; href: string }[];
};

const enjoyedTip = (n: number) => (n === 1 ? "מורה אחת נהנתה מהשיעור הזה!" : `${n} מורות נהנו מהשיעור הזה!`);

/** כרטיס קטן ברשימת השיחות: רק מה השיעור – הכניסה אליו (קבצים, סרטון, תוספות, פורום) בדף השיעור */
export function SichaListCard({ sicha, href }: { sicha: SichaCardData; href: string }) {
  return (
    <article className="gate-card sicha-card !p-0 overflow-hidden flex flex-col">
      <header className="sicha-head">
        <h3 className="sicha-title leading-snug">
          <Link href={href} className="hover:underline">
            {sicha.title}
          </Link>
        </h3>
        <p className="mt-1 text-lg flex items-center gap-2">
          <span className="sicha-avatar" aria-hidden>
            {sicha.teacherName.trim().charAt(0)}
          </span>
          {sicha.teacherName}
        </p>
        <EnjoyedBadge count={sicha.usageCount} tip={enjoyedTip(sicha.usageCount)} />
      </header>

      <div className="flex flex-1 flex-col gap-3 p-4">
        {sicha.description && <p className="text-base gate-soft leading-relaxed line-clamp-3">{sicha.description}</p>}
        <Link href={href} className="btn btn-gold btn-gate !px-4 !py-1 !text-lg mt-auto self-start">
          לפתיחת השיעור
        </Link>
      </div>
    </article>
  );
}

/** דף השיעור עצמו: השיעור, הקבצים, הסרטון, התוספות של המורות והפורום */
export function SichaCard({ sicha, path }: { sicha: SichaCardData; path: string }) {
  return (
    <article className="gate-card sicha-card !p-0 overflow-hidden flex flex-col">
      <header className="sicha-head">
        <h3 className="sicha-title leading-snug">{sicha.title}</h3>
        <p className="mt-1 text-lg flex items-center gap-2">
          <span className="sicha-avatar" aria-hidden>
            {sicha.teacherName.trim().charAt(0)}
          </span>
          {sicha.teacherName}
        </p>
        <EnjoyedBadge count={sicha.usageCount} tip={enjoyedTip(sicha.usageCount)} />
      </header>

      <div className="flex flex-col gap-3 p-4">
      {sicha.description && (
        <p className="text-base gate-soft leading-relaxed whitespace-pre-line">{sicha.description}</p>
      )}

      <hr className="sicha-divider" />

      {/* כל קובץ של השיעור בכרטיס משלו, אחד מתחת לשני */}
      <div className="flex flex-col gap-3">
        <SichaFileCard sichaId={sicha.id} fileName={sicha.fileName} />
        {sicha.extraFiles?.map((f, i) => (
          <SichaFileCard key={f.id} sichaId={sicha.id} fileId={f.id} fileName={f.fileName} colorIndex={i + 1} />
        ))}
      </div>

      {!!sicha.videos?.length && (
        <div className="flex flex-col items-start gap-2">
          {sicha.videos.map((v) => (
            <Link key={v.id} href={v.href} className="sicha-tag sicha-tag-video max-w-full">
              <Play className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{v.title}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <UsageToggle sichaId={sicha.id} path={path} used={sicha.usedByMe} />
      </div>

      <div className="mtc sicha-idea-card" style={IDEA_BOX_COLORS}>
        <div className="mtc-lower">
          <div className="mtc-tools">
            <IdeaBox
              sichaId={sicha.id}
              path={path}
              ideas={sicha.ideas}
              defaultOpen
            />
          </div>
        </div>
      </div>
      </div>
    </article>
  );
}
