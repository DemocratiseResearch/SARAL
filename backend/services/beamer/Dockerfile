FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    poppler-utils \
    fontconfig \
    texlive-xetex \
    texlive-fonts-recommended \
    texlive-latex-extra \
    lmodern \
    fonts-lmodern \
    fonts-noto \
    fonts-noto-extra \
    libreoffice \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/shared /app/shared
COPY services/beamer /app/beamer
COPY services/audio-gen/models.json /app/beamer/models.json

# 1. Install local shared library so pip doesn't search PyPI for saral-shared
RUN pip install --no-cache-dir /app/shared

# 2. Install all PyPI deps explicitly (matches pyproject.toml dependencies)
RUN pip install --no-cache-dir \
    google-cloud-storage==2.18.0 \
    redis==5.2.1 \
    httpx==0.28.1 \
    python-dotenv==1.0.1 \
    pdf2image==1.17.0 \
    "pillow>=10.0.0" \
    "python-pptx>=1.0.0" \
    "google-generativeai>=0.8.5" \
    "google-genai>=1.0.0" \
    "reportlab>=4.0.0"

# 3. Register the package without re-resolving deps
RUN pip install --no-cache-dir --no-deps /app/beamer

WORKDIR /app/beamer
CMD ["sh", "-c", "python worker.py & python poster_worker.py & wait"]
