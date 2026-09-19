"""Provider adapters, exercised without network or spend.

Ollama (openai_compatible) goes through httpx.MockTransport; claude-cli goes through
a real executable stub placed on PATH.
"""

from __future__ import annotations

import json
import os
import stat
import textwrap

import httpx
import pytest

from llm_proxy.canon.request import CanonMessage, CanonRequest, TextBlock
from llm_proxy.canon.stream import aggregate
from llm_proxy.config import ProviderConfig
from llm_proxy.errors import InvalidRequest, ProviderError, ProviderTimeout, RateLimited
from llm_proxy.providers.claude_cli import ClaudeCliProvider, child_env, cli_args, flatten
from llm_proxy.providers.openai_api import OpenAIProvider


def canon_req(provider: str, model_id: str, **kw) -> CanonRequest:
    base = dict(
        alias="a",
        provider=provider,
        model_id=model_id,
        request_id="req_test",
        max_tokens=100,
        messages=[CanonMessage(role="user", content=[TextBlock(text="hello")])],
    )
    base.update(kw)
    return CanonRequest(**base)


# ---------------------------------------------------------------------- ollama

OLLAMA = "http://127.0.0.1:11434/v1"


def ollama_provider(handler, **cfg) -> OpenAIProvider:
    p = OpenAIProvider("ollama", ProviderConfig(type="openai_compatible", base_url=OLLAMA, **cfg))
    p._client = httpx.AsyncClient(transport=httpx.MockTransport(handler), base_url=OLLAMA)
    return p


def openai_sse(*chunks: dict) -> bytes:
    body = "".join(f"data: {json.dumps(c)}\n\n" for c in chunks)
    return (body + "data: [DONE]\n\n").encode()


async def test_stream_decodes_text_and_usage():
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        # StreamOnly always streams upstream, with usage requested — it is the only
        # reliable way to get token counts off the OpenAI wire.
        assert body["stream"] is True
        assert body["stream_options"] == {"include_usage": True}
        assert body["messages"] == [{"role": "user", "content": "hello"}]
        return httpx.Response(200, content=openai_sse(
            {"id": "c1", "model": "qwen3:14b",
             "choices": [{"index": 0, "delta": {"role": "assistant", "content": "He"}}]},
            {"id": "c1", "model": "qwen3:14b",
             "choices": [{"index": 0, "delta": {"content": "llo"}}]},
            {"id": "c1", "model": "qwen3:14b",
             "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]},
            {"id": "c1", "model": "qwen3:14b", "choices": [],
             "usage": {"prompt_tokens": 4, "completion_tokens": 2}},
        ), headers={"content-type": "text/event-stream"})

    resp = await ollama_provider(handler).complete(canon_req("ollama", "qwen3:14b"))
    assert resp.text() == "Hello"
    assert resp.usage.input_tokens == 4
    assert resp.usage.output_tokens == 2
    assert resp.stop_reason.value == "end_turn"


async def test_renames_the_output_cap_and_merges_extra_body():
    """Ollama 0.32 parses `max_completion_tokens`, ignores it, and generates to the
    context wall. It honours `max_tokens`. And `reasoning_effort: none` is the only
    switch that turns Qwen 3's thinking off — without it `content` comes back empty
    with the reasoning in a field no Anthropic-shaped client reads."""
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(200, content=openai_sse(
            {"id": "c1", "model": "qwen3", "choices": [
                {"index": 0, "delta": {"role": "assistant", "content": "ok"}}]},
            {"id": "c1", "model": "qwen3", "choices": [
                {"index": 0, "delta": {}, "finish_reason": "stop"}]},
        ), headers={"content-type": "text/event-stream"})

    p = ollama_provider(
        handler, max_tokens_field="max_tokens", extra_body={"reasoning_effort": "none"}
    )
    await p.complete(canon_req("ollama", "qwen3:14b-ctx16k"))

    assert seen["max_tokens"] == 100
    assert "max_completion_tokens" not in seen
    assert seen["reasoning_effort"] == "none"


async def test_keeps_the_new_output_cap_name_by_default():
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(200, content=openai_sse(
            {"id": "c1", "model": "m", "choices": [
                {"index": 0, "delta": {}, "finish_reason": "stop"}]},
        ), headers={"content-type": "text/event-stream"})

    await ollama_provider(handler).complete(canon_req("ollama", "m"))

    assert seen["max_completion_tokens"] == 100
    assert "max_tokens" not in seen
    assert "reasoning_effort" not in seen


async def test_system_prompt_becomes_a_system_message():
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(200, content=openai_sse(
            {"id": "c1", "model": "m", "choices": [
                {"index": 0, "delta": {}, "finish_reason": "stop"}]},
        ), headers={"content-type": "text/event-stream"})

    await ollama_provider(handler).complete(
        canon_req("ollama", "m", system=[TextBlock(text="Be terse.")])
    )
    assert seen["messages"][0] == {"role": "system", "content": "Be terse."}


async def test_stream_decodes_parallel_tool_calls():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=openai_sse(
            {"id": "c", "model": "m", "choices": [{"index": 0, "delta": {
                "tool_calls": [{"index": 0, "id": "call_a", "type": "function",
                                "function": {"name": "w", "arguments": ""}}]}}]},
            {"id": "c", "model": "m", "choices": [{"index": 0, "delta": {
                "tool_calls": [{"index": 1, "id": "call_b", "type": "function",
                                "function": {"name": "w", "arguments": ""}}]}}]},
            {"id": "c", "model": "m", "choices": [{"index": 0, "delta": {
                "tool_calls": [{"index": 0,
                                "function": {"arguments": '{"c":"Paris"}'}}]}}]},
            {"id": "c", "model": "m", "choices": [{"index": 0, "delta": {
                "tool_calls": [{"index": 1,
                                "function": {"arguments": '{"c":"London"}'}}]}}]},
            {"id": "c", "model": "m",
             "choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls"}]},
        ), headers={"content-type": "text/event-stream"})

    resp = await ollama_provider(handler).complete(canon_req("ollama", "m"))
    uses = resp.tool_uses()
    assert [u.id for u in uses] == ["call_a", "call_b"]
    assert uses[0].input == {"c": "Paris"}
    assert uses[1].input == {"c": "London"}
    assert resp.stop_reason.value == "tool_use"


async def test_reasoning_content_becomes_a_thinking_block():
    """If Ollama does emit reasoning, it lands in a thinking block — never in text."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=openai_sse(
            {"id": "c", "model": "m", "choices": [
                {"index": 0, "delta": {"reasoning": "thinking..."}}]},
            {"id": "c", "model": "m", "choices": [
                {"index": 0, "delta": {"content": "answer"}}]},
            {"id": "c", "model": "m",
             "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]},
        ), headers={"content-type": "text/event-stream"})

    resp = await ollama_provider(handler).complete(canon_req("ollama", "m"))
    assert [b.type for b in resp.content] == ["thinking", "text"]
    assert resp.text() == "answer"


async def test_needs_no_api_key():
    """Local Ollama wants no auth; api_key_env: null must be legitimate."""
    p = OpenAIProvider(
        "ollama", ProviderConfig(type="openai_compatible", base_url=OLLAMA, api_key_env=None)
    )
    assert "authorization" not in p.client().headers
    await p.aclose()


async def test_missing_key_says_which_env_var(monkeypatch):
    monkeypatch.delenv("NOPE_KEY", raising=False)
    p = OpenAIProvider(
        "x", ProviderConfig(type="openai_compatible", base_url=OLLAMA, api_key_env="NOPE_KEY")
    )
    with pytest.raises(ProviderError) as exc:
        p.client()
    assert "NOPE_KEY" in str(exc.value)


async def test_connection_failure_is_a_provider_error():
    """No Ollama running: a clean 502 envelope, not a traceback."""
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused")

    with pytest.raises(ProviderError) as exc:
        await ollama_provider(handler).complete(canon_req("ollama", "m"))
    assert "connection refused" in str(exc.value)


async def test_upstream_404_is_a_provider_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": {"message": "model 'nope' not found"}})

    with pytest.raises(ProviderError) as exc:
        await ollama_provider(handler).complete(canon_req("ollama", "nope"))
    assert "not found" in str(exc.value)


async def test_upstream_429_is_rate_limited_in_the_stream():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": {"message": "slow down"}})

    events = [e async for e in ollama_provider(handler).stream(canon_req("ollama", "m"))]
    assert events[-1].type == "error"
    assert events[-1].code == "rate_limited"
    assert events[-1].retryable is True


# ------------------------------------------------------------------ claude-cli


@pytest.fixture
def fake_claude(tmp_path, monkeypatch):
    """A real executable named `claude` on PATH.

    It asserts ANTHROPIC_API_KEY is present-but-EMPTY. That exact distinction is the
    regression documented in claude_cli.child_env — a deleted key gets refilled by
    the child's own load_dotenv(), the CLI then warns that the API key takes
    precedence over the claude.ai login, and exits 1.
    """
    def make(script: str) -> str:
        path = tmp_path / "claude"
        path.write_text(script)
        path.chmod(path.stat().st_mode | stat.S_IEXEC)
        monkeypatch.setenv("PATH", f"{tmp_path}{os.pathsep}{os.environ['PATH']}")
        return str(path)

    return make


SUCCESS_STUB = textwrap.dedent("""\
    #!/usr/bin/env python3
    import json, os, sys
    key = os.environ.get("ANTHROPIC_API_KEY", "__ABSENT__")
    if key != "":
        sys.stderr.write(f"ANTHROPIC_API_KEY must be blank, got {key!r}\\n")
        sys.exit(3)
    sys.stdin.read()
    print(json.dumps({
        "subtype": "success", "is_error": False, "result": "cli said hello",
        "session_id": "sess_1", "total_cost_usd": 0.0123,
        "usage": {"input_tokens": 11, "output_tokens": 4},
    }))
""")

# `claude -p --output-format stream-json --verbose`: one JSON object per line.
STREAM_STUB = textwrap.dedent("""\
    #!/usr/bin/env python3
    import json, sys
    args = sys.argv[1:]
    assert "stream-json" in args and "--verbose" in args, args
    assert args[args.index("--model") + 1] == "haiku", args
    prompt = sys.stdin.read()
    assert prompt.startswith("Be terse."), prompt
    print(json.dumps({"type": "system", "subtype": "init", "session_id": "sess_2"}))
    print(json.dumps({"type": "assistant", "message": {
        "content": [{"type": "text", "text": "proxy "}],
        "usage": {"input_tokens": 9, "output_tokens": 1}}}))
    print(json.dumps({"type": "assistant", "message": {
        "content": [{"type": "text", "text": "ok"}],
        "usage": {"input_tokens": 9, "output_tokens": 2}}}))
    print(json.dumps({"type": "result", "subtype": "success", "result": "proxy ok",
                      "total_cost_usd": 0.002, "session_id": "sess_2"}))
""")


async def test_blanks_the_api_key_rather_than_deleting_it(fake_claude, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-should-not-reach-the-child")
    fake_claude(SUCCESS_STUB)

    provider = ClaudeCliProvider("claudecli", ProviderConfig(type="claudecli"))
    resp = await provider.complete(canon_req("claudecli", "opus"))
    assert resp.text() == "cli said hello"
    assert resp.id == "sess_1"
    assert resp.usage.reported_cost_usd == 0.0123
    assert resp.usage.input_tokens == 11


def test_child_env_blanks_not_removes(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-real")
    env = child_env(ProviderConfig(type="claudecli"))
    assert "ANTHROPIC_API_KEY" in env, "deleting lets the child's load_dotenv() refill it"
    assert env["ANTHROPIC_API_KEY"] == ""


def test_child_env_can_be_left_alone(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-real")
    env = child_env(ProviderConfig(type="claudecli", neutralise_anthropic_key=False))
    assert env["ANTHROPIC_API_KEY"] == "sk-ant-real"


async def test_native_stream_mode_reads_stream_json(fake_claude):
    fake_claude(STREAM_STUB)
    provider = ClaudeCliProvider("claudecli", ProviderConfig(type="claudecli"))
    req = canon_req("claudecli", "haiku", system=[TextBlock(text="Be terse.")])
    events = [e async for e in provider.stream(req)]
    assert [e.type for e in events] == [
        "message_start", "block_start", "text_delta", "text_delta", "block_stop",
        "message_delta", "message_stop",
    ]
    resp = aggregate(events)
    assert resp.text() == "proxy ok"
    assert resp.usage.output_tokens == 2
    assert resp.usage.reported_cost_usd == 0.002


async def test_synthetic_stream_mode_explodes_the_json_envelope(fake_claude):
    fake_claude(SUCCESS_STUB)
    provider = ClaudeCliProvider(
        "claudecli", ProviderConfig(type="claudecli", stream_mode="synthetic")
    )
    events = [e async for e in provider.stream(canon_req("claudecli", "opus"))]
    assert events[0].type == "message_start" and events[-1].type == "message_stop"
    assert aggregate(events).text() == "cli said hello"


async def test_error_exit_is_surfaced(fake_claude):
    fake_claude(textwrap.dedent("""\
        #!/usr/bin/env python3
        import sys
        sys.stdin.read()
        sys.stderr.write("something broke permanently\\n")
        sys.exit(1)
    """))
    provider = ClaudeCliProvider("claudecli", ProviderConfig(type="claudecli"))
    with pytest.raises(ProviderError) as exc:
        await provider.complete(canon_req("claudecli", "opus"))
    assert "something broke permanently" in str(exc.value)


async def test_rate_limit_is_classified_retryable(fake_claude):
    fake_claude(textwrap.dedent("""\
        #!/usr/bin/env python3
        import sys
        sys.stdin.read()
        sys.stderr.write("Error: usage limit reached\\n")
        sys.exit(1)
    """))
    provider = ClaudeCliProvider("claudecli", ProviderConfig(type="claudecli"))
    from llm_proxy.providers import retry

    monkey = retry.BACKOFF_S
    retry.BACKOFF_S = (0,)
    try:
        with pytest.raises(RateLimited):
            await provider.complete(canon_req("claudecli", "opus"))
    finally:
        retry.BACKOFF_S = monkey


async def test_malformed_json_is_a_clear_error(fake_claude):
    fake_claude(textwrap.dedent("""\
        #!/usr/bin/env python3
        import sys
        sys.stdin.read()
        print("not json at all")
    """))
    provider = ClaudeCliProvider("claudecli", ProviderConfig(type="claudecli"))
    with pytest.raises(ProviderError) as exc:
        await provider.complete(canon_req("claudecli", "opus"))
    assert "JSON envelope" in str(exc.value)


async def test_timeout_kills_the_child(fake_claude):
    fake_claude(textwrap.dedent("""\
        #!/usr/bin/env python3
        import sys, time
        sys.stdin.read()
        time.sleep(30)
    """))
    provider = ClaudeCliProvider(
        "claudecli", ProviderConfig(type="claudecli", timeout_s=1)
    )
    with pytest.raises(ProviderTimeout):
        await provider.complete(canon_req("claudecli", "opus"))


async def test_missing_binary_is_a_clear_error(monkeypatch, tmp_path):
    monkeypatch.setenv("PATH", str(tmp_path))
    provider = ClaudeCliProvider("claudecli", ProviderConfig(type="claudecli"))
    with pytest.raises(ProviderError) as exc:
        await provider.complete(canon_req("claudecli", "opus"))
    assert "not found on PATH" in str(exc.value)


def test_flatten_folds_system_into_the_prompt():
    """`claude -p` has no separate system field; it has to go into the body."""
    req = canon_req(
        "claudecli", "opus",
        system=[TextBlock(text="Be terse.")],
        messages=[
            CanonMessage(role="user", content=[TextBlock(text="q1")]),
            CanonMessage(role="assistant", content=[TextBlock(text="a1")]),
            CanonMessage(role="user", content=[TextBlock(text="q2")]),
        ],
    )
    out = flatten(req)
    assert out.startswith("Be terse.")
    assert "User: q1" in out and "Assistant: a1" in out


def test_flatten_single_turn_has_no_role_marker():
    out = flatten(canon_req("claudecli", "opus"))
    assert out == "hello"


async def test_blocking_caller_sees_the_stream_error_status():
    """StreamOnly.complete must not flatten a 429 or a dead upstream into a 500."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"error": {"message": "slow down"}})

    with pytest.raises(RateLimited):
        await ollama_provider(handler).complete(canon_req("ollama", "m"))


# ------------------------------------------------------------ structured output

SCHEMA = {
    "type": "object",
    "properties": {"category": {"type": "string", "enum": ["SPAM", "GENERAL"]}},
    "required": ["category"],
    "additionalProperties": False,
}
JSON_FORMAT = {"type": "json_schema", "schema": SCHEMA}


def test_cli_gets_the_schema_as_json_schema_flag():
    args = cli_args("claude", canon_req("claudecli", "sonnet", response_format=JSON_FORMAT), "json")
    assert json.loads(args[args.index("--json-schema") + 1]) == SCHEMA
    assert "--json-schema" not in cli_args("claude", canon_req("claudecli", "sonnet"), "json")


def test_cli_rejects_a_format_it_cannot_honour():
    with pytest.raises(InvalidRequest):
        cli_args("claude", canon_req("claudecli", "sonnet", response_format={"type": "json_object"}), "json")


def test_cli_answers_with_the_validated_object_not_the_prose():
    provider = ClaudeCliProvider("claudecli", ProviderConfig(type="claudecli"))
    envelope = {
        "subtype": "success",
        "result": "Here you go: {\"category\": \"SPAM\"} hope that helps",
        "structured_output": {"category": "SPAM"},
    }
    resp = provider._envelope_to_response(envelope, canon_req("claudecli", "sonnet", response_format=JSON_FORMAT))
    assert json.loads(resp.text()) == {"category": "SPAM"}


def test_cli_without_structured_output_is_an_error_not_prose():
    provider = ClaudeCliProvider("claudecli", ProviderConfig(type="claudecli"))
    envelope = {"subtype": "success", "result": "SPAM, I think"}
    with pytest.raises(ProviderError, match="structured_output"):
        provider._envelope_to_response(envelope, canon_req("claudecli", "sonnet", response_format=JSON_FORMAT))


async def test_openai_wire_nests_the_schema_the_way_openai_expects():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(json.loads(request.content))
        return httpx.Response(200, json={
            "id": "c1", "model": "qwen3:14b",
            "choices": [{"message": {"role": "assistant", "content": "{}"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
        })

    provider = ollama_provider(handler)
    await provider.complete(canon_req("ollama", "qwen3:14b", response_format=JSON_FORMAT))
    assert seen["response_format"] == {
        "type": "json_schema",
        "json_schema": {"name": "output", "schema": SCHEMA, "strict": True},
    }
