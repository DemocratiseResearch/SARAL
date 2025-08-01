# main.py (updated)
from fastapi import FastAPI, BackgroundTasks, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import os
from pathlib import Path
import logging
from app.routes import feedback
from motor.motor_asyncio import AsyncIOMotorClient
from contextlib import asynccontextmanager
from beanie import init_beanie
from app.models.db_models import Feedback

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app.routes import api_keys, papers, scripts, slides, media, images, auth
from app.auth.google_auth import get_current_user, get_current_user_optional

# Create temp directories
temp_dirs = [
    "temp/arxiv_sources", "temp/images", "temp/title_slides",
    "temp/videos", "temp/audio", "temp/latex_template",
    "temp/slides", "temp/scripts"
]
    
@asynccontextmanager
async def lifespan(app: FastAPI):
    MONGODB_URI = os.getenv("MONGODB_URI")
    client = AsyncIOMotorClient(MONGODB_URI)
    await init_beanie(
        database=client.get_default_database(),
        document_models=[Feedback])
    yield  # Run the app
    
for dir_path in temp_dirs:
    Path(dir_path).mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Saral AI - Academic Paper to Video API",
    description="Convert academic papers to presentation videos with Google OAuth",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Enhanced CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://saral.democratiseresearch.in",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
        "http://localhost:3001",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Add middleware to log requests
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Request: {request.method} {request.url}")
    logger.info(f"Headers: {dict(request.headers)}")
    
    response = await call_next(request)
    
    logger.info(f"Response: {response.status_code}")
    return response

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
app.include_router(feedback.router, prefix="/api/feedback", tags=["Feedback"])


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

# Protected endpoints example
@app.get("/api/user/profile")
async def get_user_profile(current_user: dict = Depends(get_current_user)):
    """Protected endpoint requiring authentication"""
    return {"user": current_user}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
