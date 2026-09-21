/**
 * The frontend's only door to the backend. Server-side only: the shared
 * secret must never reach the browser, so nothing under components/ may
 * import this — pages, route handlers and server actions do.
 *
 * One resource per file under lib/api/. Every response is parsed against a zod
 * schema mirrored by hand from the backend's contracts, so a drift fails here,
 * naming the field, instead of reaching a component as undefined.
 *
 * The list of what that is grew past the 200 lines eslint allows, so it is
 * split in two on the seam the rail already draws (`components/shell/nav.ts`):
 * operations, and business. The halves export disjoint names and callers still
 * import everything from this one file.
 */
export * from "./api-client.business";
export * from "./api-client.operations";
