"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ChevronDown, ArrowUpLeft, Undo2, Scissors, Check, Link2 } from "lucide-react";
import { SUBJECT_COLORS } from "@/lib/constants";
import { getExplainer, codesOf, buildGenericExplainer, GENERIC_TEXT } from "@/lib/bagrut-explainers";
import { WINDOW_TEXT } from "@/lib/bagrut-window-texts";

import { BagrutExplainDialog } from "@/components/bagrut-explain-dialog";
import type { Category } from "@/db/schema";

export type MapNode = { cat: Category; chain: Category[]; children: MapNode[] };

function hrefFor(chain: Category[]) {
  return "/subjects/" + chain.map((c) => encodeURIComponent(c.slug)).join("/");
}

/** צומת הפניה: מפנה לפירוט שנמצא במקום אחר בתרשים (למשל "החומר המשותף עם 3 יחידות") */
const REF_PREFIX = "same-as-";
const isRefNode = (node: MapNode) => node.cat.slug.startsWith(REF_PREFIX);

/** תיאור שמתחיל ב"מפרשים:" מסמן קטעי מפרשים על הפרק — מוצג כסמל נוצה + בועת אליפסה */
const MEFORSHIM_PREFIX = "מפרשים:";
const meforshimOf = (node: MapNode): string[] | null => {
  const d = node.cat.description;
  if (!d?.startsWith(MEFORSHIM_PREFIX)) return null;
  return d
    .slice(MEFORSHIM_PREFIX.length)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
};

/**
 * תיאור שמתחיל ב"בחירה:" מסמן אחים שבוחרים ביניהם (או/או) —
 * הם מוצגים ריבוע ליד ריבוע עם סלש ביניהם, ומשפט ההסבר מתחת לקבוצה.
 */
const CHOICE_PREFIX = "בחירה:";
const choiceNoteOf = (node: MapNode): string | null => {
  const d = node.cat.description;
  return d?.startsWith(CHOICE_PREFIX) ? d.slice(CHOICE_PREFIX.length).trim() : null;
};
/** מקבץ אחים סמוכים שחולקים אותו משפט בחירה לקבוצה אחת; כל השאר — קבוצה של אחד */
function groupChoices(children: MapNode[]): MapNode[][] {
  const groups: MapNode[][] = [];
  for (const child of children) {
    const note = choiceNoteOf(child);
    const last = groups[groups.length - 1];
    if (note && last && choiceNoteOf(last[0]) === note) last.push(child);
    else groups.push([child]);
  }
  return groups;
}

/** האם לאחד הצאצאים של הצומת יש חלונית הסבר משלו (מפורטת יותר) */
const hasDeeperExplainer = (n: MapNode): boolean =>
  n.children.some((c) => !!getExplainer(c.chain.map((x) => x.slug)) || hasDeeperExplainer(c));

/**
 * הסבר ממוקד לצומת — רק מה שייחודי לו, בלי לחזור על מה שכבר הוסבר בחלון שמעליו:
 * - אם לאחד האבות יש הסבר בגרות מפורט (שכבר מפרט את כל מה שמתחתיו) — כאן רק פרטים של הפרק עצמו (מפרשים / מה לא נדרש);
 * - אחרת — התיאור של הצומת עצמו, ובלבד שאינו זהה לתיאור של אחד האבות.
 * אין מה להסביר? אין כפתור.
 */
function genericExplainerOf(node: MapNode, ctx: TreeCtx) {
  const findByPath = ctx.findByPath;
  const slugs = node.chain.map((c) => c.slug);
  const coveredAbove = slugs.slice(0, -1).some((_, i) => {
    const prefix = slugs.slice(0, i + 1);
    const anc = findByPath(prefix.join("/"));
    return !!anc && !!getExplainer(prefix) && !hasDeeperExplainer(anc);
  });
  const ancestorDescriptions = new Set(node.chain.slice(0, -1).map((c) => c.description).filter(Boolean));
  const d = node.cat.description;
  const meforshim = meforshimOf(node);
  const lines: string[] = [];
  // הסבר קצר לחלון (WINDOW_TEXT, נכתב לפי העץ); אם אין — הנוסח הקצר הישן (GENERIC_TEXT)
  // בטקסט החדש השורה הראשונה היא הכותרת — היא הופכת לכותרת החלונית (בלי לחזור עליה בגוף ההסבר)
  const win = WINDOW_TEXT[slugs.join("/")];
  const clear = win ? win.slice(1) : GENERIC_TEXT[slugs.join("/")];
  if (clear) lines.push(...clear);
  else if (meforshim) lines.push("קטעי מפרשים בפרק: " + meforshim.join("; "));
  else if (!coveredAbove && d && !ancestorDescriptions.has(d) && !ctx.isRepeatedDescription(node)) lines.push(choiceNoteOf(node) ?? d);
  if (node.cat.excludedNote) lines.push("✂ לא נדרש בתשפ״ז (מיקוד): " + node.cat.excludedNote);
  if (!lines.length) return undefined;
  return buildGenericExplainer({
    title: win ? win[0] : node.cat.title,
    description: lines.join(String.fromCharCode(10)),
    code: node.cat.questionnaireCode,
    ancestorTitles: win ? [] : node.chain.slice(0, -1).map((c) => c.title),
    childPaths: [],
  });
}

type TreeCtx = {
  isOpen: (id: number) => boolean;
  toggle: (id: number) => void;
  gotoRef: (node: MapNode) => void;
  resolveRef: (node: MapNode) => MapNode | null;
  /** צומת לפי נתיב slug מלא מהשורש (למשל "torah/3-units/external") — לפירוט "מה ללמד" בחלונית ההסבר */
  findByPath: (path: string) => MapNode | null;
  /** תיאור זהה לתיאור של צומת קודם בעץ (למשל הערת תנ״ך משותפת) — מוסבר רק פעם אחת */
  isRepeatedDescription: (node: MapNode) => boolean;
};

/**
 * צומת בסגנון משורטט: מלבן שקוף בקו דיו, כתב-יד, נצבע בריחוף.
 * לחיצה בכל מקום על הקופסה פותחת/סוגרת את הענף — לעולם אינה מנווטת.
 * רק החץ הקטן פותח את דף התיקייה (גם בצומת סופי).
 * צומת הפניה (slug שמתחיל ב-same-as-) קופץ אל הפירוט שאליו הוא מפנה.
 */
function NodeBox({
  node,
  level,
  accent,
  open,
  onToggle,
  compact = false,
  ctx,
}: {
  node: MapNode;
  level: number;
  accent: string;
  open?: boolean;
  onToggle?: () => void;
  compact?: boolean;
  ctx: TreeCtx;
}) {
  const hasChildren = node.children.length > 0;
  const ref = isRefNode(node);
  const refTarget = ref ? ctx.resolveRef(node) : null;
  const isFinal = !hasChildren && !ref;
  const excluded = node.cat.excluded;
  const ready = node.cat.ready;
  const [explainOpen, setExplainOpen] = useState(false);
  // כפתור הסבר רק בחלון המפורט ביותר: אם לצאצא יש הסבר משלו — לא מכפילים אותו כאן
  // הסבר בגרות מפורט רק בחלון העמוק ביותר; בכל צומת אחר עם תיאור — הסבר כללי (במקום מלל מתחת לריבוע)
  const custom = hasDeeperExplainer(node) ? undefined : getExplainer(node.chain.map((c) => c.slug));
  // פרק/סימן סופי — אין טעם להסבר משלו; הפרטים שלו (מפרשים, מה לא נדרש) מופיעים בפירוט של החלון שמעליו
  // טקסט ההסבר הקצר שנכתב לחלון (WINDOW_TEXT) קודם לכרטיסי הציון הישנים — כך כל החלונות באותו סגנון
  const generic = hasChildren ? genericExplainerOf(node, ctx) : undefined;
  const explainer = WINDOW_TEXT[node.chain.map((c) => c.slug).join("/")] && generic ? generic : (custom ?? generic);
  const explainCodes = custom ? codesOf(custom) : [];
  // תגית זהב על קצה החלון עצמו, רק כשיש סמל שאלון אחד; כל עוד יש כמה סמלים — לא מציגים כלום
  const windowCode = node.cat.questionnaireCode || (explainCodes.length === 1 ? explainCodes[0] : null);
  const style = { "--flow-accent": accent } as CSSProperties;
  const size = compact
    ? "px-2 py-0.5 text-sm max-w-[18rem]"
    : level === 0
      ? "px-3.5 py-2 text-xl max-w-[18rem]"
      : "px-2.5 py-1 text-base max-w-[18rem]";
  // הוי ורוד מעוצב בפינה הימנית-עליונה, בולט מעט מגבול הריבוע
  const readyMark = ready ? (
    <span
      className="flow-ready-mark"
      data-tip="כבר הוכן חומר לנושא זה"
      aria-label={`כבר הוכן חומר – ${node.cat.title}`}
    >
      <Check className="h-2 w-2" strokeWidth={3.5} aria-hidden />
    </span>
  ) : null;
  const boxClass = `flow-node ${level % 2 === 1 ? "flow-node--alt" : ""} ${
    ref ? "flow-node--ref" : ""
  } ${excluded ? "flow-node--excluded" : ""} ${
    open && hasChildren ? "flow-node--open" : ""
  } inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-ink ${size} ${
    hasChildren || ref ? "cursor-pointer" : ""
  } ${windowCode && compact ? "mt-2.5" : ""}`;

  const clickAction = ref ? () => ctx.gotoRef(node) : hasChildren ? onToggle : undefined;

  return (
    <>
    <div
      className="contents"
    >
    <div className={boxClass} style={style} onClick={clickAction}>
      {readyMark}
      {hasChildren || ref ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            clickAction?.();
          }}
          aria-expanded={ref ? undefined : open}
          className="flex min-w-0 flex-1 basis-[8rem] cursor-pointer items-center gap-1.5 text-start"
        >
          {ref ? (
            <Undo2 className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
          ) : (
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          )}
          <span className="min-w-0 leading-tight">
            <span className={excluded ? "line-through opacity-60" : ""}>{node.cat.title}</span>
          </span>
        </button>
      ) : (
        <span className="min-w-0 flex-1 basis-[8rem] leading-tight">
          <span className={excluded ? "line-through opacity-60" : ""}>{node.cat.title}</span>
        </span>
      )}
      {excluded && (
        <span
          tabIndex={0}
          className="shrink-0 rounded-full p-0.5 text-[#a33]"
          data-tip='ירד במיקוד תשפ"ז'
          aria-label={`ירד במיקוד תשפ"ז – ${node.cat.title}`}
        >
          <Scissors className="h-3.5 w-3.5" aria-hidden />
        </span>
      )}
      {windowCode && (
        <span
          className="q-code-tag flow-code-window px-2 py-px text-sm"
          title="סמל שאלון"
          aria-label={`סמל שאלון ${windowCode}`}
        >
          {windowCode}
        </span>
      )}
      {explainer && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExplainOpen(true);
          }}
          className="flow-explain-btn"
          data-tip="בואי תביני איך זה עובד"
          aria-label={`הסבר על ${explainer.title}`}
        >
          הסבר
        </button>
      )}
      <Link
        href={hrefFor(refTarget ? refTarget.chain : node.chain)}
        onClick={(e) => e.stopPropagation()}
        className="flow-arrow-circle shrink-0"
        data-tip={isFinal ? "ריבוע סופי – לחיצה פותחת את דף התיקייה" : "לפתיחת דף התיקייה"}
        aria-label={`פתיחת דף ${node.cat.title}`}
      >
        <ArrowUpLeft className="h-3 w-3" aria-hidden />
      </Link>
    </div>
    </div>
    {explainer && explainOpen && (
      <BagrutExplainDialog
        explainer={explainer}
        onClose={() => setExplainOpen(false)}
      />
    )}
    </>
  );
}

/**
 * ענף רקורסיבי: צומת מימין, קו מחבר, וילדים משמאל — רק כשהצומת פתוח.
 * כשכל הילדים הם צמתים סופיים (פרקים/סימנים/יצירות) — הם יורדים למטה,
 * כל פרק בשורה נפרדת, במקום להתרחב עוד שמאלה.
 */
function Branch({ node, level, accent, ctx }: { node: MapNode; level: number; accent: string; ctx: TreeCtx }) {
  const open = ctx.isOpen(node.cat.id);
  const hasChildren = node.children.length > 0;
  const allLeaves =
    hasChildren &&
    node.children.every((c) => c.children.length === 0) &&
    !node.children.some((c) => choiceNoteOf(c));

  return (
    <div className="flex items-start">
      <div id={`map-cat-${node.cat.id}`} className="flex flex-col items-start gap-1">
        <NodeBox
          node={node}
          level={level}
          accent={accent}
          open={open}
          onToggle={() => ctx.toggle(node.cat.id)}
          ctx={ctx}
        />
        {open && allLeaves && (
          <div className="flex flex-col">
            <span aria-hidden className="ms-6 h-3 w-px bg-ink/50" />
            <div className="flex flex-col items-start gap-1 ps-4">
              {node.children.map((child) => (
                <NodeBox
                  key={child.cat.id}
                  node={child}
                  level={level + 1}
                  accent={child.cat.color || accent}
                  compact
                  ctx={ctx}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {open && hasChildren && !allLeaves && (
        <>
          <span aria-hidden className="mt-4 h-px w-4 shrink-0 bg-ink/50" />
          <ul className="flex flex-col gap-6">
            {groupChoices(node.children).map((group) => (
              <li
                key={group[0].cat.id}
                className="flow-branch-line relative flex items-start ps-4 after:absolute after:right-0 after:top-4 after:h-px after:w-4 after:-translate-y-1/2 after:bg-ink/50"
              >
                {group.length > 1 ? (
                  <ChoiceGroup members={group} level={level + 1} accent={accent} ctx={ctx} />
                ) : (
                  <Branch
                    node={group[0]}
                    level={level + 1}
                    accent={group[0].cat.color || accent}
                    ctx={ctx}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * ילדי צומת מוצגים מתחתיו (ולא משמאלו) — משמש כשנפתח אחד מריבועי קבוצת "או/או",
 * כדי שהפירוט לא ידחף הצידה את הריבוע השני של הקבוצה.
 */
function ChildrenBelow({
  node,
  level,
  accent,
  ctx,
}: {
  node: MapNode;
  level: number;
  accent: string;
  ctx: TreeCtx;
}) {
  if (!node.children.length) return null;
  return (
    <div className="flex flex-col">
      <span aria-hidden className="ms-6 h-3 w-px bg-ink/50" />
      <ul className="flex flex-col gap-6 ps-4 pt-1">
        {node.children.map((child) => (
          <li
            key={child.cat.id}
            className="flow-branch-line relative flex items-start ps-4 after:absolute after:right-0 after:top-4 after:h-px after:w-4 after:-translate-y-1/2 after:bg-ink/50"
          >
            <Branch node={child} level={level + 1} accent={child.cat.color || accent} ctx={ctx} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * קבוצת "או/או": שני ריבועים (או יותר) זה לצד זה עם סלש ביניהם, ומתחתם משפט
 * שמסביר שבוחרים ביניהם. לחיצה על ריבוע פותחת אותו מתחת לקבוצה וסוגרת את השני —
 * כי בפועל לומדים רק אחד מהם.
 */
function ChoiceGroup({
  members,
  level,
  accent,
  ctx,
}: {
  members: MapNode[];
  level: number;
  accent: string;
  ctx: TreeCtx;
}) {
  const openMember = members.find((m) => ctx.isOpen(m.cat.id)) ?? null;
  const pick = (m: MapNode) => {
    for (const other of members)
      if (other !== m && ctx.isOpen(other.cat.id)) ctx.toggle(other.cat.id);
    ctx.toggle(m.cat.id);
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        {members.map((m, i) => (
          <div key={m.cat.id} className="flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden className="flow-choice-slash">
                /
              </span>
            )}
            <div id={`map-cat-${m.cat.id}`} className="flex flex-col items-start">
              <NodeBox
                node={m}
                level={level}
                accent={m.cat.color || accent}
                open={ctx.isOpen(m.cat.id)}
                onToggle={() => pick(m)}
                ctx={ctx}
              />
            </div>
          </div>
        ))}
      </div>
      {openMember && (
        <ChildrenBelow
          node={openMember}
          level={level}
          accent={openMember.cat.color || accent}
          ctx={ctx}
        />
      )}
    </div>
  );
}

/**
 * חלק מהמקצועות בעץ הם בפועל בגרות אחת משותפת (שאלון/סמל משותף), אף שהם מופיעים
 * כמה שורשים נפרדים — מקובצים ויזואלית עם סוגר וכותרת משותפת כדי שזה יהיה ברור
 * גם במפה (לא רק בטקסט ההסבר בכל אחד).
 */
const ROOT_GROUPS: { slugs: Set<string>; label: string }[] = [
  {
    slugs: new Set(["torah", "navi", "ktuvim"]),
    label: "",
  },
  {
    slugs: new Set(["lashon-tzurot", "lashon-tachbir", "lashon-havaa"]),
    label: "",
  },
  {
    slugs: new Set(["yahadut", "dinim"]),
    label: "",
  },
];
const groupOf = (slug: string) => ROOT_GROUPS.find((g) => g.slugs.has(slug));

/** מקבץ רצף שורשים סמוכים ששייכים לאותה קבוצת בגרות לקבוצה אחת; כל שאר השורשים נשארים קבוצה של אחד */
function groupRoots(tree: MapNode[]): MapNode[][] {
  const groups: MapNode[][] = [];
  for (const root of tree) {
    const def = groupOf(root.cat.slug);
    const last = groups[groups.length - 1];
    const lastDef = last?.[0] && groupOf(last[0].cat.slug);
    if (def && lastDef === def) {
      last.push(root);
    } else {
      groups.push([root]);
    }
  }
  return groups;
}

/** כמה שורשים זה לצד זה, עם סוגר וכותרת שמסבירים שמדובר באותה בגרות */
function RootsGroup({ roots, label, ctx }: { roots: MapNode[]; label: string; ctx: TreeCtx }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <div className="mr-7 flex items-center gap-1.5 text-xs font-bold text-muted">
          <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{label}</span>
        </div>
      )}
      <div className="relative flex flex-col gap-16 pr-4">
        <span
          aria-hidden
          className="roots-bracket pointer-events-none absolute bottom-1 right-0 top-1 w-3 rounded-br-2xl rounded-tr-2xl"
        />
        {roots.map((root) => (
          <div key={root.cat.id} className="min-w-max">
            <Branch
              node={root}
              level={0}
              accent={SUBJECT_COLORS[root.cat.slug] || root.cat.color || "var(--sun)"}
              ctx={ctx}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BagrutMapTree({ tree }: { tree: MapNode[] }) {
  // מקצוע שכל בניו סופיים (למשל אנגלית, אזרחות) מתחיל סגור — הפירוט רק בלחיצה
  const [openIds, setOpenIds] = useState<Set<number>>(
    () =>
      new Set(
        tree
          .filter((r) => r.children.length > 0 && !r.children.every((c) => c.children.length === 0))
          .map((r) => r.cat.id),
      ),
  );

  const bySlugInRoot = useMemo(() => {
    const map = new Map<string, MapNode>();
    const walk = (n: MapNode, rootId: number) => {
      map.set(`${rootId}:${n.cat.slug}`, n);
      n.children.forEach((c) => walk(c, rootId));
    };
    tree.forEach((r) => walk(r, r.cat.id));
    return map;
  }, [tree]);

  const byPath = useMemo(() => {
    const map = new Map<string, MapNode>();
    const walk = (n: MapNode) => {
      map.set(n.chain.map((c) => c.slug).join("/"), n);
      n.children.forEach(walk);
    };
    tree.forEach(walk);
    return map;
  }, [tree]);

  const repeatedIds = useMemo(() => {
    const seen = new Set<string>();
    const repeated = new Set<number>();
    const walk = (n: MapNode) => {
      const d = n.cat.description;
      if (d) {
        if (seen.has(d)) repeated.add(n.cat.id);
        else seen.add(d);
      }
      n.children.forEach(walk);
    };
    tree.forEach(walk);
    return repeated;
  }, [tree]);

  const resolveRef = (node: MapNode): MapNode | null => {
    const targetSlug = node.cat.slug.slice(REF_PREFIX.length);
    const rootId = node.chain[0].id;
    return bySlugInRoot.get(`${rootId}:${targetSlug}`) ?? null;
  };

  const gotoRef = (node: MapNode) => {
    const target = resolveRef(node);
    if (!target) return;
    setOpenIds((prev) => new Set([...prev, ...target.chain.map((c) => c.id)]));
    setTimeout(() => {
      const el = document.getElementById(`map-cat-${target.cat.id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      el.classList.add("flow-flash");
      setTimeout(() => el.classList.remove("flow-flash"), 1800);
    }, 80);
  };

  const ctx: TreeCtx = {
    isOpen: (id) => openIds.has(id),
    toggle: (id) =>
      setOpenIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    gotoRef,
    resolveRef,
    findByPath: (path) => byPath.get(path) ?? null,
    isRepeatedDescription: (node) => repeatedIds.has(node.cat.id),
  };

  const rootGroups = useMemo(() => groupRoots(tree), [tree]);

  return (
    <div data-map-scroll-x="" className="flex flex-col gap-16 overflow-x-auto pb-2 pt-12">
      {rootGroups.map((group) =>
        group.length > 1 ? (
          <RootsGroup
            key={group[0].cat.id}
            roots={group}
            label={groupOf(group[0].cat.slug)!.label}
            ctx={ctx}
          />
        ) : (
          <div key={group[0].cat.id} className="min-w-max">
            <Branch
              node={group[0]}
              level={0}
              accent={SUBJECT_COLORS[group[0].cat.slug] || group[0].cat.color || "var(--sun)"}
              ctx={ctx}
            />
          </div>
        ),
      )}
    </div>
  );
}
