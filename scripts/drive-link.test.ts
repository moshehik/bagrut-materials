import test from "node:test";
import assert from "node:assert/strict";
import { parseDriveLink, driveLinkUrl } from "../src/lib/drive-link";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz_-123";

test("file share links", () => {
  assert.deepEqual(parseDriveLink(`https://drive.google.com/file/d/${ID}/view?usp=sharing`), { id: ID, kind: "file" });
  assert.deepEqual(parseDriveLink(`https://drive.google.com/file/u/0/d/${ID}/view`), { id: ID, kind: "file" });
  assert.deepEqual(parseDriveLink(`https://drive.google.com/open?id=${ID}`), { id: ID, kind: "file" });
  assert.deepEqual(parseDriveLink(`https://drive.google.com/uc?id=${ID}&export=download`), { id: ID, kind: "file" });
});

test("folder share links", () => {
  assert.deepEqual(parseDriveLink(`https://drive.google.com/drive/folders/${ID}?usp=sharing`), { id: ID, kind: "folder" });
  assert.deepEqual(parseDriveLink(`https://drive.google.com/drive/u/1/folders/${ID}`), { id: ID, kind: "folder" });
  assert.deepEqual(parseDriveLink(`https://drive.google.com/drive/folderview?id=${ID}`), { id: ID, kind: "folder" });
});

test("rejects other hosts and junk", () => {
  assert.equal(parseDriveLink(`https://evil.example/file/d/${ID}/view`), null);
  assert.equal(parseDriveLink(`https://drive.google.com.evil.example/file/d/${ID}/view`), null);
  assert.equal(parseDriveLink(`javascript:alert(1)`), null);
  assert.equal(parseDriveLink("not a url"), null);
  assert.equal(parseDriveLink("https://drive.google.com/file/d/short/view"), null);
  assert.equal(parseDriveLink("https://drive.google.com/"), null);
});

test("rebuilds clean urls", () => {
  assert.equal(driveLinkUrl(ID, "file"), `https://drive.google.com/file/d/${ID}/view`);
  assert.equal(driveLinkUrl(ID, "folder"), `https://drive.google.com/drive/folders/${ID}`);
});

test("keeps resourcekey of newer share links", () => {
  assert.deepEqual(parseDriveLink(`https://drive.google.com/file/d/${ID}/view?usp=sharing&resourcekey=0-AbC_dEf12`), {
    id: ID,
    kind: "file",
    resourceKey: "0-AbC_dEf12",
  });
  assert.equal(parseDriveLink(`https://drive.google.com/file/d/${ID}/view?resourcekey=%3Cscript%3E`)?.resourceKey, undefined);
});
