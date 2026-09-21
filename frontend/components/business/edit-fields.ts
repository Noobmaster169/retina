/**
 * What a person may edit on each kind, in the order the form shows them.
 * The backend refuses any key outside the kind's schema; this list is the
 * form's, and it names each field in the reader's words.
 */
export interface EditField {
  key: string;
  label: string;
  hint?: string;
}

export const EDIT_FIELDS: Record<string, EditField[]> = {
  port: [
    { key: "country", label: "Country" },
    { key: "countryCode", label: "Country code", hint: "two letters, for the flag" },
    { key: "locode", label: "UN/LOCODE", hint: "five letters" },
    { key: "lat", label: "Latitude", hint: "decimal degrees" },
    { key: "lon", label: "Longitude", hint: "decimal degrees" },
    { key: "coast", label: "Coast" },
  ],
  party: [
    { key: "country", label: "Country" },
    { key: "countryCode", label: "Country code", hint: "two letters, for the flag" },
    { key: "city", label: "City" },
    { key: "kind", label: "Kind", hint: "a mill, a converter, a distributor, a forwarder" },
    { key: "sector", label: "Sector" },
    { key: "group", label: "Group", hint: "the parent, where several spellings are one company" },
  ],
};

/** Only what changed, with an emptied field sent as null so it clears. */
export function changedAttributes(before: Record<string, string | null>, after: Record<string, string>): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(after)) {
    const trimmed = value.trim();
    const was = before[key] ?? "";
    if (trimmed === was) continue;
    out[key] = trimmed === "" ? null : trimmed;
  }
  return out;
}
