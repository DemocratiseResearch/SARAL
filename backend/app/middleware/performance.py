import time
import os
import psutil
from fastapi import Request
import logging
from app.utils.context import set_execution_context

# Get environment from ENV variable
ENV = os.getenv("ENV", "production").lower()
ENABLE_PERFORMANCE_LOGGING = ENV == "development"

# Configure logger
logger = logging.getLogger("performance")

if ENABLE_PERFORMANCE_LOGGING:
    logger.setLevel(logging.INFO)
    
    if not logger.handlers:
        # Use absolute path for log file
        files_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        log_path = os.path.join(files_dir, "performance.log")
        
        # File Handler
        handler = logging.FileHandler(log_path)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        
        # Console Handler
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)
        
        logger.info(f"Performance logging enabled (ENV={ENV})")
else:
    # Disable logging in production
    logger.setLevel(logging.CRITICAL)
    logger.addHandler(logging.NullHandler())

process = psutil.Process(os.getpid())
NUM_CPUS = psutil.cpu_count()

async def performance_middleware(request: Request, call_next):
    # Set Execution Context (Endpoint Name)
    context_name = f"{request.method} {request.url.path}"
    set_execution_context(context_name)
    request.state.execution_context = context_name

    start_time = time.perf_counter()
    
    # Get CPU times at start
    cpu_times_start = process.cpu_times()
    
    # Process request
    response = await call_next(request)
    
    # Calculate duration
    process_time = time.perf_counter() - start_time
    
    # Get CPU times at end and calculate percentage
    cpu_times_end = process.cpu_times()
    cpu_time_used = (cpu_times_end.user - cpu_times_start.user) + (cpu_times_end.system - cpu_times_start.system)
    
    # Normalize by number of CPUs to get percentage relative to single core
    cpu_percent = (cpu_time_used / process_time * 100) if process_time > 0 else 0
    # Cap at 100% per core (can exceed 100% on multi-core, but we'll show normalized)
    cpu_percent_normalized = min(cpu_percent / NUM_CPUS, 100.0) if NUM_CPUS > 0 else cpu_percent
    
    # Log duration and CPU with Context (only in development)
    if ENABLE_PERFORMANCE_LOGGING:
        logger.info(f"ENDPOINT_PERF: [{context_name}] - {process_time:.4f}s - CPU: {cpu_percent_normalized:.1f}% (cores: {NUM_CPUS})")
    
    # Add header to response
    response.headers["X-Process-Time"] = str(process_time)
    
    return response