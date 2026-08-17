import { sql } from "drizzle-orm";
import { db } from "@/db";
import { SETTING_DEFS, getSettings, getNumber } from "@/lib/settings";
import { SettingsForm, type SettingDefClient } from "@/components/admin/settings-form";

export const dynamic = "force-dynamic";

async function countOldLogs(): Promise<{ days: number; total: number }> {
  const days = await getNumber("logs_retention_days");
  const cutoff = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
  try {
    const rows = await db.execute<{ n: number }>(sql`
      SELECT (
        (SELECT count(*) FROM page_views WHERE created_at < ${cutoff}) +
        (SELECT count(*) FROM email_logs WHERE sent_at < ${cutoff}) +
        (SELECT count(*) FROM audit_logs WHERE created_at < ${cutoff})
      )::int AS n
    `);
    return { days, total: Number(rows.rows[0]?.n ?? 0) };
  } catch {
    return { days, total: 0 };
  }
}

export default async function AdminSettingsPage() {
  const [values, purgeInfo] = await Promise.all([getSettings(), countOldLogs()]);
  const defs: SettingDefClient[] = Object.entries(SETTING_DEFS).map(([key, d]) => ({
    key,
    label: d.label,
    type: d.type,
    default: d.default,
    group: d.group,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">הגדרות האתר</h2>
        <span className="chip bg-oak-soft text-oak-deep">{defs.length} הגדרות</span>
      </div>
      <SettingsForm defs={defs} values={values} purgeInfo={purgeInfo} />
    </div>
  );
}
