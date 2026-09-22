/**
 * The header a run request carries its password in.
 *
 * Its own file because the form is a client component and `run-gate.ts` reads
 * `node:crypto`: importing the checker to borrow one string would pull the
 * whole of it into the browser bundle, which is both the wrong size and the
 * wrong side of the line this gate draws.
 *
 * A header and not a body field, so nothing of it reaches the backend's
 * contract for creating a run.
 */
export const RUN_PASSWORD_HEADER = "x-run-password";
