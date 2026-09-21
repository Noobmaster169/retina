import request from "supertest";
import { describe, expect, it } from "vitest";

import { testApp } from "../app";

const KEY = "test-frontend-key";
const app = () => request(testApp());

describe("editing a thing", () => {
  it("refuses an attribute the kind does not have, and a coordinate off the globe", async () => {
    const wrongKey = await app().patch("/ontology/port/1/attributes").set("Authorization", `Bearer ${KEY}`).send({ actor: "t", attributes: { hsChapter: "48" } });
    expect(wrongKey.status).toBe(400);
    const offGlobe = await app().patch("/ontology/port/1/attributes").set("Authorization", `Bearer ${KEY}`).send({ actor: "t", attributes: { lat: "95" } });
    expect(offGlobe.status).toBe(400);
  });

  it("is a 404 for a thing nobody holds", async () => {
    const rename = await app().post("/ontology/party/999999999/rename").set("Authorization", `Bearer ${KEY}`).send({ actor: "t", name: "X" });
    expect(rename.status).toBe(404);
    const merge = await app().post("/ontology/party/999999999/merge").set("Authorization", `Bearer ${KEY}`).send({ actor: "t", into: "999999998" });
    expect(merge.status).toBe(404);
  });

  it("refuses merging a thing into itself", async () => {
    const merge = await app().post("/ontology/party/1/merge").set("Authorization", `Bearer ${KEY}`).send({ actor: "t", into: "1" });
    expect([404, 409]).toContain(merge.status);
  });
});
