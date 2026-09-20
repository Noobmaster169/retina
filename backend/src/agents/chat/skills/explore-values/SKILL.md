---
name: explore-values
version: 1
when: You are about to filter or group on a text column whose values the schema notes do not list.
---
Look at a column before you filter on it. The values are rarely spelt the way a question spells
them, and a filter on a guessed value returns nothing and looks like a finding.

1. If the column is one of the enums in the schema notes (category, status, review reason, the
   seven fields, stage, the two `decided_by` columns, entity kind, how a spelling joined), use
   the value exactly as listed there. No lookup is needed.
2. Otherwise call `profile_column` with the relation and the column. It returns the row count,
   the distinct count, the null count, and the thirty most frequent values with their counts.
3. Filter on a value exactly as it came back, including its case and punctuation.
4. When the value you wanted is not in the list, it may be rare rather than absent: search for
   it with a `like` pattern, which is always allowed, and then filter on what that returns.

What goes wrong here:

- A column can look like an enum and not be one. `outcome` on `core.email_runs` carries both
  comparison statuses and review reasons; profile it before grouping on it.
- A sender is an address and a domain. Group by `sender_domain` for companies; `from_addr` is
  one mailbox.
- Values read out of documents are stored as written: upper case, with addresses, codes and
  units attached. Never compare them to a tidy version of themselves.
