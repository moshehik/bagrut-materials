/**
 * מייבא את התמליל המלא של הרצת קלוד (קובץ ה-execution של claude-code-action) ליומן הסוכן —
 * כל הודעה, כל קריאת כלי (שם + קלט) וכל תוצאת כלי, בסדר המקורי. רץ ב-workflow אחרי שלב
 * קלוד, גם אם הוא נכשל (if: always()). הקובץ המקורי נשמר גם כ-artifact (14 יום).
 * הרצה: npx tsx scripts/agent-log-ingest.ts <execution-file.json> [--outcome=success|failure|cancelled]
 * סודות מוסתרים ע"י redactSecrets לפני הכתיבה. לעולם לא נכשל את ה-workflow (exit 0 תמיד).
 */
import "dotenv/config";
import dotenv from "dotenv";
import fs from "node:fs";
dotenv.config({ path: ".env.local" });

import { logAgentEvent } from "../src/lib/agentEvents";

type Block = { type: string; text?: string; name?: string; input?: unknown; content?: unknown; is_error?: boolean };
type Entry = {
  type?: string;
  message?: { content?: Block[] | string };
  subtype?: string;
  result?: string;
  total_cost_usd?: number;
  num_turns?: number;
  duration_ms?: number;
  is_error?: boolean;
};

function textOf(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((x) => (typeof x === "string" ? x : (x as Block)?.text ?? JSON.stringify(x))).join("\n");
  return c === undefined ? "" : JSON.stringify(c);
}

function oneLine(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

async function main() {
  const file = process.argv[2];
  const outcome = process.argv.find((a) => a.startsWith("--outcome="))?.slice("--outcome=".length) ?? "unknown";
  if (!file || !fs.existsSync(file)) {
    await logAgentEvent({ source: "workflow", kind: "run.end", summary: `ההרצה הסתיימה (${outcome}) — לא נמצא קובץ תמליל לייבוא` });
    return;
  }
  const raw = fs.readFileSync(file, "utf8").trim();
  let entries: Entry[] = [];
  try {
    const parsed = JSON.parse(raw);
    entries = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    entries = raw
      .split("\n")
      .map((l) => {
        try {
          return JSON.parse(l) as Entry;
        } catch {
          return null;
        }
      })
      .filter((x): x is Entry => !!x);
  }

  let messages = 0;
  let tools = 0;
  for (const e of entries) {
    const content = e.message?.content;
    if (e.type === "assistant" || e.type === "user") {
      const blocks: Block[] = Array.isArray(content) ? content : content ? [{ type: "text", text: content as string }] : [];
      for (const b of blocks) {
        if (b.type === "text" && e.type === "assistant" && b.text?.trim()) {
          messages++;
          await logAgentEvent({ source: "claude", kind: "message", summary: oneLine(b.text, 300), details: b.text });
        } else if (b.type === "tool_use") {
          tools++;
          const input = typeof b.input === "string" ? b.input : JSON.stringify(b.input);
          await logAgentEvent({ source: "claude", kind: "tool", summary: `${b.name}: ${oneLine(input ?? "", 200)}`, details: { tool: b.name, input: b.input } });
        } else if (b.type === "tool_result") {
          const out = textOf(b.content);
          await logAgentEvent({ source: "claude", kind: "tool.result", summary: `${b.is_error ? "שגיאה: " : ""}${oneLine(out, 200)}`, details: out });
        }
      }
    } else if (e.type === "result") {
      await logAgentEvent({
        source: "claude",
        kind: "run.result",
        summary: `${e.is_error ? "הסתיים בשגיאה" : "הסתיים"} — ${e.num_turns ?? "?"} תורות, ${Math.round((e.duration_ms ?? 0) / 1000)} שניות${e.total_cost_usd != null ? `, ~$${e.total_cost_usd.toFixed(3)}` : ""}`,
        details: e.result,
      });
    }
  }
  await logAgentEvent({
    source: "workflow",
    kind: "run.end",
    summary: `ההרצה הסתיימה (${outcome}) — יובאו ${messages} הודעות ו-${tools} קריאות כלי`,
  });
  console.log(`OK: ${messages} messages, ${tools} tool calls`);
}

main().catch((e) => {
  console.error("ingest failed (ignored):", e instanceof Error ? e.message : e);
});
