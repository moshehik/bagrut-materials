import Link from "next/link";
import { qs } from "@/lib/admin-analytics";

/* ---------- אריחי KPI ---------- */

export function StatTile({
  label,
  value,
  hint,
  tone = "bg-oak-soft text-oak-deep",
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: string;
  href?: string;
}) {
  const inner = (
    <>
      <span className={`chip ${tone}`}>{label}</span>
      <div className="mt-3 text-2xl sm:text-3xl font-bold font-display tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card card-hover p-4 block">
      {inner}
    </Link>
  ) : (
    <div className="card p-4">{inner}</div>
  );
}

/* ---------- עימוד ---------- */

export function Pagination({
  page,
  pageSize,
  total,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  params: Record<string, string | number | undefined | null>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-muted">
        מציגה {from.toLocaleString("he-IL")}–{to.toLocaleString("he-IL")} מתוך {total.toLocaleString("he-IL")}
      </span>
      <div className="ms-auto flex items-center gap-1">
        <Link
          aria-disabled={page <= 1}
          className={`btn btn-ghost !py-1 !px-3 text-xs ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
          href={qs(params, { page: page - 1 })}
        >
          הקודם
        </Link>
        <span className="px-2 tabular-nums">
          {page} / {pages}
        </span>
        <Link
          aria-disabled={page >= pages}
          className={`btn btn-ghost !py-1 !px-3 text-xs ${page >= pages ? "pointer-events-none opacity-40" : ""}`}
          href={qs(params, { page: page + 1 })}
        >
          הבא
        </Link>
      </div>
    </div>
  );
}

/* ---------- טבלה ---------- */

export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`py-2 pe-3 font-medium whitespace-nowrap ${className}`}>{children}</th>;
}
export function Td({
  children,
  className = "",
  dir,
  title,
}: {
  children?: React.ReactNode;
  className?: string;
  dir?: "ltr" | "rtl";
  title?: string;
}) {
  return (
    <td className={`py-2 pe-3 align-top ${className}`} dir={dir} title={title}>
      {children}
    </td>
  );
}

export function EmptyRow({ cols, text = "אין נתונים להצגה." }: { cols: number; text?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-8 text-center text-muted text-sm">
        {text}
      </td>
    </tr>
  );
}

/* ---------- גרפים (SVG inline) ---------- */

export type Point = { label: string; value: number };

const nf = (n: number) => n.toLocaleString("he-IL", { maximumFractionDigits: 1 });

/** גרף עמודות פשוט */
export function BarChart({
  data,
  color = "var(--oak)",
  height = 140,
  format = nf,
  title,
}: {
  data: Point[];
  color?: string;
  height?: number;
  format?: (n: number) => string;
  title?: string;
}) {
  const w = 600;
  const padB = 22;
  const padT = 8;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = Math.max(1, data.length);
  const gap = n > 40 ? 1 : 3;
  const bw = (w - gap * (n - 1)) / n;
  const labelEvery = n <= 10 ? 1 : n <= 31 ? 5 : Math.ceil(n / 8);
  return (
    <div className="w-full">
      {title && <div className="text-xs text-muted mb-1">{title}</div>}
      {data.length === 0 || max <= 1 && data.every((d) => d.value === 0) ? (
        <div className="text-muted text-sm py-6 text-center">אין נתונים בטווח.</div>
      ) : (
        <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-auto" role="img" aria-label={title ?? "גרף עמודות"}>
          <line x1={0} x2={w} y1={height - padB + 0.5} y2={height - padB + 0.5} stroke="currentColor" opacity={0.12} />
          {data.map((d, i) => {
            const h = ((height - padB - padT) * d.value) / max;
            const x = i * (bw + gap);
            const y = height - padB - h;
            return (
              <g key={i}>
                <rect x={x} y={y} width={bw} height={Math.max(h, d.value > 0 ? 2 : 0)} rx={bw > 6 ? 3 : 1} fill={color} opacity={0.85}>
                  <title>
                    {d.label}: {format(d.value)}
                  </title>
                </rect>
                {i % labelEvery === 0 && (
                  <text x={x + bw / 2} y={height - 6} fontSize={10} textAnchor="middle" fill="currentColor" opacity={0.6}>
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
          <text x={w - 2} y={padT + 8} fontSize={10} textAnchor="end" fill="currentColor" opacity={0.6}>
            מקס׳ {format(max)}
          </text>
        </svg>
      )}
    </div>
  );
}

/** גרף קו */
export function LineChart({
  data,
  color = "var(--blue)",
  height = 140,
  format = nf,
  title,
  fill = true,
}: {
  data: Point[];
  color?: string;
  height?: number;
  format?: (n: number) => string;
  title?: string;
  fill?: boolean;
}) {
  const w = 600;
  const padB = 22;
  const padT = 10;
  const padX = 6;
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  const step = n > 1 ? (w - padX * 2) / (n - 1) : 0;
  const pts = data.map((d, i) => {
    const x = padX + i * step;
    const y = height - padB - ((height - padB - padT) * d.value) / max;
    return [x, y] as const;
  });
  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = pts.length
    ? `${path} L${pts[pts.length - 1][0].toFixed(1)},${height - padB} L${pts[0][0].toFixed(1)},${height - padB} Z`
    : "";
  const labelEvery = n <= 10 ? 1 : n <= 31 ? 5 : Math.ceil(n / 8);
  return (
    <div className="w-full">
      {title && <div className="text-xs text-muted mb-1">{title}</div>}
      {n === 0 || data.every((d) => d.value === 0) ? (
        <div className="text-muted text-sm py-6 text-center">אין נתונים בטווח.</div>
      ) : (
        <svg viewBox={`0 0 ${w} ${height}`} className="w-full h-auto" role="img" aria-label={title ?? "גרף קו"}>
          <line x1={0} x2={w} y1={height - padB + 0.5} y2={height - padB + 0.5} stroke="currentColor" opacity={0.12} />
          {fill && <path d={area} fill={color} opacity={0.12} />}
          <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {pts.map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r={n > 40 ? 1.5 : 3} fill={color}>
                <title>
                  {data[i].label}: {format(data[i].value)}
                </title>
              </circle>
              {i % labelEvery === 0 && (
                <text x={x} y={height - 6} fontSize={10} textAnchor="middle" fill="currentColor" opacity={0.6}>
                  {data[i].label}
                </text>
              )}
            </g>
          ))}
          <text x={w - 2} y={padT} fontSize={10} textAnchor="end" fill="currentColor" opacity={0.6}>
            מקס׳ {format(max)}
          </text>
        </svg>
      )}
    </div>
  );
}

/** רשימת "טופ" עם פס יחסי */
export function TopList({
  items,
  format = (n: number) => n.toLocaleString("he-IL"),
  color = "var(--oak)",
  emptyText = "אין נתונים.",
}: {
  items: { label: React.ReactNode; value: number; key?: string | number; sub?: React.ReactNode }[];
  format?: (n: number) => string;
  color?: string;
  emptyText?: string;
}) {
  if (items.length === 0) return <p className="text-muted text-sm">{emptyText}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2 text-sm">
      {items.map((it, i) => (
        <li key={it.key ?? i}>
          <div className="flex items-baseline gap-2">
            <span className="text-muted text-xs w-5 tabular-nums">{i + 1}.</span>
            <span className="min-w-0 truncate flex-1">{it.label}</span>
            <span className="font-semibold tabular-nums">{format(it.value)}</span>
          </div>
          {it.sub && <div className="text-xs text-muted ps-7">{it.sub}</div>}
          <div className="ms-7 mt-1 h-1.5 rounded-full bg-foreground/5 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(100 * it.value) / max}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
