from uuid import UUID
from fastapi import (
    APIRouter,
    Body,
    status,
)
from fastapi.responses import StreamingResponse

from app.api.v1.chat.schemas import ChatSessionCreate
from app.api.v1.chat.functions import _create_session

router = APIRouter(tags=["chat"])


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: ChatSessionCreate = Body(...),
) -> StreamingResponse:
    return await _create_session(payload)


@router.delete("/{uuid}", status_code=status.HTTP_202_ACCEPTED)
async def delete_session(
    uuid: UUID,
):
    pass
