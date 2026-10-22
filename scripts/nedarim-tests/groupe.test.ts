/**
 * בדיקות ניהול הקטגוריות (Groupe) בנדרים פלוס – לוגיקה טהורה + לקוח API עם fetch מדומה (בלי רשת, בלי DB).
 * הרצה: npx tsx --test scripts/nedarim-tests/groupe.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MANAGE3_URL,
  buildSaveParams,
  categoryInputSchema,
  createGroupeClient,
  friendlyGroupeError,
  minimumAmountAgorot,
  parseGroupeList,
  parseGroupeResult,
  planSyncRows,
  type FetchLike,
  type NedarimCategory,
} from "../../src/lib/nedarim/groupe-logic";

const FAKE_KEY = "npk_TESTabcdefghijklmnopqrstuv0123";

/** fetch מדומה: רושם את הקריאות ומחזיר תשובות לפי Action */
function fakeFetch(responder: (action: string, params: URLSearchParams) => { status?: number; body: string } | Promise<{ status?: number; body: string }>) {
  const calls: { url: string; params: URLSearchParams; init: Parameters<FetchLike>[1] }[] = [];
  const f: FetchLike = async (url, init) => {
    const params = new URLSearchParams(init.body);
    calls.push({ url, params, init });
    const r = await responder(params.get("Action") ?? "", params);
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, text: async () => r.body };
  };
  return { f, calls };
}

const sample = [
  { id: 249079, Name: "מנוי שנתי", Amount: "588", PhoneGroupe: "", TamalType: "", GoToMosad: "", GoToMosadGroupe: "", GoToTofes: "", Goal: "", Cumule: "10" },
  { id: 249080, Name: "ממלאת מקום 3 חודשים", Amount: "", PhoneGroupe: "", TamalType: "", GoToMosad: "", GoToMosadGroupe: "", GoToTofes: "", Goal: "1000", Cumule: "" },
  { id: 249081, Name: "*ממלאת מקום יומית", Amount: "160.5", PhoneGroupe: "1", TamalType: "x", GoToMosad: "", GoToMosadGroupe: "", GoToTofes: "", Goal: "", Cumule: "" },
];

test("parseGroupeList: empty, full, wrapped, garbage", () => {
  assert.deepEqual(parseGroupeList([]), []);
  const list = parseGroupeList(sample)!;
  assert.equal(list.length, 3);
  assert.equal(list[0].id, 249079);
  assert.equal(list[0].amount, 58800);
  assert.equal(list[0].cumule, 1000);
  assert.equal(list[1].amount, null, "empty Amount → null");
  assert.equal(list[1].goal, 100000);
  assert.equal(list[2].hidden, true, "* prefix = hidden");
  assert.equal(list[2].amount, 16050);
  assert.equal(parseGroupeList({ Data: sample })!.length, 3);
  assert.equal(parseGroupeList({ Status: "Error", Message: "bad password" }), null);
  assert.equal(parseGroupeList("garbage"), null);
  assert.equal(parseGroupeList([{ Name: "no id" }])!.length, 0);
});

test("parseGroupeResult + friendly errors", () => {
  assert.deepEqual(parseGroupeResult({ Status: "OK", Id: 5 }), { ok: true, id: 5, message: "" });
  assert.deepEqual(parseGroupeResult({ Status: "OK" }), { ok: true, id: null, message: "" });
  const dup = parseGroupeResult({ Status: "Error", Message: "Name already exists" });
  assert.equal(dup.ok, false);
  assert.equal(friendlyGroupeError(dup.message), "שם כפול – כבר יש קטגוריה בשם הזה");
  const res = parseGroupeResult({ Result: "Error", Message: "Wrong ApiPassword" });
  assert.equal(res.ok, false);
  assert.ok(friendlyGroupeError(res.message).includes("הרשאה"));
  assert.equal(parseGroupeResult(null, "OK").ok, true);
  assert.equal(parseGroupeResult(null, "").ok, false);
});

test("input validation: name (1-100, no control chars), money (>=0, 2 decimals, empty = null)", () => {
  const ok = categoryInputSchema.safeParse({ id: undefined, name: " מנוי שנתי ", amount: "588", goal: "", cumule: null });
  assert.ok(ok.success);
  assert.equal(ok.data.name, "מנוי שנתי");
  assert.equal(ok.data.amount, 58800);
  assert.equal(ok.data.goal, null);
  assert.equal(ok.data.id, null);
  assert.equal(categoryInputSchema.safeParse({ name: "", amount: "1" }).success, false);
  assert.equal(categoryInputSchema.safeParse({ name: "x".repeat(101), amount: "1" }).success, false);
  assert.equal(categoryInputSchema.safeParse({ name: "a\u0000b", amount: "1" }).success, false);
  assert.equal(categoryInputSchema.safeParse({ name: "ok", amount: "-5" }).success, false);
  assert.equal(categoryInputSchema.safeParse({ name: "ok", amount: "1.234" }).success, false);
  assert.equal(categoryInputSchema.safeParse({ name: "ok", amount: "12,5" }).success, false, "comma is ambiguous → rejected");
  assert.equal(categoryInputSchema.safeParse({ name: "ok", amount: "1,200" }).success, false);
  assert.equal(categoryInputSchema.safeParse({ name: "ok", amount: "1&Action=Delete" }).success, false, "no parameter injection");
  assert.equal(categoryInputSchema.safeParse({ name: "ok", amount: "₪ 1200.50" }).data?.amount, 120050);
  assert.equal(categoryInputSchema.safeParse({ name: "ok", amount: 7 }).data?.amount, 700);
  assert.equal(categoryInputSchema.safeParse({ id: -1, name: "ok" }).success, false);
  assert.equal(categoryInputSchema.safeParse({ id: 249079, name: "ok" }).data?.id, 249079);
});

test("buildSaveParams always sends every field; create vs update", () => {
  const existing: NedarimCategory = parseGroupeList(sample)![2];
  const upd = buildSaveParams(existing, { name: "ממלאת מקום יומית", amount: 16000 });
  assert.deepEqual(Object.keys(upd).sort(), ["Amount", "Cumule", "GoToMosad", "GoToMosadGroupe", "GoToTofes", "Goal", "Id", "Name", "PhoneGroupe", "TamalType"].sort());
  assert.equal(upd.Id, "249081");
  assert.equal(upd.Amount, "160");
  assert.equal(upd.PhoneGroupe, "1", "untouched fields are carried over");
  assert.equal(upd.TamalType, "x");
  assert.equal(upd.Goal, "");
  const create = buildSaveParams(null, { name: "חדש", amount: null, goal: 50000 });
  assert.equal(create.Id, "");
  assert.equal(create.Amount, "");
  assert.equal(create.Goal, "500");
  assert.equal(create.Cumule, "");
});

test("minimum amount with the maximum coupon discount – same rounding as /api/pay/intent", () => {
  assert.equal(minimumAmountAgorot(58800, 0), 58800);
  assert.equal(minimumAmountAgorot(58800, 10), 52920);
  assert.equal(minimumAmountAgorot(58800, 100), 0);
  assert.equal(minimumAmountAgorot(58800, 150), 0);
  assert.equal(minimumAmountAgorot(58800, -5), 58800);
  assert.equal(minimumAmountAgorot(39000, 33), 26130);
  assert.equal(minimumAmountAgorot(16000, 12.9), 14080, "fractional percent floors");
});

test("planSyncRows: finds by name (ignoring the * prefix), computes target and inSync", () => {
  const cats = parseGroupeList(sample)!;
  const rows = planSyncRows(cats, [
    { plan: "yearly", name: "מנוי שנתי", priceAgorot: 58800 },
    { plan: "substitute_3m", name: "ממלאת מקום 3 חודשים", priceAgorot: 39000 },
    { plan: "substitute_daily", name: "ממלאת מקום יומית", priceAgorot: 16000 },
    { plan: "x", name: "לא קיים", priceAgorot: 100 },
  ], 0);
  assert.equal(rows[0].inSync, true);
  assert.equal(rows[1].inSync, false, "no Amount yet");
  assert.equal(rows[2].category?.id, 249081, "hidden category matched by name without *");
  assert.equal(rows[2].inSync, false, "160.5 != 160");
  assert.equal(rows[3].category, null);
  const withCoupon = planSyncRows(cats, [{ plan: "yearly", name: "מנוי שנתי", priceAgorot: 58800 }], 20);
  assert.equal(withCoupon[0].targetAgorot, 47040);
  assert.equal(withCoupon[0].inSync, false);
});

test("client: list / create / update (all fields) / delete / errors / redaction, key only in the POST body", async () => {
  const { f, calls } = fakeFetch((action, p) => {
    if (action === "GetNewGroupe") return { body: JSON.stringify(sample) };
    if (action === "SaveEditGroupe") return p.get("Id") ? { body: JSON.stringify({ Status: "OK" }) } : { body: JSON.stringify({ Status: "OK", Id: 249099 }) };
    if (action === "DeleteEditGroupe") return { body: JSON.stringify({ Status: "OK" }) };
    return { body: JSON.stringify({ Status: "Error", Message: "unknown" }) };
  });
  const c = createGroupeClient({ fetchImpl: f, mosadId: "7019454", apiPassword: FAKE_KEY, redact: (s) => s.replace(FAKE_KEY, "[REDACTED]") });
  const list = await c.list();
  assert.equal(list.length, 3);
  assert.equal(calls[0].url, MANAGE3_URL);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.redirect, "error");
  assert.ok(!calls[0].url.includes(FAKE_KEY), "key never in the URL");
  assert.equal(calls[0].params.get("ApiPassword"), FAKE_KEY);
  assert.equal(calls[0].params.get("MosadId"), "7019454");

  const createdId = await c.save(null, { name: "חדש", amount: 1000 });
  assert.equal(createdId, 249099);
  const createParams = calls[1].params;
  assert.equal(createParams.get("Action"), "SaveEditGroupe");
  assert.equal(createParams.get("Id"), "");
  assert.equal(createParams.get("Name"), "חדש");
  assert.equal(createParams.get("Amount"), "10");
  for (const k of ["Goal", "Cumule", "PhoneGroupe", "TamalType", "GoToMosad", "GoToMosadGroupe", "GoToTofes"]) assert.ok(createParams.has(k), `${k} sent on create`);

  const updatedId = await c.save(list[2], { amount: 16000, name: list[2].name });
  assert.equal(updatedId, 249081);
  const updParams = calls[2].params;
  assert.equal(updParams.get("Id"), "249081");
  assert.equal(updParams.get("PhoneGroupe"), "1", "existing fields re-sent on update");
  assert.equal(updParams.get("TamalType"), "x");

  await c.remove(249099);
  assert.equal(calls[3].params.get("Action"), "DeleteEditGroupe");
  assert.equal(calls[3].params.get("Id"), "249099");
  await assert.rejects(() => c.remove(0), /לא תקין/);

  // שגיאות Status/Result
  const bad = createGroupeClient({ fetchImpl: fakeFetch(() => ({ body: JSON.stringify({ Status: "Error", Message: "Name already exists" }) })).f, mosadId: "1", apiPassword: FAKE_KEY });
  await assert.rejects(() => bad.save(null, { name: "x" }), /שם כפול/);
  const res = createGroupeClient({ fetchImpl: fakeFetch(() => ({ body: JSON.stringify({ Result: "Error", Message: "Wrong ApiPassword" }) })).f, mosadId: "1", apiPassword: FAKE_KEY });
  await assert.rejects(() => res.list(), /הרשאה/);
  const http = createGroupeClient({ fetchImpl: fakeFetch(() => ({ status: 500, body: "boom" })).f, mosadId: "1", apiPassword: FAKE_KEY });
  await assert.rejects(() => http.list(), /HTTP 500/);
  // שגיאת רשת שמכילה את המפתח – עוברת redaction
  const leaky = createGroupeClient({
    fetchImpl: async () => {
      throw new Error(`fetch failed for body ApiPassword=${FAKE_KEY}`);
    },
    mosadId: "1",
    apiPassword: FAKE_KEY,
    redact: (s) => s.replace(FAKE_KEY, "[REDACTED]"),
  });
  await assert.rejects(() => leaky.list(), (e: Error) => !e.message.includes(FAKE_KEY) && e.message.includes("[REDACTED]"));
});
