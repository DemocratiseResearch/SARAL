import time
import functools
import logging
import psutil
import os
import asyncio
from app.utils.context import get_execution_context

# Get environment from ENV variable
ENV = os.getenv("ENV", "production").lower()
ENABLE_PERFORMANCE_LOGGING = ENV == "development"

# Create/Get performance logger
logger = logging.getLogger("performance")

if ENABLE_PERFORMANCE_LOGGING:
    logger.setLevel(logging.INFO)
    
    if not logger.handlers:
        # Use absolute path for log file to ensure workers can find it
        files_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        log_path = os.path.join(files_dir, "performance.log")
        
        # File Handler
        file_handler = logging.FileHandler(log_path)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
        
        # Console Handler (to see logs in worker terminal)
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        logger.info(f"Performance logging initialized. Writing to: {log_path} (ENV={ENV})")
else:
    # Disable logging in production
    logger.setLevel(logging.CRITICAL)
    logger.addHandler(logging.NullHandler())

process = psutil.Process(os.getpid())
NUM_CPUS = psutil.cpu_count()

def track_performance(func):
    """
    Decorator to track execution time and CPU usage of a function.
    Supports both async and sync functions.
    Works in both API server and worker processes.
    """
    @functools.wraps(func)
    async def async_wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        
        # Get CPU times at start
        cpu_times_start = process.cpu_times()
        
        try:
            result = await func(*args, **kwargs)
            return result
        finally:
            end_time = time.perf_counter()
            duration = end_time - start_time
            
            # Calculate actual CPU usage during function execution
            cpu_times_end = process.cpu_times()
            cpu_time_used = (cpu_times_end.user - cpu_times_start.user) + (cpu_times_end.system - cpu_times_start.system)
            cpu_percent = (cpu_time_used / duration * 100) if duration > 0 else 0
            # Normalize by number of CPUs
            cpu_percent_normalized = min(cpu_percent / NUM_CPUS, 100.0) if NUM_CPUS > 0 else cpu_percent
            
            # Extract paper_id if present in args/kwargs for better context
            # FIXED: Only look for actual UUIDs (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
            paper_id = kwargs.get('paper_id')
            if not paper_id and args:
                for arg in args:
                    if isinstance(arg, str) and len(arg) == 36 and arg.count('-') == 4:
                        # Looks like a UUID
                        paper_id = arg
                        break
            
            context = f" | PaperID: {paper_id[:8]}..." if paper_id else ""
            exec_ctx = get_execution_context()
            
            # Only log in development mode
            if ENABLE_PERFORMANCE_LOGGING:
                # Detect if running in worker
                process_type = "WORKER" if "arq" in str(process.cmdline()) else "API"
                logger.info(f"{process_type}_PERF: [{exec_ctx}] {func.__name__}{context} - Time: {duration:.4f}s - CPU: {cpu_percent_normalized:.1f}%")
    
    @functools.wraps(func)
    def sync_wrapper(*args, **kwargs):
        start_time = time.perf_counter()
        
        # Get CPU times at start
        cpu_times_start = process.cpu_times()
        
        try:
            result = func(*args, **kwargs)
            return result
        finally:
            end_time = time.perf_counter()
            duration = end_time - start_time
            
            # Calculate actual CPU usage during function execution
            cpu_times_end = process.cpu_times()
            cpu_time_used = (cpu_times_end.user - cpu_times_start.user) + (cpu_times_end.system - cpu_times_start.system)
            cpu_percent = (cpu_time_used / duration * 100) if duration > 0 else 0
            # Normalize by number of CPUs
            cpu_percent_normalized = min(cpu_percent / NUM_CPUS, 100.0) if NUM_CPUS > 0 else cpu_percent
            
            # Extract paper_id if present in args/kwargs for better context
            # FIXED: Only look for actual UUIDs
            paper_id = kwargs.get('paper_id')
            if not paper_id and args:
                for arg in args:
                    if isinstance(arg, str) and len(arg) == 36 and arg.count('-') == 4:
                        # Looks like a UUID
                        paper_id = arg
                        break
            
            context = f" | PaperID: {paper_id[:8]}..." if paper_id else ""
            exec_ctx = get_execution_context()
            
            # Only log in development mode
            if ENABLE_PERFORMANCE_LOGGING:
                # Detect if running in worker
                process_type = "WORKER" if "arq" in str(process.cmdline()) else "API"
                logger.info(f"{process_type}_PERF: [{exec_ctx}] {func.__name__}{context} - Time: {duration:.4f}s - CPU: {cpu_percent_normalized:.1f}%")
    
    # Return appropriate wrapper based on function type
    if asyncio.iscoroutinefunction(func):
        return async_wrapper
    else:
        return sync_wrapper


def track_worker_job(func):
    """
    Special decorator for ARQ worker tasks to track the entire job execution.
    Use this on the main worker task function.
    """
    @functools.wraps(func)
    async def wrapper(ctx, *args, **kwargs):
        # Extract paper_id from args
        paper_id = args[1] if len(args) > 1 else "unknown"
        
        start_time = time.perf_counter()
        cpu_times_start = process.cpu_times()
        
        if ENABLE_PERFORMANCE_LOGGING:
            logger.info(f"WORKER_JOB_START: Paper {paper_id[:8]}... - Starting background processing")
        
        try:
            result = await func(ctx, *args, **kwargs)
            
            # Calculate metrics
            duration = time.perf_counter() - start_time
            cpu_times_end = process.cpu_times()
            cpu_time_used = (cpu_times_end.user - cpu_times_start.user) + (cpu_times_end.system - cpu_times_start.system)
            cpu_percent = (cpu_time_used / duration * 100) if duration > 0 else 0
            cpu_percent_normalized = min(cpu_percent / NUM_CPUS, 100.0) if NUM_CPUS > 0 else cpu_percent
            
            if ENABLE_PERFORMANCE_LOGGING:
                logger.info(f"WORKER_JOB_COMPLETE: Paper {paper_id[:8]}... - Total: {duration:.4f}s - CPU: {cpu_percent_normalized:.1f}%")
            
            return result
            
        except Exception as e:
            duration = time.perf_counter() - start_time
            if ENABLE_PERFORMANCE_LOGGING:
                logger.error(f"WORKER_JOB_FAILED: Paper {paper_id[:8]}... - Failed after {duration:.4f}s - Error: {str(e)}")
            raise
    
    return wrapper