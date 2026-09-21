# Phase 15: The chat streams, and shows the working only when asked

Written 2026-09-21 after measuring the chat on the local stack. Read `CLAUDE.md`, then the
phase 10e spec, then this. Nothing here changes what the agent decides; it changes when the
person sees it and how much of it they see.

## Goal

A question feels answered while it is being answered. The prose arrives a word at a time, a
single line says what the agent is doing, and the working is there for anyone who wants it and
in the way of nobody who does not.

## What was measured, and against what

On the local stack, 2026-09-21, against run `9e8efb9c`. The API process in front of these
numbers predates the `v6`/opus commits and recorded `sonnet v4`, so every figure is a floor and
the committed configuration is slower.

- A bare proxy call with a two token prompt and a four token reply: opus 3.25 s, sonnet 3.16 s,
  haiku 2.80 s. The alias is worth 0.4 s. The rest is `claude -p` starting an agent session per
  call, which `proxy/src/llm_proxy/providers/claude_cli.py` says in its own docstring.
- "How many emails are in this run?" end to end: **8.5 s**, **no tool calls**, one model call.
  The answer was seven words.
- Chat calls in `core.llm_calls`, latency against output tokens: 803 tokens 8.4 s, 1059 tokens
  12.0 s, 2255 tokens 24.3 s, 2633 tokens 23.6 s. Latency is output length at roughly 100
  tokens a second.

The seven word answer cost 803 output tokens because `loop.steps.ts` has every step emit
`reading`, `answer`, `checked`, `next`, `clarify` and `sql_used` whether or not the step has
anything to put in them.

## What the person sees today

Nothing, for the whole of that wait.

- There is no SSE anywhere in the repository. `POST /chat/:id/messages` holds until the answer
  is complete and returns it in one body.
- `structured.ts` can stream. It builds a `livePreview` and sets `request.onText` when
  `deps.live && call.emailRunId && call.runId`. The chat loop passes `runId: null`, because a
  conversation's tokens are not a run's cost. A cost accounting condition is what switches the
  chat's streaming off.
- `live-steps.tsx` draws one of two fixed strings and a seconds counter. `use-live-steps.ts`
  polls once a second and keeps only `role === "tool"` rows, so a question that calls no tool,
  which is the common fast question, shows one static line for its whole duration.
- When the answer lands, `turn.tsx` renders the reading, the prose, the outcome, every query
  with its rows, the tool list and the next moves at once.

## Design decisions

1. **The same route, two shapes.** `POST /chat/:id/messages` keeps its body and gains a
   streaming form chosen by `Accept: text/event-stream`. The stream's `answer` event carries
   exactly the `ChatAnswer` the blocking form returns, so the contract is extended and not
   broken, and a caller that does not ask for a stream sees no change.
2. **The preview is the JSON being written, so the prose is read out of it.** With a schema the
   text deltas are the model writing its object. `answerSoFar` reads the value of a named key
   out of an unfinished JSON document and returns what has been written of it. Pure, and the
   only new thing that needs a table-driven test.
3. **A step is a phase, not a sentence.** The indicator is driven by where the loop is: reading
   the question, looking with a named tool, writing the answer. The strings belong to the
   frontend; the events carry state.
4. **The answer and the graph are the page. Everything else is behind one row.** The reading,
   the queries, the rows and the tool list move inside a single collapsed control under the
   answer. Nothing is removed, because an answer nobody can check is worth less than one they
   can.
5. **The answer is structured by the one call that writes it, never by a second one.**
   A formatting pass is another `claude -p` session, which measured 2.8 s to 3.2 s before it
   writes a token, and it would re-emit the whole answer only to change its shape. Speed is
   the thing being bought here, so the shape is bought where it is free: in the schema's
   description of `answer` and in the prompt, which already carry the style rule. Where a
   structure is wanted that the prompt does not reliably produce, the fix is a sharper rule on
   the field, not a second call.
6. **Rows are evidence, not prose.** What a query returned is never written into the answer.
   It stays with the query, inside the collapsed working, where a reader can check it. The
   answer names the number and says what it means. This is what stops the output reading as a
   dump: the noise was never the prose, it was the result set sitting under it in the same
   column.
7. **Fields nobody asked for are not generated.** `checked`, `next` and `clarify` earn their
   tokens only where the outcome uses them. This is the only item here that moves the real
   clock rather than the felt one, and it is measured with the chat eval before and after.

## Work items

### 1. Reading prose out of an unfinished object

`agents/chat/partial.ts`, pure. `answerSoFar(text, key)` returns what has been written of that
key's string value, decoding escapes, tolerating a truncated escape at the end, and returning
an empty string before the key appears. Table-driven test over: no key yet, key with an open
quote, a partial escape, an embedded quote, a complete value, a key that never appears.

### 2. Letting the chat stream

`structured.ts` gains an optional `onPreview` on the call, taken when there is no run to stream
to. The `deps.live && emailRunId && runId` path is untouched, so the run page keeps the
behaviour it has.

### 3. The turn as a stream

`runTurn` gains an optional `onProgress(event)` reporting the phase, the step number, and the
prose so far. `routes/chat.turn.ts` passes it through. `chat.routes.ts` writes SSE when the
request asks for it: `progress` events while the turn runs, then one `answer` event with the
`ChatAnswer`, or one `failure` event carrying the message the blocking form would have put in
its body.

### 4. The client

`use-chat.ts` reads the stream instead of polling when the browser supports it, keeping the
abort as the stop. `use-live-steps.ts` and its poll are removed once nothing reads them.
`status-line.tsx` replaces `live-steps.tsx`: a pulsing mark, the phase in words, the elapsed
clock, and the tool name when there is one.

### 5. What the finished turn shows

`turn.tsx` keeps the graph, the prose and the outcome line. `Reading`, `SqlBlock` and
`ToolsUsed` move inside one `details` labelled with the number of queries and calls.

### 6. The shape of the prose

The `answer` description in `loop.steps.ts` and the "How to answer well" section of the chat
prompt are the only places the shape is stated, and they already broadly agree. They are
brought into line on one point: the answer leads with the sentence that answers the question,
uses a list only where there are three or more parallel things, uses a heading only where the
answer has distinct parts, and never reproduces a result set. No second model call is added.

### 7. The schema

`checked`, `next` and `clarify` are described as conditional and the prompt says when to fill
them. Measured with `pnpm chat:eval` on the same questions before and after, and the output
token count from `core.llm_calls` quoted in the commit.

## Exit checklist

- [ ] `pnpm type-check` and `pnpm test` pass in `backend/`, `pnpm type-check` in `frontend/`.
- [ ] `answerSoFar` has a table-driven test covering a truncated escape.
- [ ] The blocking form of `POST /chat/:id/messages` returns what it returned before.
- [ ] A question that calls no tool shows moving prose before it is finished.
- [ ] The finished turn shows the graph, the prose and the outcome, and nothing else unopened.
- [ ] An answer never reproduces a result set; the rows are under the collapsed working.
- [ ] Output tokens for a short answer, before and after item 7, are in the commit message.
- [ ] `03-infra-deep.md` carries the streaming form of the route.
- [ ] `PROGRESS.md` updated and the branch merged to `main`.
