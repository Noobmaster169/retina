import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { closePool } from "../../src/db";
import { fileKeyFrom } from "../../src/routes/files.routes";
import { MemoryStore } from "../../src/storage/__fakes__/memory.store";
import { TEST_ENV } from "../../vitest.config";
import { testApp } from "../app";

const TEAM = { authorization: `Bearer ${TEST_ENV.TEAM_API_KEY}` };
const app = (store: MemoryStore | null) => testApp({ store });

afterAll(closePool);

describe("GET /files/*key", () => {
  it("streams the object and types it from the key", async () => {
    const store = new MemoryStore();
    await store.put("runs/a/emails/email_1/pages/bl.pdf/1.png", Buffer.from("not really a png"), "image/png");

    const response = await request(app(store)).get("/files/runs/a/emails/email_1/pages/bl.pdf/1.png").set(TEAM);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.body.toString()).toBe("not really a png");
  });

  it("needs a key, and answers 404 for an object that is not there", async () => {
    expect((await request(app(new MemoryStore())).get("/files/uploads/1/absent.pdf").set(TEAM)).status).toBe(404);
    expect((await request(app(new MemoryStore())).get("/files/").set(TEAM)).status).toBe(404);
  });

  it("refuses everyone without a key of their own", async () => {
    expect((await request(app(new MemoryStore())).get("/files/uploads/1/a.pdf")).status).toBe(401);
  });

  it("says so when there is no object storage rather than pretending the file is missing", async () => {
    const response = await request(app(null)).get("/files/uploads/1/a.pdf").set(TEAM);
    expect(response.status).toBe(503);
  });
});

/**
 * An HTTP client normalises a traversal away before it is sent, so the guard
 * is read here rather than through a request: what it protects against is a
 * caller that does not.
 */
describe("fileKeyFrom", () => {
  it.each([
    [["runs", "a", "emails", "email_1", "attachments", "si.txt"], "runs/a/emails/email_1/attachments/si.txt"],
    [["uploads", "12", "bl.pdf"], "uploads/12/bl.pdf"],
    [["uploads", "..", "..", "etc", "passwd"], null],
    [["uploads", ".", "bl.pdf"], null],
    [["uploads", "", "bl.pdf"], null],
    [[], null],
    [undefined, null],
  ])("%s", (wildcard, expected) => {
    expect(fileKeyFrom(wildcard)).toBe(expected);
  });

  it("refuses a key longer than any this product writes", () => {
    expect(fileKeyFrom(["a".repeat(513)])).toBeNull();
  });
});
