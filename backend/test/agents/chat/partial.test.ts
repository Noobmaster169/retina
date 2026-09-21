import { describe, expect, it } from "vitest";

import { valueSoFar } from "../../../src/agents/chat/partial";

/**
 * The preview reader, against the shapes a half-written answer actually takes.
 *
 * The cases that matter are the ones where the document stops mid-token: the
 * proxy sends whatever the model has written, and that is as likely to end
 * inside an escape as anywhere else.
 */

describe("valueSoFar", () => {
  const cases: { name: string; text: string; key?: string; want: string }[] = [
    { name: "nothing written yet", text: "", want: "" },
    { name: "the object has only opened", text: "{", want: "" },
    { name: "an earlier key, no answer yet", text: '{"action":"final",', want: "" },
    { name: "the key is written but its value has not started", text: '{"answer":', want: "" },
    { name: "the value has opened and is empty", text: '{"answer":"', want: "" },
    { name: "the value is being written", text: '{"answer":"Run 9e8efb9c has', want: "Run 9e8efb9c has" },
    { name: "the value is complete", text: '{"answer":"20 emails.","outcome":"answered"}', want: "20 emails." },
    { name: "the key never appears", text: '{"action":"tool","calls":[]}', want: "" },
    { name: "whitespace around the colon", text: '{"answer" : "spaced"}', want: "spaced" },

    // Escapes, whole and cut in half.
    {
      name: "an escaped quote inside the value",
      text: String.raw`{"answer":"the \"Buatan\" port"}`,
      want: 'the "Buatan" port',
    },
    { name: "a newline escape", text: String.raw`{"answer":"one\ntwo"}`, want: "one\ntwo" },
    // Built by hand: a raw string cannot end in the backslash this case is about.
    { name: "a trailing backslash is dropped", text: '{"answer":"one' + "\\", want: "one" },
    { name: "a half-written unicode escape is dropped", text: String.raw`{"answer":"one\u00`, want: "one" },
    { name: "a complete unicode escape", text: String.raw`{"answer":"café"}`, want: "café" },
    { name: "a backslash that escapes a backslash", text: String.raw`{"answer":"a\\b"}`, want: "a\\b" },

    // The reason keys are walked rather than searched for.
    {
      name: "the key name quoted inside an earlier value is not the key",
      text: String.raw`{"reading":"they asked \"answer\": what?","answer":"the real one"}`,
      want: "the real one",
    },
    {
      name: "the key name inside an earlier value, before the real key is reached",
      text: String.raw`{"reading":"about \"answer\"","act`,
      want: "",
    },

    // Another field, to show the reader is not hardwired to one name.
    {
      name: "a different key",
      text: '{"reading":"about run 9e8efb9c","answer":"x"}',
      key: "reading",
      want: "about run 9e8efb9c",
    },
    { name: "a different key, still open", text: '{"reading":"about run', key: "reading", want: "about run" },
  ];

  for (const { name, text, key, want } of cases) {
    it(name, () => {
      expect(valueSoFar(text, key ?? "answer")).toBe(want);
    });
  }

  it("grows monotonically as the document arrives piece by piece", () => {
    const whole = '{"action":"final","reading":"r","answer":"Run 9e8efb9c has 20 emails.","outcome":"answered"}';
    const final = "Run 9e8efb9c has 20 emails.";
    const seen: string[] = [];
    for (let cut = 0; cut <= whole.length; cut++) seen.push(valueSoFar(whole.slice(0, cut), "answer"));

    // Never ahead of the finished value, and never shrinking once it has started.
    for (const value of seen) expect(final.startsWith(value)).toBe(true);
    const started = seen.filter((value) => value !== "");
    for (let i = 1; i < started.length; i++) expect(started[i].length).toBeGreaterThanOrEqual(started[i - 1].length);
    expect(seen.at(-1)).toBe(final);
  });
});
