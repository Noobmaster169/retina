# proxy

A small HTTP gateway. It speaks the Anthropic Messages API and routes each
request, by alias, to `claude -p` (your Claude Code login), a local Ollama, or
an offline echo. The backend is its only client. It listens on loopback and
has no auth.

## Run

```sh
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
./start.sh                      # 127.0.0.1:4000, config from ./proxy.yaml
.venv/bin/pytest -q             # tests, all offline
```

Env overrides: `LLM_PROXY_HOST`, `LLM_PROXY_PORT`, `LLM_PROXY_CONFIG`.

## Aliases

Set in `proxy.yaml`. The alias is the model name.

| Alias | Goes to | Needs |
| --- | --- | --- |
| `sonnet`, `opus`, `haiku` | `claude -p --model <alias>` | `claude -p "hi"` works in your shell |
| `qwen3:14b`, `qwen3:4b`, `qwen3.8:27b` | Ollama on `127.0.0.1:11434` | the tag pulled (`ollama list`) |
| `test` | echo | nothing |

You can also send `provider/model` directly, e.g. `claudecli/sonnet` or
`ollama/qwen3:14b`.

## Endpoints

```sh
curl -s 127.0.0.1:4000/healthz
curl -s 127.0.0.1:4000/v1/models
curl -si 127.0.0.1:4000/v1/messages \
  -H 'content-type: application/json' -H 'x-api-key: dev' \
  -d '{"model":"test","max_tokens":20,"messages":[{"role":"user","content":"ping"}]}'
```

`/v1/messages` takes and returns the Anthropic Messages shape. `"stream": true`
gives SSE. `x-api-key` is a label, not a key; it comes back as
`X-LLM-Proxy-Project`. Other headers: `X-LLM-Proxy-Model`, `-Cost-USD`,
`-Provider`, `-Request-Id`, and `-Warnings` when a parameter was dropped.

Errors use the Anthropic error shape: 404 unknown alias, 400 unsupported
request, 502/503/504 upstream failure.

## Structured output

`output_config: { format: { type: "json_schema", schema } }` on a request makes the
schema a constraint on the provider, not a request in the prompt:

- `claudecli` passes it to `claude -p --json-schema` and reads the answer from the
  envelope's `structured_output`. This needs Claude Code **2.1.274 or newer** (that is
  where `--json-schema` was checked; 2.1.276 was used for the phase 2 live run). An older
  CLI returns no `structured_output`, and the provider answers 502 rather than pass prose
  on as if it were JSON. Streaming falls back to the blocking path while a schema is set.
- `ollama` and other OpenAI-compatible servers get
  `response_format: { type: "json_schema", json_schema: { name, schema, strict } }`.

The schema subset does not carry numeric or string bounds (`minimum`, `maxLength`);
those are advisory and the caller still validates the answer.

## What the config does

- `capabilities` strips parameters a model rejects. `temperature` never reaches
  Claude. `thinking` never reaches Ollama.
- `extra_body: { reasoning_effort: none }` on the Ollama provider turns Qwen's
  thinking off. `/no_think` in the prompt does not work.
- `max_tokens: 8000` on Qwen aliases. Prompt and answer share one context window.
  A request without `max_tokens` is fine: `claude -p` has no cap of its own and
  Ollama gets the 8000 ceiling.
