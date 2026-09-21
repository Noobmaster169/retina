import type { AttributeSource, EntityInsight, EntityKind, IdentityFact, InsightFacet, InsightLine } from "../../contracts";
import type { DossierInput } from "./dossier";
import { readProfile } from "./profile-read";

/**
 * What a thing means, assembled from the dossier the profile was written from.
 *
 * Pure. The caller loads; this decides which facets the kind gets and what
 * each line says. It lives here and not in a route because which three facts
 * make a carrier a carrier is a judgement about the trade, and a judgement
 * belongs in a tested function rather than in a query.
 *
 * Three facets at most per kind. A fourth was always the plumbing: how many
 * runs saw it, which documents it was read from. That belongs under the
 * evidence disclosure, where a reader goes to check rather than to learn.
 */

/** Per-kind extras the dossier does not carry, each loaded by one bounded query. */
export interface InsightExtras {
  /** Appearances the field judge called different. */
  disputed: number;
  appearances: number;
  /** For a carrier: the vessels that sailed under it. For a vessel: the carrier it sailed for. */
  vessels: { id: string; name: string; emails: number }[];
  carriers: { id: string; name: string; emails: number }[];
  /** For a vessel: each voyage, with the lane and the date the mail stated. */
  voyages: { voyage: string; lane: string | null; mailDate: string | null }[];
  /** For a commodity: the customs codes the mail stated, and what was moved. */
  hsCodes: { code: string; emails: number }[];
  totals: { containers: number | null; grossWeightKg: number | null };
  /** The identifiers the shipments around this thing carry, for a carrier's own formats. */
  references: { label: string; value: string }[];
}

export const NO_EXTRAS: InsightExtras = {
  disputed: 0,
  appearances: 0,
  vessels: [],
  carriers: [],
  voyages: [],
  hsCodes: [],
  totals: { containers: null, grossWeightKg: null },
  references: [],
};

/** The roles a person is known by, which is the whole of what a person is here. */
const PERSON_ROLES: Record<string, string> = {
  sender: "wrote from this address",
  signer: "signed off a message",
  addressee: "was written to",
};

/** How a party's roles read as a relationship, which is what the note says out loud. */
const PARTY_ROLES: Record<string, string> = {
  shipper: "sends cargo",
  on_behalf_of: "is the principal behind a shipper",
  consignee: "receives cargo",
  notify_party: "is notified on arrival",
  mentioned: "is named in passing",
};

function line(over: Partial<InsightLine> & { label: string }): InsightLine {
  return { detail: null, count: null, unit: null, target: null, tone: "neutral", ...over };
}

function facet(key: string, heading: string, note: string | null, lines: InsightLine[], total?: number): InsightFacet {
  return { key, heading, note, lines, total: total ?? lines.length };
}

/** A facet with nothing in it is left out rather than drawn empty: an empty heading is noise. */
function kept(facets: (InsightFacet | null)[]): InsightFacet[] {
  return facets.filter((one): one is InsightFacet => one !== null && one.lines.length > 0);
}

function roleFacet(input: DossierInput, words: Record<string, string>, heading: string): InsightFacet | null {
  const lines = input.roles.map((role) =>
    line({
      label: role.role,
      detail: words[role.role] ?? null,
      count: role.emails,
      unit: "email",
    }),
  );
  return lines.length === 0 ? null : facet("roles", heading, roleNote(input, words), lines);
}

/**
 * The sentence that turns two counts into a relationship. A company that is
 * only ever a consignee is a customer, and saying so is the difference between
 * a page that stores facts and one that means something.
 */
function roleNote(input: DossierInput, words: Record<string, string>): string | null {
  const [first, second] = input.roles;
  if (!first) return null;
  const what = words[first.role] ?? first.role;
  if (!second) return `Only ever ${first.role} here, so far as our mail shows: it ${what}.`;
  return `Most often ${first.role}, and ${second.role} in ${second.emails} ${second.emails === 1 ? "email" : "emails"}.`;
}

function laneFacet(input: DossierInput, heading: string): InsightFacet | null {
  const lines = input.lanes.map((lane) =>
    line({
      label: lane.from,
      detail: `to ${lane.to}`,
      count: lane.emails,
      unit: "email",
      target: { kind: "port", id: lane.fromId },
    }),
  );
  return lines.length === 0 ? null : facet("lanes", heading, null, lines);
}

function counterpartyFacet(input: DossierInput, kinds: EntityKind[], heading: string, note: string | null): InsightFacet | null {
  const lines = input.counterparties
    .filter((party) => kinds.includes(party.kind as EntityKind))
    .map((party) =>
      line({
        label: party.name,
        detail: party.kind,
        count: party.emails,
        unit: "email",
        target: { kind: party.kind as EntityKind, id: party.id },
      }),
    );
  return lines.length === 0 ? null : facet("with", heading, note, lines);
}

function goodsFacet(input: DossierInput, heading: string): InsightFacet | null {
  const lines = input.goods.map((goods) => line({ label: goods.description, count: goods.emails, unit: "email" }));
  return lines.length === 0 ? null : facet("goods", heading, null, lines);
}

function namesFacet(input: DossierInput, heading: string, note: string): InsightFacet | null {
  const lines = input.names.map((name) =>
    line({
      label: name.value,
      detail: name.joinedBy === "kept" ? "the spelling kept" : name.joinedBy === "judge" ? "judged the same thing" : "joined by a person",
      count: name.seenCount,
      unit: "time",
      tone: name.joinedBy === "judge" ? "match" : "neutral",
    }),
  );
  return lines.length < 2 ? null : facet("names", heading, note, lines);
}

function facetsOf(kind: EntityKind, input: DossierInput, extras: InsightExtras): InsightFacet[] {
  if (kind === "port") {
    return kept([
      roleFacet(input, { port_of_loading: "cargo leaves from here", port_of_discharge: "cargo arrives here" }, "Which end of the lane"),
      laneFacet(input, "Lanes it sits on"),
      counterpartyFacet(input, ["party"], "Who ships through it", null),
    ]);
  }
  if (kind === "party") {
    return kept([
      roleFacet(input, PARTY_ROLES, "What they are to us"),
      laneFacet(input, "Where they trade"),
      goodsFacet(input, "What they handle"),
    ]);
  }
  if (kind === "carrier") {
    return kept([
      extras.vessels.length === 0
        ? null
        : facet(
            "vessels",
            "Ships sailing under them",
            null,
            extras.vessels.map((vessel) =>
              line({ label: vessel.name, count: vessel.emails, unit: "email", target: { kind: "vessel", id: vessel.id } }),
            ),
          ),
      laneFacet(input, "Lanes served"),
      extras.references.length === 0
        ? null
        : facet("refs", "Numbers they issue", "How a clerk recognises their paperwork.", extras.references.map((reference) => line({ label: reference.value, detail: reference.label }))),
    ]);
  }
  if (kind === "vessel") {
    return kept([
      extras.voyages.length === 0
        ? null
        : facet(
            "voyages",
            "Voyages we have seen",
            null,
            extras.voyages.map((voyage) => line({ label: voyage.voyage, detail: [voyage.lane, voyage.mailDate].filter(Boolean).join(", ") || null })),
          ),
      extras.carriers.length === 0
        ? null
        : facet(
            "carrier",
            "Sailing for",
            null,
            extras.carriers.map((carrier) =>
              line({ label: carrier.name, count: carrier.emails, unit: "email", target: { kind: "carrier", id: carrier.id } }),
            ),
          ),
      goodsFacet(input, "Cargo carried"),
    ]);
  }
  if (kind === "commodity") {
    return kept([
      extras.hsCodes.length === 0
        ? null
        : facet(
            "hs",
            "Customs codes stated in the mail",
            "What the paperwork declares it as, which the model's chapter above is a reading of.",
            extras.hsCodes.map((code) => line({ label: code.code, count: code.emails, unit: "email" })),
          ),
      counterpartyFacet(input, ["party"], "Who sells it and who buys it", null),
      laneFacet(input, "Where it goes"),
    ]);
  }
  return kept([
    roleFacet(input, PERSON_ROLES, "How we know them"),
    counterpartyFacet(input, ["person", "party"], "Who they work with", "Two sightings are one person only where an address or a header tied them."),
    goodsFacet(input, "What their mail concerns"),
  ]);
}

/** Every attribute the profile set, with the "our mail" or "the model" split the page draws. */
function identityOf(
  attributes: Record<string, string | null>,
  sources: Record<string, Pick<AttributeSource, "source" | "confidence">>,
): IdentityFact[] {
  return Object.entries(attributes)
    .filter((entry): entry is [string, string] => entry[1] !== null && entry[1] !== "")
    .map(([key, value]) => ({
      key,
      label: label(key),
      value,
      verified: sources[key]?.source !== "model",
      confidence: sources[key]?.confidence ?? null,
    }));
}

/** `hsChapter` is not a word. Attribute keys are camelCase in the schema and sentences on the page. */
function label(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export interface InsightInput {
  kind: EntityKind;
  dossier: DossierInput;
  extras: InsightExtras;
  markdown: string | null;
  attributes: Record<string, string | null>;
  attributeSources: Record<string, Pick<AttributeSource, "source" | "confidence">>;
  spellings: number;
}

export function buildInsight(input: InsightInput): EntityInsight {
  const profile = readProfile(input.markdown);
  const evidence = namesFacet(
    input.dossier,
    "Written these ways",
    "Nothing but a model's verdict ever joined two spellings: no lowercasing, no edit distance, no list.",
  );
  return {
    kind: input.kind,
    summary: profile.summary,
    identity: identityOf(input.attributes, input.attributeSources),
    scale: {
      emails: input.dossier.emails,
      appearances: input.extras.appearances,
      spellings: input.spellings,
      disputed: input.extras.disputed,
      firstMailDate: input.dossier.firstMailDate,
      lastMailDate: input.dossier.lastMailDate,
    },
    facets: [...facetsOf(input.kind, input.dossier, input.extras), ...(evidence ? [evidence] : [])],
    unknowns: profile.unknowns,
  };
}
