FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# libmagic1, libgl1, libglib2.0-0, libgomp1 — runtime deps for docling / PyTorch CPU
RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/shared   /app/shared
COPY services/pdf-parser /app/pdf-parser

# 1. Install the local shared library first so pip doesn't look for it on PyPI
RUN pip install --no-cache-dir /app/shared

# 2. Install saraldocling from PyPI
RUN pip install --no-cache-dir saraldocling==1.0.1

# 3. Install remaining PyPI deps explicitly
RUN pip install --no-cache-dir \
    google-cloud-storage==2.18.0 \
    asyncpg==0.31.0 \
    redis==5.2.1 \
    httpx==0.28.1 \
    python-dotenv==1.0.1

# 4. Register the package itself without re-resolving deps (all already installed above)
RUN pip install --no-cache-dir --no-deps /app/pdf-parser

WORKDIR /app/pdf-parser
CMD ["python", "worker.py"]
