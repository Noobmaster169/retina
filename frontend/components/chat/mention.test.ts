import { describe, expect, it } from "vitest";

import { isMentionHref, mentionIn, withoutUnfinishedLink } from "./mention";

describe("mentionIn", () => {
  const cases: { name: string; href: string | undefined; want: ReturnType<typeof mentionIn> }[] = [
    { name: "a verified company opens its page", href: "entity:party/412", want: { kind: "party", id: "412", href: "/company/412" } },
    { name: "a verified port opens its page", href: "entity:port/77", want: { kind: "port", id: "77", href: "/port/77" } },
    { name: "a kind with no page of its own keeps the card and loses the link", href: "entity:vessel/9", want: { kind: "vessel", id: "9", href: null } },
    { name: "the half-written ref a stream carries is not a mention", href: "entity:412", want: null },
    { name: "a kind nothing defines is not a mention", href: "entity:galaxy/1", want: null },
    { name: "an ordinary link is not a mention", href: "https://example.org", want: null },
    { name: "no href at all is not a mention", href: undefined, want: null },
  ];

  for (const one of cases) {
    it(one.name, () => expect(mentionIn(one.href)).toEqual(one.want));
  }
});

describe("isMentionHref", () => {
  it("is true for a verified and an unverified ref alike", () => {
    expect(isMentionHref("entity:party/412")).toBe(true);
    expect(isMentionHref("entity:412")).toBe(true);
    expect(isMentionHref("https://example.org")).toBe(false);
  });
});

describe("withoutUnfinishedLink", () => {
  const cases: { name: string; text: string; want: string }[] = [
    { name: "a link still being opened is held back", text: "The busiest is [Evergreen Mar", want: "The busiest is " },
    { name: "a ref still being written is held back", text: "The busiest is [Evergreen Marine Corp](entity:", want: "The busiest is " },
    { name: "a closed link is shown", text: "The busiest is [Evergreen Marine Corp](entity:412).", want: "The busiest is [Evergreen Marine Corp](entity:412)." },
    { name: "prose with no link is untouched", text: "**14** of them differed.", want: "**14** of them differed." },
    { name: "a link being opened on the last line is held back", text: "- [a](entity:1)\nand then [b", want: "- [a](entity:1)\nand then " },
    { name: "a bracket the answer left behind a line ago is not one being written", text: "a stray [ bracket\nand a second line", want: "a stray [ bracket\nand a second line" },
  ];

  for (const one of cases) {
    it(one.name, () => expect(withoutUnfinishedLink(one.text)).toBe(one.want));
  }
});
