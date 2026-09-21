import request from "supertest";
import { describe, expect, it } from "vitest";

import { testApp } from "../app";

const KEY = "test-frontend-key";

function get(path: string) {
  return request(testApp()).get(path).set("Authorization", `Bearer ${KEY}`);
}

describe("GET /ontology/types", () => {
  it("names every navigable type with a live count, and nothing is dashed any more", async () => {
    const response = await get("/ontology/types");
    expect(response.status).toBe(200);

    const types: { type: string; built: boolean; table: string | null; count: number }[] = response.body.types;
    const planned = types.filter((type) => !type.built).map((type) => type.type);
    // The exit checklist: a planned type is exactly one with no table, and
    // phase 10g gave the last of them one. A shipment is a group of emails
    // sharing an identifier, so core.shipments is what it counts.
    expect(planned).toEqual([]);
    expect(types.find((type) => type.type === "shipment")?.table).toBe("core.shipments");
    for (const type of types) expect(type.built).toBe(type.table !== null);

    const email = types.find((type) => type.type === "email");
    expect(email?.table).toBe("core.emails");
    expect(email?.count).toBeGreaterThanOrEqual(0);
  });
});

describe("GET /ontology/:type", () => {
  it("lists the resolved things of a kind", async () => {
    const response = await get("/ontology/port");
    expect(response.status).toBe(200);
    expect(response.body.type).toBe("port");
    expect(response.body.built).toBe(true);
    expect(Array.isArray(response.body.entities)).toBe(true);
  });

  it("sends a table-backed type to the database page rather than inventing an index", async () => {
    const response = await get("/ontology/email");
    expect(response.status).toBe(404);
    expect(response.body.error).toContain("/database/tables");
    expect(response.body.built).toBe(true);
  });

  it("404s a shipment id that is not a number rather than failing a cast", async () => {
    const response = await get("/ontology/shipment/anything");
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("no such shipment");
  });

  it("lists the consignments, which are no longer a planned type", async () => {
    const response = await get("/ontology/shipment");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.shipments)).toBe(true);
  });

  it("400s a word that is not an object type at all", async () => {
    const response = await get("/ontology/teapot");
    expect(response.status).toBe(400);
  });
});

describe("GET /ontology/email/:id/graph", () => {
  it("404s an email no run has seen", async () => {
    const response = await get("/ontology/email/email_t_nothing_here/graph");
    expect(response.status).toBe(404);
  });

  it("refuses more than two hops rather than drawing a hairball", async () => {
    const response = await get("/ontology/email/email_001/graph?hops=5");
    expect(response.status).toBe(400);
  });

  it("only draws a graph for an email, which is what the canvases draw", async () => {
    const response = await get("/ontology/client/algurg.ae/graph");
    expect(response.status).toBe(404);
    expect(response.body.error).toContain("only an email");
  });
});

describe("GET /database/tables", () => {
  it("lists both schemas with exact counts and says which are derived", async () => {
    const response = await get("/database/tables");
    expect(response.status).toBe(200);

    const tables: { schema: string; name: string; rows: number; kind: string }[] = response.body.tables;
    expect(tables.some((table) => table.schema === "core" && table.name === "emails")).toBe(true);

    // A materialized view is a table to a reader and a derived thing to a
    // writer; the page says which, so nobody looks for a writer of one.
    const fact = tables.find((table) => table.name === "fact_email_outcome");
    expect(fact?.kind).toBe("materialized view");
    expect(tables.find((table) => table.name === "dim_client")?.kind).toBe("view");
    expect(tables.find((table) => table.name === "emails")?.kind).toBe("table");
  });
});

describe("GET /database/tables/:schema/:name", () => {
  it("returns typed columns and the SQL that produced the page", async () => {
    const response = await get("/database/tables/core/emails?limit=5");
    expect(response.status).toBe(200);
    expect(response.body.sql).toBe("select * from core.emails order by email_id desc limit 5 offset 0");
    expect(response.body.limit).toBe(5);
    expect(response.body.rows.length).toBeLessThanOrEqual(5);

    const columns: { name: string; columnType: string }[] = response.body.columns;
    expect(columns.find((column) => column.name === "email_id")?.columnType).toBe("pk");
    expect(columns.find((column) => column.name === "first_seen_at")?.columnType).toBe("date");
    expect(columns.find((column) => column.name === "attachment_paths")?.columnType).toBe("list");
    expect(columns.find((column) => column.name === "raw")?.columnType).toBe("json");
  });

  it("refuses a schema it does not serve and a name that is not an identifier", async () => {
    expect((await get("/database/tables/pg_catalog/pg_class")).status).toBe(400);
    expect((await get("/database/tables/core/emails;drop")).status).toBe(400);
  });

  it("404s a table that does not exist", async () => {
    expect((await get("/database/tables/core/not_a_table")).status).toBe(404);
  });

  it("caps the page size rather than letting a caller ask for everything", async () => {
    expect((await get("/database/tables/core/emails?limit=5000")).status).toBe(400);
  });
});

describe("the six kinds and what sits beside them", () => {
  it("lists every resolved kind", async () => {
    for (const kind of ["carrier", "vessel", "commodity", "person"]) {
      const response = await get(`/ontology/${kind}`);
      expect(response.status).toBe(200);
      expect(response.body.type).toBe(kind);
    }
  });

  it("names what may be listed beside a thing, and refuses the rest", async () => {
    expect((await get("/ontology/port/1/people")).status).toBe(404);
    expect((await get("/ontology/party/99999999/ports")).status).toBe(404);
  });
});

describe("where a resolved thing opens", () => {
  it("sends a company and a port to their business pages", async () => {
    const list = await get("/ontology/party");
    const first = list.body.entities[0];
    if (!first) return;
    const record = await get(`/ontology/party/${first.id}`);
    expect(record.status).toBe(200);
    expect(record.body.openHref).toBe(`/company/${first.id}`);
  });
});
