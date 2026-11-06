/**
 * בדיקות של src/lib/private-version-logic.ts (איזה קובץ מוגש למורה כשיש לה גרסה פרטית; שם הקובץ בדרייב; תוויות). הרצה:
 *   npx tsx --test scripts/private-versions.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseServedFile,
  generalStatusLabel,
  isDriveUrlStrict,
  latestGeneral,
  parseOriginalParam,
  privateVersionDriveName,
  type PrivateVersionInfo,
} from "../src/lib/private-version-logic";

const material = { fileUrl: "drive://SHARED_FILE_ID_123456", fileName: "דף לתלמידה - פרק א.docx" };
const pv: PrivateVersionInfo = { id: 7, fileUrl: "drive://PRIVATE_FILE_ID_654321", fileName: "דף לתלמידה - פרק א.docx", note: "קוצר", createdAt: new Date("2026-11-06"), fixId: 99 };

test("no private version -> shared file", () => {
  const r = chooseServedFile({ material, privateVersion: null, wantOriginal: false });
  assert.equal(r.fileUrl, material.fileUrl);
  assert.equal(r.privateVersion, null);
});

test("private version is served instead of the shared file", () => {
  const r = chooseServedFile({ material, privateVersion: pv, wantOriginal: false });
  assert.equal(r.fileUrl, pv.fileUrl);
  assert.equal(r.privateVersion?.id, 7);
  assert.equal(r.fileName, material.fileName);
});

test("?original=1 returns the shared file even when a private version exists", () => {
  const r = chooseServedFile({ material, privateVersion: pv, wantOriginal: true });
  assert.equal(r.fileUrl, material.fileUrl);
  assert.equal(r.privateVersion, null);
  assert.equal(parseOriginalParam("1"), true);
  assert.equal(parseOriginalParam("true"), true);
  assert.equal(parseOriginalParam(null), false);
  assert.equal(parseOriginalParam("0"), false);
});

test("a private version that is not a strict drive:// url is ignored (never a third-party URL)", () => {
  const bad = { ...pv, fileUrl: "https://drive.google.com/uc?id=abc" };
  const r = chooseServedFile({ material, privateVersion: bad, wantOriginal: false });
  assert.equal(r.fileUrl, material.fileUrl);
  assert.equal(isDriveUrlStrict("drive://abc"), false);
  assert.equal(isDriveUrlStrict("drive://1AbC_dEf-GhIjKlMn"), true);
});

test("non-docx materials never get a private version", () => {
  const r = chooseServedFile({ material: { ...material, fileName: "מצגת.pptx" }, privateVersion: pv, wantOriginal: false });
  assert.equal(r.fileUrl, material.fileUrl);
});

test("drive name strips an old edit-date suffix, keeps the extension, no path characters", () => {
  const n = privateVersionDriveName("דף לתלמידה - פרק א (נערך 05.10.2026).docx", 12, 34);
  assert.equal(n, "דף לתלמידה - פרק א (גרסה פרטית למשתמשת #12, הערה #34).docx");
  assert.ok(!/[\\/:*?"<>|]/.test(privateVersionDriveName('a/b:c?"d".docx', 1, 2)));
});

test("status labels and latest complaint", () => {
  const older = { id: 1, status: "answered", replyText: "x", createdAt: new Date("2026-01-01") };
  const newer = { id: 2, status: "pending", replyText: null, createdAt: new Date("2026-02-01") };
  assert.equal(latestGeneral([older, newer])?.id, 2);
  assert.equal(generalStatusLabel(newer)?.tone, "wait");
  assert.equal(generalStatusLabel(older)?.tone, "info");
  assert.equal(generalStatusLabel({ ...older, status: "merged" })?.tone, "done");
  assert.equal(generalStatusLabel({ ...older, status: "rejected" }), null);
  assert.equal(generalStatusLabel(undefined), null);
});
