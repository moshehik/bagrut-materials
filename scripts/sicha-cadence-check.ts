/**
 * אכיפת קצב ההעלאה למאגר שיחות מורות (שיחה / חברה / כישורי חיים).
 * הרצה: npx tsx scripts/sicha-cadence-check.ts   (או: cron יומי, ר' .github/workflows/sicha-cadence-check.yml)
 *
 * לכל מורה ב-sicha_teacher_status שאינה חסומה:
 *   - אם נותרו ≤7 ימים למועד היעד (next_due_at) וטרם נשלחה תזכורת למחזור הנוכחי → שולח מייל ידידותי.
 *   - אם מועד היעד עבר → חוסם גישה למאגר השיחות בלבד (blocked=true; שאר האתר לא מושפע).
 *
 * שולח מייל ישירות (לא דרך src/lib/mail.ts, שמסומן "server-only" ולא ניתן לייבוא
 * מסקריפט tsx רגיל — ר' node_modules/server-only/index.js) באותה שיטה (Apps Script
 * Web App) ורושם ל-email_logs, כמו seed.ts שיוצר משלו client ל-DB.
 */
import "dotenv/config";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { SITE_NAME } from "../src/lib/constants";

dotenv.config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (check .env.local)");
  process.exit(1);
}
const db = drizzle(neon(url), { schema });
const { sichaTeacherStatus, users, emailLogs } = schema;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  );
}

async function sendReminderMail(to: string, userId: number, name: string) {
  const mailUrl = process.env.MAIL_SCRIPT_URL;
  const subject = "תזכורת קטנה וחמודה ממאגר השיחות 💛";
  const link = `${siteUrl()}/subjects`;
  const text = `היי ${name} 💛\n\nעוד כשבוע יגיע התור להעלות שיחה חדשה למאגר השיחות, כדי שתמשיכי ליהנות מהגישה אליו. יש לך רעיון טוב לשתף? זה הזמן!\n\n${link}`;
  const html = `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#faf6ef;font-family:Arial,Assistant,sans-serif;color:#1f2d33">
<div style="max-width:600px;margin:0 auto;padding:24px">
  <div style="background:linear-gradient(135deg,#1aa6b7,#0e7f8f);color:#fff;border-radius:18px 18px 0 0;padding:22px 26px">
    <div style="font-size:22px;font-weight:800">${SITE_NAME}</div>
  </div>
  <div style="background:#fff;border:1px solid #e6e9f2;border-top:0;padding:26px;border-radius:0 0 18px 18px;line-height:1.7;font-size:15px">
    <h2 style="margin:0 0 12px;color:#0e7f8f;font-size:20px">תזכורת קטנה וחמודה 💛</h2>
    <p>היי ${name},</p>
    <p>עוד כשבוע יגיע התור להעלות שיחה חדשה למאגר השיחות, כדי שתמשיכי ליהנות מהגישה אליו. יש לך רעיון טוב לשתף? זה הזמן! 😊</p>
    <p style="margin:22px 0 6px"><a href="${link}" style="display:inline-block;background:#f5c542;color:#1f2d33;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:999px">למאגר השיחות</a></p>
  </div>
</div></body></html>`;

  let status: "success" | "error" = "success";
  let errorMessage: string | null = null;
  if (!mailUrl) {
    status = "error";
    errorMessage = "MAIL_SCRIPT_URL לא מוגדר";
  } else {
    try {
      const res = await fetch(mailUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          cc: "",
          subject,
          body: text,
          htmlBody: html,
          fromName: process.env.MAIL_FROM_NAME ?? SITE_NAME,
          fileName: "message.txt",
          fileContent: Buffer.from(`נשלח ממערכת ${SITE_NAME}`).toString("base64"),
          mimeType: "text/plain",
        }),
        redirect: "follow",
      });
      const txt = await res.text();
      let result: { status?: string; message?: string };
      try {
        result = JSON.parse(txt);
      } catch {
        result = { status: "error", message: txt.slice(0, 500) };
      }
      if (result.status !== "success") {
        status = "error";
        errorMessage = result.message || `HTTP ${res.status}`;
      }
    } catch (e) {
      status = "error";
      errorMessage = e instanceof Error ? e.message : String(e);
    }
  }

  await db.insert(emailLogs).values({
    to,
    subject,
    body: text,
    kind: "sicha_reminder",
    status,
    errorMessage,
    userId,
  });
  if (status === "error") console.error(`[sicha-cadence] mail to ${to} failed: ${errorMessage}`);
}

async function main() {
  const now = new Date();
  const soonThreshold = new Date(now.getTime() + WEEK_MS);

  const rows = await db
    .select({
      teacherId: sichaTeacherStatus.teacherId,
      nextDueAt: sichaTeacherStatus.nextDueAt,
      reminderSentAt: sichaTeacherStatus.reminderSentAt,
      name: users.name,
      email: users.email,
    })
    .from(sichaTeacherStatus)
    .innerJoin(users, eq(users.id, sichaTeacherStatus.teacherId))
    .where(eq(sichaTeacherStatus.blocked, false));

  let reminded = 0;
  let blocked = 0;

  for (const r of rows) {
    if (r.nextDueAt <= now) {
      await db
        .update(sichaTeacherStatus)
        .set({ blocked: true })
        .where(eq(sichaTeacherStatus.teacherId, r.teacherId));
      blocked++;
      continue;
    }
    if (r.nextDueAt <= soonThreshold && r.reminderSentAt === null) {
      await sendReminderMail(r.email, r.teacherId, r.name);
      await db
        .update(sichaTeacherStatus)
        .set({ reminderSentAt: now })
        .where(eq(sichaTeacherStatus.teacherId, r.teacherId));
      reminded++;
    }
  }

  console.log(`[sicha-cadence] checked ${rows.length} teachers · reminded ${reminded} · blocked ${blocked}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
