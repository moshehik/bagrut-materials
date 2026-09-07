@AGENTS.md

# Project notes (site: חומרים לבגרות)

## Stack
- Next.js (App Router) + TypeScript. See the auto-generated block above (from AGENTS.md) — the installed Next.js version has API/convention differences from training data; check `node_modules/next/dist/docs/` before writing framework-level code.
- DB: Drizzle ORM over Neon (serverless Postgres). Schema in `src/db/schema.ts`, client in `src/db/index.ts` (lazy proxy client with a fetch timeout so a DB hiccup can't hang a server render).
- Curriculum taxonomy (categories tree) is managed by `scripts/curriculum-tree.ts` + `scripts/seed.ts` (idempotent, tracked). Run via the `db:seed` npm script. `scripts/verify-tree.ts` sanity-checks the seeded tree.

## Two unrelated "content" pipelines — do not conflate them
1. **Catalog/category tree** (`scripts/curriculum-tree.ts`, `scripts/seed.ts`): structural metadata only — subjects/units/categories that materials attach to. Clean, tracked, safe to edit like normal app code.
2. **Lesson-material authoring** (ad-hoc, NOT tracked in git): hand-writing the actual downloadable `.docx`/PDF study sheets (enrichment pages, quizzes, teacher sheets). Workflow: dump a source `.docx` to XML/text → cache relevant Sefaria API lookups as scratch JSON → hand-write the Hebrew content into a one-off build script → inject back into `.docx` via JSZip → export PDF. Finished deliverables live in `/חומרים מוכנים מחדש/` (gitignored on purpose — not part of the site's source).
   - Scratch/working files for this workflow (dump scripts, cached JSON, `_render_temp_ch*/` folders, etc.) are gitignored via the `_*`/`_tmp*`/`_render_temp_ch*/` patterns in `.gitignore`. **Keep using that naming convention** (prefix throwaway root-level scratch files with `_`) so they stay out of `git status` and out of routine project-wide scans.
   - `/חומרים מוכנים מחדש/` has zero git history/backup by design (gitignored). Don't assume it's recoverable from git.
   - Cached Sefaria/source lookups (verses, Rashi, gemara, midrash) are indexed at `חומרים מוכנים מחדש/_מקורות-מטמון/אינדקס.md` — check there before re-fetching a source, and add a row when caching a new one.
   - Corrections/instructions from the teacher are tracked two ways: full history+reasoning in `חומרים מוכנים מחדש/הוראות לבניית כל החומרים החדשים/כל ההוראות לבניית החומרים.md`, and a lean structured status ledger (which files already incorporate which correction #) in `יומן תיקונים מבני (סטטוס קבצים).md` in that same folder — update both when a new correction comes in, but only the ledger needs re-reading for a "which files still need this fix" sweep.

## Housekeeping
- Prefer putting new one-off scratch files under the gitignored `_`-prefixed convention above (or the session scratchpad dir) rather than loose, unignored files in the repo root — the repo root has previously accumulated 100+ untracked scratch files (JSON caches up to ~500KB, temp render dirs), which slows down and bloats any project-wide search/listing.
