# SARAL: Simplified And Automated Research Amplification and Learning

SARAL AI is a full-stack application that automates the process of converting research papers (LaTeX or arXiv) into engaging educational videos. The system leverages AI for script generation, slide creation, audio narration, and video synthesis, providing a seamless workflow from paper upload to downloadable media.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tutorial](#tutorial)
- [System Requirements](#system-requirements)
- [Project Structure](#project-structure)
- [Installation](#installation)
  - [macOS Setup](#macos-setup)
  - [Ubuntu Setup](#ubuntu-setup)
  - [Windows Setup](#windows-setup)
- [Configuration](#configuration)
- [Running the Application](#running-the-application)
- [Workflow Guide](#workflow-guide)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [API Overview](#api-overview)
- [Customization](#customization)
- [License](#license)
- [Acknowledgements](#acknowledgements)

---

## Overview

SARAL AI transforms research papers into professional educational videos through a structured workflow:

1. **API Keys Setup:** Configure required API keys for AI and TTS services.
2. **Paper Upload:** Submit papers via arXiv links or direct LaTeX uploads.
3. **Script Generation:** Convert paper content into narration scripts using AI.
4. **Slides Generation:** Create presentation slides with bullet points and images.
5. **Video Production:** Generate the final video with narration and visuals.

---

## Features

- **Multiple Input Methods:** Upload LaTeX ZIPs or import from arXiv.
- **AI-Generated Scripts:** Uses Google Gemini API for educational narration.
- **Interactive Editor:** Edit title, section scripts, and bullet points.
- **Image Selection:** Assign extracted figures to slides.
- **Multilingual Support:** Generate videos in English or Hindi (with Hinglish technical terms).
- **Professional Output:** Download videos, LaTeX sources, and PDF slides.
- **Modern UI:** Responsive React frontend with dark mode.

---

## Tutorial

For a comprehensive step-by-step guide on using SARAL AI, please refer to our detailed tutorial document:

📖 **[Download Tutorial PDF](tutorial.pdf)**

The tutorial covers:
- Complete setup and installation process
- Detailed workflow walkthrough with screenshots
- Best practices for optimal results
- Advanced configuration options

---

## System Requirements

### Backend

- Python 3.9+
- pdflatex/texlive
- poppler-utils
- FFmpeg
- 4GB+ RAM
- 2GB+ disk space

### Frontend

- Node.js 16+
- npm 8+ or yarn 1.22+
- Modern web browser

---

## Project Structure

```
.
├── .gitignore
├── LICENSE
├── README.md
├── backend/
│   ├── .env
│   ├── .python-version
│   ├── requirements.txt
│   ├── firebase_service_account.json
│   ├── app/
│   │   ├── main.py
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   └── temp/
│       ├── arxiv_sources/
│       ├── audio/
│       ├── images/
│       ├── latex/
│       ├── latex_template/
│       ├── papers/
│       ├── scripts/
│       ├── slides/
│       ├── title_slides/
│       └── videos/
└── frontend/
    ├── package.json
    ├── README.md
    ├── tailwind.config.js
    ├── public/
    │   ├── favicon.ico
    │   ├── index.html
    │   ├── logo192.png
    │   ├── logo512.png
    │   ├── manifest.json
    │   └── robots.txt
    └── src/
        ├── App.css
        ├── App.js
        ├── App.test.js
        ├── index.css
        ├── index.js
        └── ...
```

---

## Installation

### macOS Setup

#### Backend

```sh
# Install Homebrew if not installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install python@3.9 poppler ffmpeg texlive

# Clone the repository
git clone https://github.com/DemocratiseResearch/saral.git
cd saral/backend

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

#### Frontend

```sh
cd ../frontend
npm install
# or
yarn install
```

---

### Ubuntu Setup

#### Backend

```sh
sudo apt update
sudo apt install -y python3.9 python3.9-venv python3-pip poppler-utils ffmpeg texlive-full

git clone https://github.com/DemocratiseResearch/saral.git
cd saral/backend

python3.9 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt
```

#### Frontend

```sh
cd ../frontend
npm install
# or
yarn install
```

---

### Windows Setup

#### Backend

1. Install Python 3.9+ from [python.org](https://www.python.org/downloads/windows/) (add to PATH).
2. Install [MiKTeX](https://miktex.org/download), [Poppler for Windows](https://github.com/oschwartz10612/poppler-windows/releases/), and [FFmpeg](https://www.gyan.dev/ffmpeg/builds/) (add to PATH).
3. Clone the repository and set up the environment:

```sh
git clone https://github.com/DemocratiseResearch/saral.git
cd saral\backend

python -m venv .venv
.venv\Scripts\activate

pip install -r requirements.txt
```

#### Frontend

```sh
cd ..\frontend
npm install
# or
yarn install
```

---

## Configuration

### API Keys

Create a `.env` file in the `backend/` directory:
Add your Firebase service account JSON to backend/firebase_service_account.json

```
GOOGLE_API_KEY=your_gemini_api_key
SARVAM_API_KEY=your_sarvam_api_key
FIREBASE_SERVICE_ACCOUNT=./firebase_service_account.json
```

- **Google Gemini API Key:** [Google AI Studio](https://makersuite.google.com/)
- **Sarvam TTS API Key (optional):** [Sarvam AI](https://sarvam.ai/)
- **Firebase service account :** [Firebase Console](https://console.firebase.google.com/)

You can also provide these keys via the web interface at runtime.

---

## Running the Application

### Backend

```sh
cd backend
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API available at [http://localhost:8000](http://localhost:8000).

### Frontend

```sh
cd frontend
npm start
# or
yarn start
```

App available at [http://localhost:3000](http://localhost:3000).

---

## Workflow Guide

1. **API Keys Setup:** Enter your Google Gemini API key (required) and Sarvam TTS API key (optional).
2. **Paper Upload:** Enter an arXiv URL or upload a LaTeX ZIP.
3. **Script Generation:** Generate and edit narration scripts for each section.
4. **Slides Generation:** Assign images to slides and review bullet points.
5. **Video Generation:** Generate audio narration, synthesize the video, and download results.

---

## Troubleshooting

### Backend

- **PDF Conversion Errors:** Ensure `poppler-utils` and LaTeX (`pdflatex`) are installed and in PATH.
- **FFmpeg Errors:** Ensure FFmpeg is installed and in PATH.
- **API Key Errors:** Double-check `.env` formatting and key validity.

### Frontend

- **Connection Errors:** Ensure backend is running and accessible at the configured API URL.
- **Image Loading Issues:** Clear browser cache and check for CORS errors.

For further help, open an issue on [GitHub](https://github.com/DemocratiseResearch/saral/issues).

---

## Development

- **Frontend:** React, Tailwind CSS, React Icons.
- **Backend:** FastAPI, modular services for script generation, media processing, and file management.
- **Styling:** Tailwind CSS with dark mode.
- **Testing:** Use `npm test` (frontend) and your preferred Python test framework (backend).

---

## API Overview

API endpoints are defined in [backend/app/routes/](backend/app/routes/):

- `/papers`: Paper upload and management
- `/scripts`: Script generation and editing
- `/slides`: Slide creation and download
- `/media`: Audio and video generation
- `/images`: Image management

See [http://localhost:8000/docs](http://localhost:8000/docs) for interactive API documentation.

---

## Customization

- **AI Providers:** Configure API keys in `backend/.env`.
- **TTS Voices:** Edit `frontend/src/utils/constants.js` to add or modify TTS voice options.
- **Styling:** Customize Tailwind in `frontend/tailwind.config.js` and CSS in `frontend/src/index.css`.

---

## Acknowledgements

- [Create React App](https://github.com/facebook/create-react-app)
- [FastAPI](https://fastapi.tiangolo.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [OpenAI](https://openai.com/)
- [Google Cloud](https://cloud.google.com/)
