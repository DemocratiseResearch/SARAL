"""
Workers package for specialized video generation tasks.
"""
from app.workers.pool import get_worker_pool, init_worker_pool, close_worker_pool

__all__ = ['get_worker_pool', 'init_worker_pool', 'close_worker_pool']
