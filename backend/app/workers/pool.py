"""
Worker pool configuration for all specialized workers.
Each worker handles a specific endpoint with full pipeline execution.
"""
from arq import create_pool
from arq.connections import RedisSettings

REDIS_SETTINGS = RedisSettings(host='localhost', port=6379, database=0)

worker_pool = None


async def init_worker_pool():
    """Initialize the worker pool connection."""
    global worker_pool
    if worker_pool is None:
        worker_pool = await create_pool(REDIS_SETTINGS)
    return worker_pool


async def close_worker_pool():
    """Close the worker pool connection."""
    global worker_pool
    if worker_pool is not None:
        await worker_pool.close()
        worker_pool = None


async def get_worker_pool():
    """Get the worker pool instance, initializing if needed."""
    if worker_pool is None:
        return await init_worker_pool()
    return worker_pool
