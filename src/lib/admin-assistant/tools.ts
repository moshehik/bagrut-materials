import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { runDownloadAudit } from "@/lib/download-audit";
import { redactSecrets } from "@/lib/agentEvents";
import { dataStr, dateArg, enumArg, intArg, likePattern, maskEmail, scrubFreeText, strArg } from "./logic";

/**
 * הכלים של עוזר ה-AI למנהלת: פונקציות קבועות, מפורמטרות, לקריאה בלבד. המודל בוחר כלי ופרמטרים – הוא לא כותב SQL ולא נוגע במסד.
 * כל פרמטר עובר אימות/חיתוך (logic.ts), וכל ערך שמגיע מה-DB נכנס לשאילתה רק כפרמטר (sql`${x}`), לעולם לא כטקסט.
 * מה שחוזר למודל הוא נתונים בלבד: בלי סיסמאות/גיבובים/אסימונים/מפתחות, בלי מיילים וטלפונים מלאים; טקסט חופשי מנוקה (scrubFreeText).
 */

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => ((r as { rows?: Row[] }).rows ?? (r as Row[]) ?? []) as Row[];
const q = async (query: ReturnType<typeof sql>) => rowsOf(await db.execute(query));
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const iso = (v: unknown) => (v ? new Date(v as string | number | Date).toISOString() : null);
/** באגורות → שקלים */
const ils = (agorot: unknown) => Math.round(n(agorot)) / 100;
const clean = (v: unknown, max = 160) => scrubFreeText(redactSecrets(dataStr(v, max)));

export type AssistantTool = {
  name: string;
  /** תיאור למודל המתכנן (עברית) – מה הכלי עושה ומתי להשתמש בו */
  description: string;
  /** תיאור הפרמטרים למתכנן */
  params: string;
  /** שם להצגה בממשק (ציפים של "בדקתי") */
  label: string;
  run: (args: Record<string, unknown>) => Promise<unknown>;
};

const SUBSCRIPTION_PLANS = "('subject_monthly','custom_monthly','yearly','substitute_3m','substitute_daily')";

const siteOverview: AssistantTool = {
  name: "site_overview",
  label: "סקירת האתר",
  description: "תמונת מצב כללית: משתמשות (סה\"כ וחדשות), הורדות, צפיות, הכנסות, מנויים פעילים, חומרים לפי סטטוס, ופריטים פתוחים לטיפול (דיווחי תקלות, בקשות שינוי, דיווחי פורום).",
  params: "days (1-90, ברירת מחדל 7) – אורך התקופה לספירה",
  run: async (a) => {
    const days = intArg(a.days, 1, 90, 7);
    const one = async (query: ReturnType<typeof sql>) => n((await q(query))[0]?.n);
    const [usersTotal, usersNew, dlPeriod, dlToday, views, revenue, refunds, activeSubs, matStatus, openErrors, pendingFixes, openForum] = await Promise.all([
      one(sql`SELECT count(*)::int n FROM users`),
      one(sql`SELECT count(*)::int n FROM users WHERE created_at >= now() - make_interval(days => ${days})`),
      one(sql`SELECT count(*)::int n FROM downloads WHERE created_at >= now() - make_interval(days => ${days})`),
      one(sql`SELECT count(*)::int n FROM downloads WHERE created_at >= date_trunc('day', now())`),
      one(sql`SELECT count(*)::int n FROM page_views WHERE created_at >= now() - make_interval(days => ${days})`),
      one(sql`SELECT coalesce(sum(amount),0)::bigint n FROM transactions WHERE type IN ('charge','manual') AND created_at >= now() - make_interval(days => ${days})`),
      one(sql`SELECT coalesce(sum(amount),0)::bigint n FROM transactions WHERE type = 'refund' AND created_at >= now() - make_interval(days => ${days})`),
      one(sql.raw(`SELECT count(*)::int n FROM purchases WHERE status = 'active' AND (ends_at IS NULL OR ends_at > now()) AND plan IN ${SUBSCRIPTION_PLANS}`)),
      q(sql`SELECT status, count(*)::int n FROM materials GROUP BY status`),
      one(sql`SELECT count(*)::int n FROM error_reports WHERE status = 'OPEN' AND kind = 'report'`),
      one(sql`SELECT count(*)::int n FROM material_fixes WHERE status = 'pending'`),
      one(sql`SELECT count(*)::int n FROM forum_reports WHERE status = 'open'`),
    ]);
    return {
      periodDays: days,
      users: { total: usersTotal, newInPeriod: usersNew },
      downloads: { inPeriod: dlPeriod, today: dlToday },
      pageViewsInPeriod: views,
      revenueIlsInPeriod: ils(revenue),
      refundsIlsInPeriod: ils(refunds),
      activeSubscriptionsNow: activeSubs,
      materialsByStatus: Object.fromEntries(matStatus.map((r) => [String(r.status), n(r.n)])),
      openForAttention: { openErrorReports: openErrors, pendingFixRequests: pendingFixes, openForumReports: openForum },
    };
  },
};

const DAILY_METRICS = ["downloads", "signups", "revenue", "page_views"] as const;
const dailySeries: AssistantTool = {
  name: "daily_series",
  label: "סדרה יומית",
  description: "מספרים לפי יום (להשוואות/מגמות): הורדות, הרשמות חדשות, הכנסות או צפיות בדפים.",
  params: `metric (${DAILY_METRICS.join(" | ")}), days (1-60, ברירת מחדל 14)`,
  run: async (a) => {
    const metric = enumArg(a.metric, DAILY_METRICS, "downloads");
    const days = intArg(a.days, 1, 60, 14);
    const day = sql.raw(`to_char(date_trunc('day', created_at), 'YYYY-MM-DD')`);
    const since = sql`created_at >= date_trunc('day', now()) - make_interval(days => ${days - 1})`;
    const rows =
      metric === "downloads"
        ? await q(sql`SELECT ${day} d, count(*)::int v FROM downloads WHERE ${since} GROUP BY 1 ORDER BY 1`)
        : metric === "signups"
          ? await q(sql`SELECT ${day} d, count(*)::int v FROM users WHERE ${since} GROUP BY 1 ORDER BY 1`)
          : metric === "page_views"
            ? await q(sql`SELECT ${day} d, count(*)::int v FROM page_views WHERE ${since} GROUP BY 1 ORDER BY 1`)
            : await q(sql`SELECT ${day} d, coalesce(sum(amount),0)::bigint v FROM transactions WHERE type IN ('charge','manual') AND ${since} GROUP BY 1 ORDER BY 1`);
    const byDay = new Map(rows.map((r) => [String(r.d), metric === "revenue" ? ils(r.v) : n(r.v)]));
    const out: { day: string; value: number }[] = [];
    const start = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(start.getTime() - i * 86400000).toISOString().slice(0, 10);
      out.push({ day: d, value: byDay.get(d) ?? 0 });
    }
    return { metric, unit: metric === "revenue" ? "ש\"ח" : "מספר", days, series: out };
  },
};

const topMaterials: AssistantTool = {
  name: "top_materials",
  label: "חומרים מורדים ביותר",
  description: "החומרים עם הכי הרבה הורדות בתקופה.",
  params: "days (1-90, ברירת מחדל 30), limit (1-15, ברירת מחדל 10)",
  run: async (a) => {
    const days = intArg(a.days, 1, 90, 30);
    const limit = intArg(a.limit, 1, 15, 10);
    const rows = await q(sql`
      SELECT m.id, m.title, m.access, m.status, c.title AS category, count(d.id)::int AS n
      FROM downloads d JOIN materials m ON m.id = d.material_id LEFT JOIN categories c ON c.id = m.category_id
      WHERE d.created_at >= now() - make_interval(days => ${days})
      GROUP BY m.id, m.title, m.access, m.status, c.title ORDER BY n DESC LIMIT ${limit}`);
    return { days, materials: rows.map((r) => ({ id: n(r.id), title: dataStr(r.title, 100), category: dataStr(r.category, 60), access: r.access, status: r.status, downloads: n(r.n) })) };
  },
};

const topUsers: AssistantTool = {
  name: "top_users",
  label: "המורידות הפעילות ביותר",
  description: "המשתמשות עם הכי הרבה הורדות בתקופה (שם ומזהה בלבד).",
  params: "days (1-90, ברירת מחדל 30), limit (1-15, ברירת מחדל 10)",
  run: async (a) => {
    const days = intArg(a.days, 1, 90, 30);
    const limit = intArg(a.limit, 1, 15, 10);
    const rows = await q(sql`
      SELECT u.id, u.name, u.role, count(d.id)::int AS n
      FROM downloads d JOIN users u ON u.id = d.user_id
      WHERE d.created_at >= now() - make_interval(days => ${days})
      GROUP BY u.id, u.name, u.role ORDER BY n DESC LIMIT ${limit}`);
    return { days, users: rows.map((r) => ({ userId: n(r.id), name: dataStr(r.name, 60), role: r.role, downloads: n(r.n) })) };
  },
};

const MATERIAL_STATUS = ["any", "active", "draft", "suspended"] as const;
const MATERIAL_ACCESS = ["any", "free", "paid"] as const;
const findMaterials: AssistantTool = {
  name: "find_materials",
  label: "חיפוש חומרים",
  description: "חיפוש חומרים לפי חלק מהכותרת (ואפשר גם לפי סטטוס/גישה). מחזיר גם כמה חומרים תואמים בסך הכל. בלי query – רק לפי סטטוס/גישה.",
  params: `query (טקסט, אופציונלי), status (${MATERIAL_STATUS.join(" | ")}), access (${MATERIAL_ACCESS.join(" | ")}), limit (1-20, ברירת מחדל 10)`,
  run: async (a) => {
    const query = strArg(a.query, 80);
    const status = enumArg(a.status, MATERIAL_STATUS, "any");
    const access = enumArg(a.access, MATERIAL_ACCESS, "any");
    const limit = intArg(a.limit, 1, 20, 10);
    const where = sql`(${query === "" ? sql`true` : sql`m.title ILIKE ${likePattern(query)}`}) AND (${status === "any" ? sql`true` : sql`m.status::text = ${status}`}) AND (${access === "any" ? sql`true` : access === "free" ? sql`m.access = 'free'` : sql`m.access <> 'free'`})`;
    const [rows, total] = await Promise.all([
      q(sql`SELECT m.id, m.title, m.status, m.access, m.price, m.downloads, m.kind, c.title AS category FROM materials m LEFT JOIN categories c ON c.id = m.category_id WHERE ${where} ORDER BY m.downloads DESC, m.id DESC LIMIT ${limit}`),
      q(sql`SELECT count(*)::int n FROM materials m WHERE ${where}`),
    ]);
    return {
      totalMatches: n(total[0]?.n),
      shown: rows.length,
      materials: rows.map((r) => ({ id: n(r.id), title: dataStr(r.title, 100), category: dataStr(r.category, 60), status: r.status, access: r.access, priceIls: ils(r.price), downloads: n(r.downloads), kind: r.kind })),
    };
  },
};

const materialsSummary: AssistantTool = {
  name: "materials_summary",
  label: "סיכום חומרים",
  description: "כמה חומרים יש לפי סטטוס (פעיל/טיוטה/מושהה) וגישה (חינם/בתשלום), וכמה לפי סוג קובץ.",
  params: "בלי פרמטרים",
  run: async () => {
    const [byStatusAccess, byKind] = await Promise.all([
      q(sql`SELECT status, access, count(*)::int n FROM materials GROUP BY status, access ORDER BY status, access`),
      q(sql`SELECT kind, count(*)::int n FROM materials WHERE status = 'active' GROUP BY kind ORDER BY n DESC`),
    ]);
    return {
      byStatusAndAccess: byStatusAccess.map((r) => ({ status: r.status, access: r.access, count: n(r.n) })),
      activeByKind: byKind.map((r) => ({ kind: r.kind, count: n(r.n) })),
    };
  },
};

const findUser: AssistantTool = {
  name: "find_user",
  label: "פרטי משתמשת",
  description: "מחפש משתמשת לפי מייל (מלא או חלקי) או שם, ומחזיר: תפקיד, השהיה, הרשמה, נראתה לאחרונה, הורדות, והמנויים/רכישות שלה (isActiveNow = יש מנוי/גישה בתוקף כרגע; תוקף; מכסה). אין דרגת מנוי – המנוי נקבע רק לפי הרכישות. לשאלות כמו \"האם למורה X יש מנוי?\".",
  params: "query (מייל או שם, חובה), limit (1-5, ברירת מחדל 3)",
  run: async (a) => {
    const query = strArg(a.query, 80);
    if (query.length < 2) return { error: "צריך לפחות 2 תווים לחיפוש" };
    const limit = intArg(a.limit, 1, 5, 3);
    const pat = likePattern(query);
    const us = await q(sql`
      SELECT id, email, name, role, suspended, suspend_reason, email_verified, created_at, last_seen_at, notes
      FROM users WHERE email ILIKE ${pat} OR name ILIKE ${pat} OR (first_name || ' ' || last_name) ILIKE ${pat}
      ORDER BY (lower(email) = lower(${query})) DESC, last_seen_at DESC NULLS LAST LIMIT ${limit}`);
    const out = [];
    for (const u of us) {
      const id = n(u.id);
      const [dl, purs] = await Promise.all([
        q(sql`SELECT count(*)::int total, count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int d30, max(created_at) last FROM downloads WHERE user_id = ${id}`),
        q(sql`SELECT p.id, p.plan, p.status, p.amount, p.starts_at, p.ends_at, p.downloads_limit, p.downloads_used, p.subjects_pending, p.term_days, m.title AS material, c.title AS category
              FROM purchases p LEFT JOIN materials m ON m.id = p.material_id LEFT JOIN categories c ON c.id = p.category_id
              WHERE p.user_id = ${id} ORDER BY p.created_at DESC LIMIT 8`),
      ]);
      out.push({
        userId: id,
        name: dataStr(u.name, 60),
        emailMasked: maskEmail(String(u.email ?? "")),
        role: u.role,
        suspended: !!u.suspended,
        suspendReason: u.suspended ? clean(u.suspend_reason, 120) : null,
        emailVerified: !!u.email_verified,
        registeredAt: iso(u.created_at),
        lastSeenAt: iso(u.last_seen_at),
        adminNote: u.notes ? clean(u.notes, 160) : null,
        downloads: { total: n(dl[0]?.total), last30Days: n(dl[0]?.d30), lastAt: iso(dl[0]?.last) },
        purchases: purs.map((p) => {
          const ends = p.ends_at ? new Date(p.ends_at as string) : null;
          const notStarted = !ends && p.term_days != null; // מנוי שמתחיל בהורדה הראשונה
          return {
            purchaseId: n(p.id),
            plan: p.plan,
            status: p.status,
            amountIls: ils(p.amount),
            startsAt: iso(p.starts_at),
            endsAt: iso(p.ends_at),
            isActiveNow: p.status === "active" && (!ends || ends.getTime() > Date.now()),
            startsAtFirstDownload: notStarted,
            downloadsUsed: p.downloads_used === null ? null : n(p.downloads_used),
            downloadsLimit: p.downloads_limit === null ? null : n(p.downloads_limit),
            subjectsPending: !!p.subjects_pending,
            item: dataStr(p.material ?? p.category ?? "", 80) || null,
          };
        }),
      });
    }
    return { matches: out.length, users: out };
  },
};

const purchasesSummary: AssistantTool = {
  name: "purchases_summary",
  label: "סיכום רכישות",
  description: "כמה רכישות/מנויים נמכרו בתקופה לפי סוג מסלול (הורדה בודדת, קובץ מורחב, שנתי, ממלאת מקום...), וסכום.",
  params: "days (1-365, ברירת מחדל 30)",
  run: async (a) => {
    const days = intArg(a.days, 1, 365, 30);
    const rows = await q(sql`SELECT plan, status, count(*)::int n, coalesce(sum(amount),0)::bigint total FROM purchases WHERE created_at >= now() - make_interval(days => ${days}) GROUP BY plan, status ORDER BY plan, status`);
    return { days, rows: rows.map((r) => ({ plan: r.plan, status: r.status, count: n(r.n), totalIls: ils(r.total) })) };
  },
};

const recentErrors: AssistantTool = {
  name: "recent_errors",
  label: "דיווחי תקלות",
  description: "דיווחי תקלות/שאלות פתוחים מהמשתמשות (טבלת error_reports), ובנוסף שגיאות אחרונות ביומן הסוכן.",
  params: "limit (1-15, ברירת מחדל 8)",
  run: async (a) => {
    const limit = intArg(a.limit, 1, 15, 8);
    const [reports, openCount, agentErrs] = await Promise.all([
      q(sql`SELECT id, created_at, url, title, user_text FROM error_reports WHERE status = 'OPEN' AND kind = 'report' ORDER BY created_at DESC LIMIT ${limit}`),
      q(sql`SELECT count(*)::int n FROM error_reports WHERE status = 'OPEN' AND kind = 'report'`),
      q(sql`SELECT created_at, source, summary FROM agent_events WHERE kind = 'error' ORDER BY created_at DESC LIMIT ${Math.min(limit, 8)}`),
    ]);
    return {
      openReportsTotal: n(openCount[0]?.n),
      openReports: reports.map((r) => ({ id: dataStr(r.id, 36), at: iso(r.created_at), url: dataStr(r.url, 120), title: clean(r.title, 100), text: clean(r.user_text, 240) })),
      recentAgentErrors: agentErrs.map((r) => ({ at: iso(r.created_at), source: r.source, summary: clean(r.summary, 200) })),
    };
  },
};

const AGENT_KINDS = ["any", "error", "run.end", "reply", "pr"] as const;
const agentActivity: AssistantTool = {
  name: "agent_activity",
  label: "פעילות סוכן קלוד",
  description: "האירועים האחרונים ביומן סוכן קלוד (הסוכן שמטפל בדיווחי תקלות): ריצות, תשובות, שגיאות.",
  params: `limit (1-20, ברירת מחדל 10), kind (${AGENT_KINDS.join(" | ")})`,
  run: async (a) => {
    const limit = intArg(a.limit, 1, 20, 10);
    const kind = enumArg(a.kind, AGENT_KINDS, "any");
    const rows = await q(sql`SELECT created_at, source, kind, summary FROM agent_events WHERE (${kind === "any" ? sql`true` : sql`kind = ${kind}`}) ORDER BY created_at DESC LIMIT ${limit}`);
    const st = await q(sql`SELECT enabled, last_activity_at FROM agent_loop_status WHERE id = 1`);
    return {
      loopEnabled: st[0] ? !!st[0].enabled : null,
      lastActivityAt: iso(st[0]?.last_activity_at),
      events: rows.map((r) => ({ at: iso(r.created_at), source: r.source, kind: r.kind, summary: clean(r.summary, 200) })),
    };
  },
};

const auditLog: AssistantTool = {
  name: "audit_log",
  label: "לוג פעולות",
  description: "פעולות אחרונות בלוג הפעולות (מי עשתה מה: עריכת חומר, שינוי הגדרות, השהיית משתמשת, התחברויות וכו').",
  params: "limit (1-30, ברירת מחדל 15), days (1-90, ברירת מחדל 14), actionContains (חלק משם הפעולה, אופציונלי, למשל \"settings\" או \"material\")",
  run: async (a) => {
    const limit = intArg(a.limit, 1, 30, 15);
    const days = intArg(a.days, 1, 90, 14);
    const act = strArg(a.actionContains, 40);
    const rows = await q(sql`
      SELECT l.created_at, l.action, l.entity_type, l.entity_id, l.details, u.name AS actor
      FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id
      WHERE l.created_at >= now() - make_interval(days => ${days}) AND (${act === "" ? sql`true` : sql`l.action ILIKE ${likePattern(act)}`})
      ORDER BY l.created_at DESC LIMIT ${limit}`);
    return { days, actions: rows.map((r) => ({ at: iso(r.created_at), action: r.action, actor: dataStr(r.actor, 40) || null, entity: r.entity_type ? `${r.entity_type}${r.entity_id ? "#" + r.entity_id : ""}` : null, details: r.details ? clean(r.details, 160) : null })) };
  },
};

const paymentsStatus: AssistantTool = {
  name: "payments_status",
  label: "תשלומי נדרים",
  description: "מצב התשלומים דרך נדרים פלוס: כמה בקשות לפי סטטוס (pending/processing/paid...), סכום ששולם, ובקשות שנתקעו במצב processing (דורשות בדיקה ב-/admin/payments).",
  params: "days (1-90, ברירת מחדל 30)",
  run: async (a) => {
    const days = intArg(a.days, 1, 90, 30);
    const [byStatus, stuck] = await Promise.all([
      q(sql`SELECT status, count(*)::int n, coalesce(sum(amount),0)::bigint total FROM nedarim_payments WHERE created_at >= now() - make_interval(days => ${days}) GROUP BY status ORDER BY status`),
      q(sql`SELECT id, reference, plan, amount, created_at, error_message FROM nedarim_payments WHERE status = 'processing' ORDER BY created_at DESC LIMIT 10`),
    ]);
    return {
      days,
      byStatus: byStatus.map((r) => ({ status: r.status, count: n(r.n), totalIls: ils(r.total) })),
      processingNeedsReview: stuck.map((r) => ({ id: n(r.id), reference: r.reference, plan: r.plan, amountIls: ils(r.amount), createdAt: iso(r.created_at), reason: clean(r.error_message, 140) })),
    };
  },
};

const downloadAudit: AssistantTool = {
  name: "download_audit",
  label: "בדיקת הרשאות הורדה",
  description: "מריץ את בדיקת הרשאות ההורדה (קריאה בלבד): האם הייתה זכות להוריד לכל הורדה. מחזיר סיכום, ורשימה של הורדות חשודות. כבד – רק כששואלים במפורש על חריגות/הורדות ללא הרשאה.",
  params: "from (YYYY-MM-DD, אופציונלי), to (YYYY-MM-DD, אופציונלי)",
  run: async (a) => {
    const from = dateArg(a.from);
    const to = dateArg(a.to);
    const r = await runDownloadAudit({ from: from ? new Date(from + "T00:00:00") : null, to: to ? new Date(to + "T23:59:59.999") : null });
    const pick = (f: (typeof r.violations)[number]) => ({
      downloadId: f.downloadId,
      userId: f.userId,
      user: dataStr(f.userLabel.replace(/\s*\(.*\)\s*$/, ""), 50),
      materialId: f.materialId,
      material: dataStr(f.materialTitle, 80),
      via: f.via,
      at: f.at,
      reason: dataStr(f.reason, 120),
    });
    return {
      checked: r.checked,
      skippedAdmin: r.skippedAdmin,
      violationsCount: r.violations.length,
      warningsCount: r.warnings.length,
      byVia: r.byVia,
      range: { first: r.firstAt, last: r.lastAt },
      violations: r.violations.slice(0, 15).map(pick),
      warnings: r.warnings.slice(0, 5).map(pick),
    };
  },
};

export const ASSISTANT_TOOLS: AssistantTool[] = [
  siteOverview,
  dailySeries,
  topMaterials,
  topUsers,
  findMaterials,
  materialsSummary,
  findUser,
  purchasesSummary,
  recentErrors,
  agentActivity,
  auditLog,
  paymentsStatus,
  downloadAudit,
];

export const TOOL_NAMES: ReadonlySet<string> = new Set(ASSISTANT_TOOLS.map((t) => t.name));
export const toolByName = (name: string) => ASSISTANT_TOOLS.find((t) => t.name === name);
export const toolCatalogText = () => ASSISTANT_TOOLS.map((t) => `- ${t.name}: ${t.description}\n  פרמטרים: ${t.params}`).join("\n");
