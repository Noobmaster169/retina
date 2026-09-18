# retina-proxy

A small local HTTP gateway that speaks the Anthropic Messages API and routes each
request, by alias, to one of three backends: the Claude Code subscription (driven as
`claude -p`), a local Ollama, or an offline mock. The retina backend
(`backend/src/llm.ts`) is its only client. It binds loopback, authenticates nobody,
and reads the `x-api-key` the SDK sends purely as a project label for the
`X-LLM-Proxy-Project` header. Per-model parameter stripping (`capabilities` in
`proxy.yaml`) is what keeps `temperature` away from Claude and `thinking` away from
Ollama.

## Setup

```sh
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
./start.sh            # 127.0.0.1:4000, config from ./proxy.yaml
```

Environment overrides: `LLM_PROXY_HOST`, `LLM_PROXY_PORT`, `LLM_PROXY_CONFIG`,
`LLM_PROXY_LOG_LEVEL`. Extra arguments to `start.sh` pass through to uvicorn.

## Aliases and what they need

| alias | route | needs |
|---|---|---|
| `default`, `claude`, `claude-fast` | `claudecli/sonnet`, `/opus`, `/haiku` | Claude Code installed and logged in: `claude -p "hi"` must work in a shell |
| `qwen`, `qwen-small`, `qwen-large` | `ollama/qwen3:*` | Ollama running on `127.0.0.1:11434` with those tags pulled (see the comment in `proxy.yaml`; the Monash box uses different tags) |
| `test` | `mock/echo` | nothing |

## Endpoints

```sh
curl -s 127.0.0.1:4000/healthz

curl -s 127.0.0.1:4000/v1/models

curl -si 127.0.0.1:4000/v1/messages \
  -H 'content-type: application/json' -H 'x-api-key: retina-dev' \
  -d '{"model":"test","max_tokens":20,"messages":[{"role":"user","content":"ping"}]}'
```

`POST /v1/messages` takes and returns the Anthropic Messages shape, streaming
(`"stream": true`, named SSE frames) or not, and adds `X-LLM-Proxy-Model`,
`X-LLM-Proxy-Cost-USD`, `X-LLM-Proxy-Provider`, `X-LLM-Proxy-Project`,
`X-LLM-Proxy-Request-Id` and, when a parameter was stripped, `X-LLM-Proxy-Warnings`.
Errors use the Anthropic error envelope: 404 for an unknown alias, 400 for a request
the target provider cannot serve, 502/503/504 for upstream failures.

## Tests

```sh
.venv/bin/pytest -q
```

Everything runs offline against the mock provider and a stub `claude` executable.
