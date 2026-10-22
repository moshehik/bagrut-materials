/**
 * בדיקות הצפנת הסודות (app_secrets) והסתרת סודות – בלי DB. הרצה: npx tsx --test scripts/nedarim-tests/
 * הערכים כאן מומצאים (npk_TEST…) – לא מפתח אמיתי.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decryptSecret,
  deriveSecretsKey,
  encryptSecret,
  last4Of,
  redactSecretValues,
  secretsEqual,
} from "../../src/lib/nedarim/secret-crypto";

const MASTER = "unit-test-master-secret-0123456789abcdef-not-real";
const FAKE_KEY = "npk_TESTabcdefghijklmnopqrstuv0123";

test("derive key: 32 bytes, deterministic, rejects short master", () => {
  const k1 = deriveSecretsKey(MASTER);
  const k2 = deriveSecretsKey(MASTER);
  assert.equal(k1.length, 32);
  assert.ok(k1.equals(k2));
  assert.ok(!k1.equals(deriveSecretsKey(MASTER + "x")));
  assert.throws(() => deriveSecretsKey("short"));
});

test("encrypt/decrypt roundtrip; fresh IV each time", () => {
  const key = deriveSecretsKey(MASTER);
  const a = encryptSecret(key, "nedarim_api_password", FAKE_KEY);
  const b = encryptSecret(key, "nedarim_api_password", FAKE_KEY);
  assert.notEqual(a, b, "random IV → different blobs");
  assert.equal(decryptSecret(key, "nedarim_api_password", a), FAKE_KEY);
  assert.equal(decryptSecret(key, "nedarim_api_password", b), FAKE_KEY);
  assert.ok(!a.includes(FAKE_KEY) && !Buffer.from(a, "base64").toString("latin1").includes("npk_TEST"));
});

test("tampered tag/data, wrong AAD (name) and wrong key all fail", () => {
  const key = deriveSecretsKey(MASTER);
  const blob = encryptSecret(key, "nedarim_api_password", FAKE_KEY);
  const buf = Buffer.from(blob, "base64");
  const flipTag = Buffer.from(buf);
  flipTag[1 + 12 + 3] ^= 0x01;
  assert.throws(() => decryptSecret(key, "nedarim_api_password", flipTag.toString("base64")));
  const flipData = Buffer.from(buf);
  flipData[flipData.length - 1] ^= 0x01;
  assert.throws(() => decryptSecret(key, "nedarim_api_password", flipData.toString("base64")));
  assert.throws(() => decryptSecret(key, "nedarim_callback_secret", blob), "AAD binds the blob to its name");
  assert.throws(() => decryptSecret(deriveSecretsKey(MASTER + "2"), "nedarim_api_password", blob));
  assert.throws(() => decryptSecret(key, "nedarim_api_password", "AAAA"));
  const badVersion = Buffer.from(buf);
  badVersion[0] = 9;
  assert.throws(() => decryptSecret(key, "nedarim_api_password", badVersion.toString("base64")));
});

test("constant-length secret comparison", () => {
  assert.equal(secretsEqual("abc", "abc"), true);
  assert.equal(secretsEqual("abc", "abd"), false);
  assert.equal(secretsEqual("abc", "abcd"), false);
  assert.equal(secretsEqual("", "abc"), false);
  assert.equal(secretsEqual(null, "abc"), false);
});

test("last4 and redaction", () => {
  assert.equal(last4Of(FAKE_KEY), FAKE_KEY.slice(-4));
  assert.equal(last4Of("short"), null);
  const text = `fetch failed https://x/api/pay/callback?key=SUPERSECRETVALUE123 body ApiPassword=${FAKE_KEY} and ${FAKE_KEY}`;
  const out = redactSecretValues(text, ["SUPERSECRETVALUE123"]);
  assert.ok(!out.includes(FAKE_KEY));
  assert.ok(!out.includes("SUPERSECRETVALUE123"));
  assert.ok(out.includes("npk_[REDACTED]"));
  assert.ok(out.includes("key=[REDACTED]"));
  assert.equal(redactSecretValues("nothing secret here"), "nothing secret here");
  assert.equal(redactSecretValues("x", ["short"]), "x", "short known values are not used as patterns");
});
