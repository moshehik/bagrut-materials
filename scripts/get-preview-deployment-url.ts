/**
 * מוצא קישור Preview Deployment של Vercel לענף, דרך GitHub Deployments API.
 * הרצה: npx tsx scripts/get-preview-deployment-url.ts --branch=<שם-הענף>
 * דורש GITHUB_TOKEN (ב-GitHub Actions זה הטוקן האוטומטי של ה-workflow; מקומית — PAT עם
 * הרשאת repo, אם יש צורך להריץ ידנית) ואת GITHUB_REPOSITORY (בפורמט owner/repo — מוגדר
 * אוטומטית ב-GitHub Actions; מקומית ר' git remote).
 * אם ה-build עדיין לא מוכן — מדפיס "TIMEOUT" ויוצא בקוד 1 (אל תמציאו קישור, ר' fix-reports.md).
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const branchArg = process.argv.find((a) => a.startsWith("--branch="))?.split("=")[1];
  if (!branchArg) {
    console.error("שימוש: get-preview-deployment-url.ts --branch=<שם-הענף>");
    process.exit(1);
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY || "moshehik/bagrut-materials";
  if (!token) {
    console.error("FAILED: GITHUB_TOKEN לא מוגדר");
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
  };

  const deploymentsRes = await fetch(
    `https://api.github.com/repos/${repo}/deployments?ref=${encodeURIComponent(branchArg)}&per_page=5`,
    { headers }
  );
  if (!deploymentsRes.ok) {
    console.error(`FAILED: GitHub Deployments API ${deploymentsRes.status}`);
    process.exit(1);
  }
  const deployments = (await deploymentsRes.json()) as { id: number; environment: string }[];

  const urls: { environment: string; url: string }[] = [];
  for (const d of deployments) {
    const statusesRes = await fetch(
      `https://api.github.com/repos/${repo}/deployments/${d.id}/statuses?per_page=1`,
      { headers }
    );
    if (!statusesRes.ok) continue;
    const statuses = (await statusesRes.json()) as { state: string; environment_url?: string }[];
    const latest = statuses[0];
    if (latest?.state === "success" && latest.environment_url) {
      urls.push({ environment: d.environment, url: latest.environment_url });
    }
  }

  if (!urls.length) {
    console.log("TIMEOUT");
    process.exit(1);
  }

  console.log(JSON.stringify(urls, null, 2));
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
