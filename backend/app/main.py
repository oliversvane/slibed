import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import router

app = FastAPI(redirect_slashes=False)
app.add_middleware(
    CORSMiddleware,  # type: ignore[arg-type]
    allow_origins=os.getenv("ALLOWED_CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def custom_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": str(exc)},
    )


app.include_router(router, prefix="/api")


# Middleware for authentification
