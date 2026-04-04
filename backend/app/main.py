# main.py (updated)
from fastapi import FastAPI, BackgroundTasks, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import os
from pathlib import Path
import logging
import uvicorn

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

from app.routes import api_keys, papers, scripts, slides, media, images, auth, papertovideo, youtube_upload, feedback, patents, reels, podcast, external_api, poster, business_brief, webpage
from app.workers import init_worker_pool, close_worker_pool
## Removed: from app.database import create_tables (no longer needed)

# Prometheus monitoring
from prometheus_fastapi_instrumentator import Instrumentator
from app.services.metrics_collector import metrics_collector, update_all_queue_depths

# Create database tables on startup
## Removed: create_tables() (no longer needed)

os.environ["OMP_NUM_THREADS"] = "8"
os.environ["MKL_NUM_THREADS"] = "8"

# Create temp directories
temp_dirs = [
    "temp/arxiv_sources", "temp/images", "temp/title_slides",
    "temp/videos", "temp/audio", "temp/latex_template",
    "temp/slides", "temp/scripts", "temp/webpages"
]

for dir_path in temp_dirs:
    Path(dir_path).mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Saral AI - Academic Paper to Video API",
    description="Convert academic papers to presentation videos with Google OAuth",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    swagger_ui_parameters={"url": "/api/openapi.json"},
    servers=[{"url": "/api", "description": "Production"}]
)

# Enhanced CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://summarizesaral.democratiseresearch.in",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
        "http://localhost:3001",
        "http://34.61.172.31:3000",
        "http://34.47.145.225:3000",
        "https://saral.democratiseresearch.in",
        "https://saralaisummit.democratiseresearch.in",
        "https://saraldemo.democratiseresearch.in"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Session tracking middleware (backward compatible - no frontend changes required)
from app.middleware.session_tracking import SessionTrackingMiddleware
app.add_middleware(SessionTrackingMiddleware)

# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    """Initialize worker pool and metrics collector on application startup."""
    logger.info("Initializing worker pool...")
    await init_worker_pool()
    logger.info("Worker pool initialized successfully")
    
    # Initialize Prometheus metrics collector
    logger.info("Initializing Prometheus metrics collector...")
    metrics_collector.initialize()
    logger.info("Metrics collector initialized successfully")
    
    # Start periodic health check so Prometheus always gets fresh data
    import asyncio
    
    async def periodic_health_check():
        """Update service health gauges and queue depths every 60 seconds."""
        while True:
            try:
                metrics_collector.get_service_health_status()
                update_all_queue_depths()
            except Exception as e:
                logger.error(f"Periodic health check failed: {e}")
            await asyncio.sleep(60)
    
    asyncio.create_task(periodic_health_check())


@app.on_event("shutdown")
async def shutdown_event():
    """Close worker pool on application shutdown."""
    logger.info("Closing worker pool...")
    await close_worker_pool()
    logger.info("Worker pool closed")


from fastapi import Response

@app.middleware("http")
async def path_based_cors_middleware(request: Request, call_next):
    """
    Custom Middleware to allow OPEN CORS for external APIs only.
    Runs BEFORE the strict CORSMiddleware.
    """
    if request.url.path.startswith("/api/external"):
        # Handle Preflight OPTIONS requests manually
        if request.method == "OPTIONS":
            response = Response(status_code=204)
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "*"
            return response
        
        # Handle regular requests
        response = await call_next(request)
        # Force overwrite headers to allow all
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response

    # For all other paths, proceed as normal (Strict CORS might block or pass)
    return await call_next(request)

# Add middleware to log requests
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Request: {request.method} {request.url}")
    
    response = await call_next(request)
    
    logger.info(f"Response: {response.status_code}")
    return response

# Register Performance Middleware
from app.middleware.performance import performance_middleware
app.middleware("http")(performance_middleware)

# Custom exception handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.error(f"HTTP Exception: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "status_code": exc.status_code,
            "path": str(request.url.path)
        },
        headers=exc.headers
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation Error: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Validation Error",
            "errors": exc.errors(),
            "path": str(request.url.path)
        }
    )

# Static files
app.mount("/static", StaticFiles(directory="temp"), name="static")

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(api_keys.router, prefix="/api/keys", tags=["API Keys"])
app.include_router(papers.router, prefix="/api/papers", tags=["Papers"])
app.include_router(scripts.router, prefix="/api/scripts", tags=["Scripts"])
app.include_router(slides.router, prefix="/api/slides", tags=["Slides"])
app.include_router(media.router, prefix="/api/media", tags=["Media"])
app.include_router(images.router, prefix="/api/images", tags=["Images"])
app.include_router(papertovideo.router, prefix="/api/papertovideo", tags=["pdftovideo"])
app.include_router(poster.router, prefix="/api/poster", tags=["poster"])
app.include_router(youtube_upload.router, prefix="/api/youtube_upload", tags=["youtube_upload"])
app.include_router(feedback.router, prefix="/api/feedback", tags=["feedback"])
app.include_router(patents.router, prefix="/api/patents", tags=["patents"])
app.include_router(reels.router, prefix="/api/reels", tags=["reels"])
app.include_router(podcast.router, prefix="/api/podcast", tags=["podcast"])
app.include_router(external_api.router, prefix="/api/external", tags=["External API"])
app.include_router(business_brief.router, prefix="/api/business-brief", tags=["Business Brief"])
app.include_router(webpage.router, prefix="/api/webpage", tags=["Webpage"])

instrumentator = Instrumentator(
    should_group_status_codes=True,
    should_ignore_untemplated=False,
    should_respect_env_var=False,  # Always enable metrics
    should_instrument_requests_inprogress=True,
    excluded_handlers=["/metrics"],
    inprogress_name="http_requests_inprogress",
    inprogress_labels=True,
)
# Custom buckets for the per-handler histogram (http_request_duration_seconds).
# Default is only (0.1, 0.5, 1) which makes any request >1s show as +Inf / no data.
# Extended to cover slow endpoints like generate-video (30-600s), generate-audio (10-60s), etc.
instrumentator.instrument(
    app,
    latency_lowr_buckets=(0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600),
).expose(app, endpoint="/metrics")

# Public endpoints
@app.get("/")
async def root():
    """Public root endpoint"""
    return {
        "message": "Saral AI Academic Paper to Video API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health")
async def health_check():
    """Public health check endpoint"""
    return {"status": "healthy", "api_version": "1.0.0"}

@app.get("/health/services")
async def health_services_check():
    """Detailed health check for all services"""
    try:
        # Update queue depths before returning health
        update_all_queue_depths()
        
        # Get service health status
        services_status = metrics_collector.get_service_health_status()
        
        # Determine overall health
        all_healthy = all(
            service_info.get('healthy', False) 
            for service_info in services_status.values()
        )
        
        return {
            "status": "healthy" if all_healthy else "degraded",
            "timestamp": __import__('datetime').datetime.now().isoformat(),
            "services": services_status
        }
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return {
            "status": "error",
            "timestamp": __import__('datetime').datetime.now().isoformat(),
            "error": str(e)
        }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="debug")
