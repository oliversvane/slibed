import json
import uuid
from typing import AsyncIterator

from fastapi.responses import StreamingResponse
from pydantic_ai import Agent

from app.api.v1.chat.schemas import ChatSessionCreate


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _create_session(req: ChatSessionCreate) -> StreamingResponse:
    agent = Agent("openai:gpt-5.2")

    async def event_generator() -> AsyncIterator[str]:
        session_id = str(uuid.uuid4())

        yield sse(
            event="init",
            data={
                "session_id": session_id,
            },
        )
        async with agent.run_stream(req.parts) as result:
            async for delta in result.stream_text(delta=True):
                yield sse(
                    event="delta",
                    data={
                        "session_id": session_id,
                        "text": delta,
                    },
                )

            final = await result.get_output()
            yield sse(
                event="done",
                data={
                    "session_id": session_id,
                    "text": final,
                },
            )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
