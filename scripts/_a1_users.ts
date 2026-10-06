import "dotenv/config"; import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
import { db } from "../src/db"; import { users } from "../src/db/schema";
import { eq, sql } from "drizzle-orm";
(async () => {
  const [u] = await db.select({ id: users.id, role: users.role, sv: users.sessionVersion, suspended: users.suspended, phone: sql<boolean>`phone is not null and phone <> ''` }).from(users).where(eq(users.id, 1));
  console.log("admin1", JSON.stringify(u));
  const counts = await db.execute(sql`select role, count(*)::int n from users group by role`);
  console.log("roles", JSON.stringify(counts.rows));
  const tests = await db.execute(sql`select id, role, session_version, suspended from users where email ilike '%test%' or email ilike '%example%' or name ilike '%בדיקה%' order by id limit 10`);
  console.log("testusers", JSON.stringify(tests.rows));
  process.exit(0);
})();
