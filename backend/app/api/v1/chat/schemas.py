from typing import List
from uuid import UUID
from pydantic import BaseModel, Field
from pydantic_ai import UserContent


class ChatMessageCreate(BaseModel):
    parts: List[UserContent] = Field(...)
    session_id: UUID = Field(...)
    parent_message_id: UUID = Field(...)


class ChatSessionCreate(BaseModel):
    parts: List[UserContent] = Field(...)
