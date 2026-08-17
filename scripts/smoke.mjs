// בדיקת עשן מאומתת: node scripts/smoke.mjs <baseUrl>
import { config } from "dotenv";
config({ path: ".env.local" });
import { SignJWT } from "jose";

const base = process.argv[2] ?? "http://localhost:3000";
const secret = new TextEncoder().encode(process.env.SESSION_SECRET);
const token = await new SignJWT({ uid: 1 })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(secret);
const cookie = `bagrut_session=${token}`;

const paths = [
  "/admin", "/admin/activity", "/admin/downloads", "/admin/online", "/admin/stats", "/admin/logs",
  "/admin/finance", "/admin/subscriptions", "/admin/settings", "/admin/mail", "/admin/users",
  "/admin/categories", "/admin/materials", "/cart", "/account", "/subjects/ktuvim/tehilim/perek-1",
  "/api/cart/count",
];
for (const p of paths) {
  const r = await fetch(base + p, { headers: { cookie }, redirect: "manual" });
  const txt = await r.text();
  const err = /Application error|Internal Server Error|משהו השתבש/.test(txt);
  console.log(String(r.status).padEnd(4), err ? "PAGE-ERROR" : "ok  ", p, r.headers.get("location") ?? "");
}
// tracking
const t = await fetch(base + "/api/track", {
  method: "POST",
  headers: { cookie, "content-type": "application/json" },
  body: JSON.stringify({ path: "/subjects/torah", referer: "" }),
});
console.log("track", t.status, await t.text());
