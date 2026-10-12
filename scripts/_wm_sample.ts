import "dotenv/config"; import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
import Module from "node:module";
// "server-only" זורק מחוץ ל-Next – מנטרלים אותו בסקריפט בלבד
const orig = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (req: string, ...rest: any[]) {
  if (req === "server-only") return require.resolve("node:module");
  return orig.call(this, req, ...rest);
};
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
(async () => {
  const { convertOfficeToPdf } = await import("../src/lib/driveBridgeCore");
  const { stampPdf } = await import("../src/lib/watermark");
  const files = process.argv.slice(2);
  for (const f of files) {
    const raw = new Uint8Array(await readFile(f));
    const pdf = await convertOfficeToPdf({ bytes: raw, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", name: path.basename(f) });
    const out = await stampPdf(pdf, { personalCode: "TEST-0001", userName: "מורה לדוגמה", email: "sample@example.com", phone: "050-0000000" });
    const dest = path.join("_wm_samples", path.basename(f).replace(/\.docx$/, "") + "-TEST-0001.pdf");
    await writeFile(dest, out);
    console.log("OK", dest, out.length);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
