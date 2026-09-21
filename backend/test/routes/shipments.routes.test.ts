import request from "supertest";
import { describe, expect, it } from "vitest";

import { testApp } from "../app";

const KEY = "test-frontend-key";
const get = (path: string) => request(testApp()).get(path).set("Authorization", `Bearer ${KEY}`);

describe("GET /shipments", () => {
  it("answers a list with a total", async () => {
    const response = await get("/shipments?pageSize=5");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.shipments)).toBe(true);
    expect(typeof response.body.total).toBe("number");
  });

  it("refuses a query outside the contract", async () => {
    expect((await get("/shipments?partyId=abc")).status).toBe(400);
    expect((await get("/shipments?pageSize=0")).status).toBe(400);
  });
});

describe("GET /shipments/:emailId", () => {
  it("is a 404 for an email nothing read", async () => {
    expect((await get("/shipments/email_nobody")).status).toBe(404);
  });
});
