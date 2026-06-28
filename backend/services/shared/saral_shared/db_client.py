import asyncpg
import os


_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:

    global _pool
    if _pool is None:
        dsn = os.environ["DATABASE_URL"]
        _pool = await asyncpg.create_pool(
            dsn,
            min_size=1,
            max_size=5,
            command_timeout=30,
        )
    return _pool


async def start_step(pool: asyncpg.Pool, run_id: str, step_name: str) -> str:
    async with pool.acquire() as conn:
        step_id = await conn.fetchval(
            """
            UPDATE pipeline_steps
            SET status = 'processing', started_at = NOW()
            WHERE run_id = $1::uuid
              AND step_name = $2::step_name_enum
              AND status = 'pending'
            RETURNING id::text
            """,
            run_id,
            step_name,
        )
    return step_id


async def complete_step(pool: asyncpg.Pool, step_id: str, gcs_output_path: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE pipeline_steps
            SET status = 'completed',
                gcs_output_path = $1,
                completed_at = NOW()
            WHERE id = $2::uuid
            """,
            gcs_output_path,
            step_id,
        )


async def fail_step(pool: asyncpg.Pool, step_id: str, error_message: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE pipeline_steps
            SET status = 'failed',
                error_message = $1,
                completed_at = NOW()
            WHERE id = $2::uuid
            """,
            error_message,
            step_id,
        )


async def insert_artifact(
    pool: asyncpg.Pool,
    run_id: str,
    artifact_type: str,
    gcs_path: str,
    size_bytes: int = 0,
) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO artifacts (run_id, artifact_type, gcs_path, size_bytes)
            VALUES ($1::uuid, $2, $3, $4)
            """,
            run_id,
            artifact_type,
            gcs_path,
            size_bytes,
        )
