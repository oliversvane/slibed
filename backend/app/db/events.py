from sqlalchemy.orm import (
    Session,
)
from sqlalchemy import event
from sqlalchemy.orm import with_loader_criteria

from app.db.models import SoftDeleteMixin, ChatSession, ChatMessage


@event.listens_for(Session, "do_orm_execute")
def _add_soft_delete_criteria(execute_state):
    if execute_state.is_select and not execute_state.execution_options.get(
        "include_deleted", False
    ):
        execute_state.statement = execute_state.statement.options(
            with_loader_criteria(
                SoftDeleteMixin,
                lambda cls: cls.deleted_at.is_(None),
                include_aliases=True,
            )
        )


@event.listens_for(Session, "before_flush")
def _convert_deletes_to_soft_delete(session: Session, flush_context, instances):
    for obj in list(session.deleted):
        if isinstance(obj, SoftDeleteMixin):
            obj.soft_delete()
            session.add(obj)
            if isinstance(obj, ChatSession):
                for m in obj.chat_messages:
                    m.soft_delete()
            if isinstance(obj, ChatMessage):
                for c in obj.children:
                    c.soft_delete()
