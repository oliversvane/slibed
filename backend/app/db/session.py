import os
from dataclasses import dataclass

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, sessionmaker


@dataclass(frozen=True)
class DBSettings:
    user: str
    password: str
    host: str
    port: int
    db_name: str

    @staticmethod
    def from_env() -> "DBSettings":
        db_name = (
            os.getenv("POSTGRES_DB") or os.getenv("DB_NAME") or os.getenv("ENVIRONMENT")
        )
        if not db_name:
            raise RuntimeError(
                "Missing database name env var (POSTGRES_DB/DB_NAME/ENVIRONMENT)."
            )

        try:
            port = int(os.getenv("POSTGRES_PORT", "5432"))
        except ValueError as e:
            raise RuntimeError("POSTGRES_PORT must be an integer") from e

        for key in ("POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_HOST"):
            if not os.getenv(key):
                raise RuntimeError(f"Missing required env var: {key}")

        return DBSettings(
            user=os.environ["POSTGRES_USER"],
            password=os.environ["POSTGRES_PASSWORD"],
            host=os.environ["POSTGRES_HOST"],
            port=port,
            db_name=db_name,
        )

    @property
    def sync_url(self) -> str:
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.db_name}"

    @property
    def async_url(self) -> str:
        return f"postgresql+asyncpg://{self.user}:{self.password}@{self.host}:{self.port}/{self.db_name}"


settings = DBSettings.from_env()

POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "20"))
MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "20"))
POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "30"))

async_engine = create_async_engine(
    settings.async_url,
    echo=False,
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_timeout=POOL_TIMEOUT,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


engine = create_engine(
    settings.sync_url,
    echo=False,
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_timeout=POOL_TIMEOUT,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    class_=Session,
    expire_on_commit=False,
)


def get_sync_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
