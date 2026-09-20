import type { ChatGraph, ChatGraphNode, ChatToolCall } from "../../contracts";
import type { ToolOutcome } from "./tools";

/**
 * The result graph: what the agent touched, drawn beside what it said.
 *
 * Four columns, left to right: the question, each tool it called, each
 * relation that tool read, and the things that came back. Pure, and built only
 * from what the tools reported: a relation the frontend inferred from the
 * answer would be a picture of a guess, and the whole point of this panel is
 * that it is a picture of a fact
 * (docs/design/ontology-patterns.md section 3.6).
 *
 * A relation that returned nothing still gets a node carrying its 0. Showing
 * the dead end is the point: it is the difference between "there were none"
 * and "it did not look".
 */

/** A tool call with what it reported touching, which is more than crosses the wire. */
export type TouchedCall = ChatToolCall & Pick<ToolOutcome, "touched" | "entities">;

/** Past this, the widest column collapses into one node carrying the count. */
const MAX_PER_COLUMN = 6;

function truncate(text: string, at: number): string {
  return text.length <= at ? text : `${text.slice(0, at - 1)}…`;
}

export function buildGraph(question: string, calls: TouchedCall[]): ChatGraph {
  const nodes: ChatGraphNode[] = [
    { id: "ask", kind: "question", label: truncate(question, 60), count: null, empty: false },
  ];
  const edges: { from: string; to: string }[] = [];
  const seen = new Set<string>(["ask"]);

  function add(node: ChatGraphNode, from: string): void {
    if (!seen.has(node.id)) {
      nodes.push(node);
      seen.add(node.id);
    }
    if (!edges.some((edge) => edge.from === from && edge.to === node.id)) edges.push({ from, to: node.id });
  }

  calls.forEach((call, index) => {
    const toolId = `tool:${index}:${call.tool}`;
    add({ id: toolId, kind: "tool", label: call.tool, count: null, empty: !call.ok }, "ask");

    for (const touch of call.touched) {
      const relationId = `rel:${touch.relation}`;
      add(
        { id: relationId, kind: "relation", label: touch.relation, count: touch.count, empty: touch.count === 0 },
        toolId,
      );

      // Entities hang off the relations of the call that produced them. A call
      // that read several relations attaches them to the first, because which
      // of two joined tables a row "came from" is not a fact either.
      if (touch !== call.touched[0]) continue;
      const shown = call.entities.slice(0, MAX_PER_COLUMN);
      for (const entity of shown) {
        add({ id: `ent:${entity}`, kind: "entity", label: truncate(entity, 32), count: null, empty: false }, relationId);
      }
      const hidden = call.entities.length - shown.length;
      if (hidden > 0) {
        add({ id: `ent:more:${index}`, kind: "entity", label: `+${hidden} more`, count: hidden, empty: false }, relationId);
      }
    }
  });

  return { nodes, edges };
}
