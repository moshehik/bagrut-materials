import { Download, UserRound } from "lucide-react";
import { SICHA_SEMINARS } from "@/lib/constants";
import { RatingStars, UsageToggle, IdeaBox } from "./sicha-interactions";
import type { SichaSeminar } from "@/db/schema";

export type SichaCardData = {
  id: number;
  title: string;
  description: string | null;
  seminarType: SichaSeminar;
  fileName: string;
  teacherName: string;
  avgStars: number | null;
  ratingCount: number;
  usageCount: number;
  myRating: number | null;
  usedByMe: boolean;
  ideas: { id: number; body: string; teacherName: string }[];
  ideaContributorCount: number;
};

export function SichaCard({ sicha, path }: { sicha: SichaCardData; path: string }) {
  const seminar = SICHA_SEMINARS[sicha.seminarType];

  return (
    <article className="card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold leading-snug">{sicha.title}</h3>
          <p className="mt-0.5 text-xs text-muted flex items-center gap-1">
            <UserRound className="h-3.5 w-3.5" aria-hidden /> {sicha.teacherName}
          </p>
        </div>
        <span className="chip bg-blue-soft text-blue-deep shrink-0">
          {seminar.icon} {seminar.label}
        </span>
      </div>

      {sicha.description && (
        <p className="text-sm text-muted leading-relaxed line-clamp-3">{sicha.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <RatingStars sichaId={sicha.id} path={path} myRating={sicha.myRating} />
        {sicha.ratingCount > 0 && (
          <span className="text-xs text-muted">
            {sicha.avgStars?.toFixed(1)} ({sicha.ratingCount})
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <UsageToggle sichaId={sicha.id} path={path} used={sicha.usedByMe} count={sicha.usageCount} />
        <a href={`/api/sichot/download/${sicha.id}`} className="btn btn-primary text-sm py-2">
          <Download className="h-4 w-4" aria-hidden /> הורדה
        </a>
      </div>

      <IdeaBox
        sichaId={sicha.id}
        path={path}
        ideas={sicha.ideas}
        contributorCount={sicha.ideaContributorCount}
      />
    </article>
  );
}
