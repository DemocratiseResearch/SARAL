FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/shared /app/shared
COPY services/ffmpeg-job /app/ffmpeg-job

# 1. Install local shared library so pip doesn't search PyPI for saral-shared
RUN pip install --no-cache-dir /app/shared

# 2. Install all PyPI deps explicitly (matches pyproject.toml dependencies)
RUN pip install --no-cache-dir \
    google-cloud-storage==2.18.0 \
    redis==5.2.1 \
    httpx==0.28.1 \
    python-dotenv==1.0.1 \
    Pillow==11.2.1 \
    playwright==1.49.1

# 2b. Install the Chromium browser Playwright drives (for faithful lottie-web
#     rendering of the decorative reel accent) plus its system dependencies.
RUN playwright install --with-deps chromium

# 3. Register the package without re-resolving deps
RUN pip install --no-cache-dir --no-deps /app/ffmpeg-job

WORKDIR /app/ffmpeg-job
CMD ["python", "job.py"]
