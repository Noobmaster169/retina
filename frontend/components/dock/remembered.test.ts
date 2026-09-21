import { describe, expect, it } from "vitest";

import { rememberedConversation } from "./remembered";

describe("rememberedConversation", () => {
  it("resumes a conversation id and nothing else", () => {
    expect(rememberedConversation("0b8c2f2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f")).toBe("0b8c2f2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f");
    expect(rememberedConversation(null)).toBeNull();
    expect(rememberedConversation("")).toBeNull();
    expect(rememberedConversation("not an id")).toBeNull();
    expect(rememberedConversation("0b8c2f2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f' or 1=1")).toBeNull();
  });
});
