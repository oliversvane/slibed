import uuid
from typing import Optional

from sqlalchemy import (
    JSON,
    UUID,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
    text,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    declared_attr,
    mapped_column,
    relationship,
)


from datetime import datetime, timezone


def gen_uuid():
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


# --- Mixins ---
class UUIDMixin:
    @declared_attr
    def uuid(cls) -> Mapped[uuid.UUID]:
        return mapped_column(
            UUID(as_uuid=True),
            nullable=False,
            unique=True,
            index=True,
            server_default=text("gen_random_uuid()"),
        )


class SoftDeleteMixin:
    @declared_attr
    def created_at(cls):
        return mapped_column(DateTime(timezone=True), server_default=func.now())

    @declared_attr
    def updated_at(cls):
        return mapped_column(
            DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
        )

    @declared_attr
    def deleted_at(cls):
        return mapped_column(DateTime(timezone=True), nullable=True)

    def soft_delete(self):
        self.deleted_at = datetime.now(timezone.utc)

    def restore(self):
        self.deleted_at = None

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None


# --- Core Models ---
class ChatSession(UUIDMixin, SoftDeleteMixin, Base):
    __tablename__ = "chat_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[Optional[str]] = mapped_column(
        String, nullable=True, default="New chat"
    )

    chat_messages = relationship(
        "ChatMessage",
        back_populates="chat_session",
        lazy="selectin",
    )


class ChatMessage(UUIDMixin, SoftDeleteMixin, Base):
    __tablename__ = "chat_messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    session_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("chat_sessions.id"),
        nullable=False,
    )

    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("chat_messages.id"),
        nullable=True,
    )

    role: Mapped[str] = mapped_column(String, nullable=False)
    hidden: Mapped[Optional[bool]] = mapped_column(Boolean)
    parts: Mapped[Optional[dict]] = mapped_column(JSON)

    chat_session = relationship(
        "ChatSession", back_populates="chat_messages", lazy="selectin"
    )

    parent = relationship("ChatMessage", remote_side=[id], back_populates="children")

    children = relationship("ChatMessage", back_populates="parent")
