/**
 * Which conversation the dock resumes. Pure.
 *
 * What local storage holds is text a person could have edited; only a real
 * conversation id is worth asking the backend about, and anything else reads
 * as nothing remembered.
 */
const CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function rememberedConversation(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return CONVERSATION_ID.test(raw) ? raw : null;
}
