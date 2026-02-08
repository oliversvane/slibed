from fastapi import APIRouter

from .routes import router as _router

router = APIRouter()

router.include_router(_router)


__all__ = ["router"]
