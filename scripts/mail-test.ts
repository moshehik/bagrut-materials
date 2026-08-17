/* בדיקת שליחת מייל: npx tsx scripts/mail-test.ts <to> */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const to = process.argv[2];
  const url = process.env.MAIL_SCRIPT_URL;
  if (!to || !url) throw new Error("usage: mail-test <to>; MAIL_SCRIPT_URL required");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to,
      cc: "",
      subject: "בדיקת מערכת המייל – חומרים לבגרות",
      body: "אם קיבלת את זה, שרת המייל של האתר עובד ✅",
      htmlBody: "<div dir='rtl'><b>אם קיבלת את זה, שרת המייל של האתר עובד ✅</b></div>",
      fromName: "חומרים לבגרות",
      fileName: "message.txt",
      fileContent: Buffer.from("test").toString("base64"),
    }),
    redirect: "follow",
  });
  console.log(res.status, (await res.text()).slice(0, 300));
}
main();
