"""POST /v1/messages — the Anthropic Messages API surface."""

from __future__ import annotations

from typing import AsyncIterator

from fastapi import APIRouter, Request

from .. import attribution
from ..wire import anthropic_in, anthropic_out, sse
from .common import json_response, pipeline, read_json, sse_response

router = APIRouter()


@router.post("/v1/messages")
async def messages(request: Request):
    body = await read_json(request)
    req = anthropic_in.parse(body)
    req.project = attribution.resolve(
        request.headers, metadata_user=(body.get("metadata") or {}).get("user_id")
    )

    pipe = pipeline(request)

    if not req.stream:
        resp = await pipe.complete(req)
        return json_response(anthropic_out.render(resp), req, resp)

    # Bound before the body starts so the headers can name the resolved provider.
    pipe.prepare(req)

    async def frames() -> AsyncIterator[str]:
        async for event in pipe.stream(req):
            for name, data in anthropic_out.event_frames(event, req.request_id, req.model_id):
                # Anthropic SSE names every frame; an unnamed one is ignored by the SDK.
                yield sse.frame(data, event=name)

    return sse_response(frames, req)
