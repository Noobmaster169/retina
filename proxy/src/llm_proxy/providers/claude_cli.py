"""The Claude Code CLI as a provider — the subscription money rail.

A subprocess, not an HTTP client.

Two things about this adapter are non-obvious and both are load-bearing:

  1. `ANTHROPIC_API_KEY` must be BLANKED, not deleted, in the child environment.
     See `child_env` below for why.
  2. The cost it reports is COUNTERFACTUAL. `total_cost_usd` is what the call would
     have cost via the API; no money leaves the account. It is surfaced as
     X-LLM-Proxy-Cost-USD for information, never treated as spend.

Capability-wise this is a poor cousin of the HTTP API: `claude -p` spawns a whole
agent session per call, so there is no tool-use API, no separate system prompt, and
seconds of startup latency. The `claudecli/*` entry in capabilities.py says so, and
rejects requests it cannot honour rather than silently degrading them.

Structured output is the exception: `output_config.format` maps onto the CLI's own
`--json-schema`, which validates the answer against the schema and returns it in the
envelope's `structured_output`. `max_tokens` has no CLI equivalent and is ignored.
"""

from __future__ import annotations

import asyncio
import os
import shutil
from typing import Any, AsyncIterator

import orjson

from ..canon.request import CanonRequest, TextBlock
from ..canon.response import CanonResponse, CanonUsage, StopReason
from ..canon.stream import (
    BlockStart,
    BlockStop,
    CanonEvent,
    MessageDelta,
    MessageStart,
    MessageStop,
    StreamError,
    TextDelta,
)
from ..config import ProviderConfig
from ..errors import InvalidRequest, ProviderError, ProviderTimeout, RateLimited
from .base import BlockingOnly
from .retry import ConcurrencyGate, is_retryable


def child_env(cfg: ProviderConfig) -> dict[str, str]:
    """Environment for the `claude` subprocess.

    `claudecli` is the SUBSCRIPTION path and must not see an API key. If the shell
    that started the proxy exports ANTHROPIC_API_KEY, the CLI warns "claude.ai
    connectors are disabled because ANTHROPIC_API_KEY ... takes precedence over your
    claude.ai login" and can exit 1 — which killed a 395-unit run 11 minutes in, in
    the project this was ported from. Blank rather than delete: a child that calls
    load_dotenv() would otherwise just refill it from a .env file.
    """
    env = dict(os.environ)
    if cfg.neutralise_anthropic_key:
        env["ANTHROPIC_API_KEY"] = ""
    return env


def flatten(req: CanonRequest) -> str:
    """Render the conversation as the single prompt string `claude -p` accepts.

    There is no separate system field and no structured turn format here, so system
    text is prepended and roles are marked inline. Lossy by construction — which is
    why capabilities.py routes tool-using requests away from this provider.
    """
    parts: list[str] = []
    for block in req.system:
        if block.text:
            parts.append(block.text)
    for msg in req.messages:
        text = msg.text().strip()
        if not text:
            continue
        parts.append(text if len(req.messages) == 1 else f"{msg.role.capitalize()}: {text}")
    return "\n\n".join(parts)


def output_schema(req: CanonRequest) -> dict[str, Any] | None:
    """The JSON Schema from `output_config.format`, or None when the caller wants prose."""
    fmt = req.response_format
    if not fmt:
        return None
    schema = fmt.get("schema")
    if fmt.get("type") != "json_schema" or not isinstance(schema, dict):
        raise InvalidRequest(
            "output_config.format must be {type: 'json_schema', schema: {...}}",
            detail={"param": "output_config.format"},
        )
    return schema


def cli_args(exe: str, req: CanonRequest, output_format: str) -> list[str]:
    args = [exe, "-p", "--output-format", output_format, "--model", req.model_id]
    schema = output_schema(req)
    if schema is not None:
        args += ["--json-schema", orjson.dumps(schema).decode()]
    return args


class ClaudeCliProvider(BlockingOnly):
    type = "claudecli"

    def __init__(self, name: str, cfg: ProviderConfig) -> None:
        super().__init__(name, cfg)
        self.gate = ConcurrencyGate(cfg.max_concurrency)

    def _binary(self) -> str:
        exe = shutil.which(self.cfg.binary)
        if exe is None:
            raise ProviderError(
                f"`{self.cfg.binary}` not found on PATH (install Claude Code, or point "
                f"providers.{self.name}.binary at it)",
                provider=self.name,
            )
        return exe

    async def _run(self, args: list[str], prompt: str) -> tuple[int, str, str]:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=child_env(self.cfg),
        )
        try:
            out, err = await asyncio.wait_for(
                proc.communicate(prompt.encode()), timeout=self.cfg.timeout_s
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            raise ProviderTimeout(
                f"{self.name}: `claude` timed out after {self.cfg.timeout_s}s",
                provider=self.name,
            ) from None
        except asyncio.CancelledError:
            # Client disconnected mid-call. Reap the child rather than orphaning it —
            # `claude -p` sessions are heavyweight and would otherwise pile up.
            proc.kill()
            await proc.wait()
            raise
        return proc.returncode or 0, out.decode(errors="replace"), err.decode(errors="replace")

    def _envelope_to_response(self, envelope: dict[str, Any], req: CanonRequest) -> CanonResponse:
        if envelope.get("is_error") or envelope.get("subtype") not in (None, "success"):
            raise ProviderError(
                f"{self.name}: CLI error (subtype={envelope.get('subtype')}): "
                f"{str(envelope.get('result', ''))[:300]}",
                provider=self.name,
            )
        text = envelope.get("result") or ""
        if output_schema(req) is not None:
            # The validated object, not `result`: that is the model's prose and only
            # usually the same JSON. Missing means the CLI did not honour the schema,
            # and passing prose on would defeat the point of asking.
            structured = envelope.get("structured_output")
            if structured is None:
                raise ProviderError(
                    f"{self.name}: a JSON schema was sent but the CLI returned no "
                    "structured_output (is this Claude Code too old for --json-schema?)",
                    provider=self.name,
                )
            text = orjson.dumps(structured).decode()
        usage_raw = envelope.get("usage") or {}
        usage = CanonUsage(
            input_tokens=usage_raw.get("input_tokens") or 0,
            output_tokens=usage_raw.get("output_tokens") or 0,
            cache_read_input_tokens=usage_raw.get("cache_read_input_tokens") or 0,
            cache_creation_input_tokens=usage_raw.get("cache_creation_input_tokens") or 0,
            reported_cost_usd=envelope.get("total_cost_usd"),
        )
        return CanonResponse(
            id=envelope.get("session_id") or req.request_id,
            provider=self.name,
            model_id=req.model_id,
            alias=req.alias,
            content=[TextBlock(text=text)] if text else [],
            stop_reason=StopReason.END_TURN,
            usage=usage,
        )

    async def complete(self, req: CanonRequest) -> CanonResponse:
        exe = self._binary()
        prompt = flatten(req)
        args = cli_args(exe, req, "json")

        from .retry import BACKOFF_S

        last = ""
        for attempt in range(len(BACKOFF_S) + 1):
            async with self.gate.semaphore():
                rc, out, err = await self._run(args, prompt)
                last = (err or out or "").strip()[:400]
            if rc == 0:
                break
            if attempt == len(BACKOFF_S) or not is_retryable(last):
                if is_retryable(last):
                    raise RateLimited(
                        f"{self.name}: rate limited, {attempt + 1} attempts exhausted: {last}",
                        provider=self.name,
                    )
                raise ProviderError(
                    f"{self.name}: `claude` exited {rc}: {last}", provider=self.name
                )
            # Sleep outside the semaphore — a limit is global, and holding a slot
            # while waiting would idle every other worker.
            import random

            await asyncio.sleep(BACKOFF_S[attempt] * (0.75 + random.random() * 0.5))

        try:
            envelope = orjson.loads(out)
        except orjson.JSONDecodeError as e:
            raise ProviderError(
                f"{self.name}: could not parse the CLI JSON envelope: {e}",
                provider=self.name,
            ) from e
        return self._envelope_to_response(envelope, req)

    async def stream(self, req: CanonRequest) -> AsyncIterator[CanonEvent]:
        # A schema-bound answer arrives whole in the final envelope, so there is
        # nothing to stream natively: the text deltas would be unvalidated prose.
        if self.cfg.stream_mode != "native" or output_schema(req) is not None:
            async for event in super().stream(req):
                yield event
            return

        exe = self._binary()
        prompt = flatten(req)
        args = [
            exe, "-p", "--output-format", "stream-json", "--verbose",
            "--model", req.model_id,
        ]

        yield MessageStart(
            id=req.request_id, provider=self.name, model_id=req.model_id, alias=req.alias
        )
        yield BlockStart(index=0, block=TextBlock(text=""))

        usage = CanonUsage()
        emitted = False
        proc: asyncio.subprocess.Process | None = None
        try:
            async with self.gate.semaphore():
                proc = await asyncio.create_subprocess_exec(
                    *args,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                    env=child_env(self.cfg),
                )
                assert proc.stdin is not None and proc.stdout is not None
                proc.stdin.write(prompt.encode())
                await proc.stdin.drain()
                proc.stdin.close()

                async for raw_line in proc.stdout:
                    line = raw_line.decode(errors="replace").strip()
                    if not line:
                        continue
                    try:
                        event = orjson.loads(line)
                    except orjson.JSONDecodeError:
                        continue

                    kind = event.get("type")
                    if kind == "assistant":
                        message = event.get("message") or {}
                        for block in message.get("content") or []:
                            if block.get("type") == "text" and block.get("text"):
                                emitted = True
                                yield TextDelta(index=0, text=block["text"])
                        if message.get("usage"):
                            u = message["usage"]
                            usage = CanonUsage(
                                input_tokens=u.get("input_tokens") or 0,
                                output_tokens=u.get("output_tokens") or 0,
                                cache_read_input_tokens=u.get("cache_read_input_tokens") or 0,
                                cache_creation_input_tokens=(
                                    u.get("cache_creation_input_tokens") or 0
                                ),
                                reported_cost_usd=usage.reported_cost_usd,
                            )
                    elif kind == "result":
                        if event.get("total_cost_usd") is not None:
                            usage.reported_cost_usd = event["total_cost_usd"]
                        if not emitted and event.get("result"):
                            yield TextDelta(index=0, text=event["result"])
                            emitted = True

                await proc.wait()
                if proc.returncode not in (0, None):
                    stderr = (await proc.stderr.read()).decode(errors="replace")[:400]
                    yield StreamError(
                        code="provider_error",
                        message=f"{self.name}: `claude` exited {proc.returncode}: {stderr}",
                        retryable=is_retryable(stderr),
                    )
                    return
        except asyncio.CancelledError:
            if proc is not None and proc.returncode is None:
                proc.kill()
                await proc.wait()
            raise
        except Exception as e:  # noqa: BLE001
            if proc is not None and proc.returncode is None:
                proc.kill()
                await proc.wait()
            yield StreamError(code="provider_error", message=f"{self.name}: {e}")
            return

        yield BlockStop(index=0)
        yield MessageDelta(stop_reason=StopReason.END_TURN, usage=usage)
        yield MessageStop()
