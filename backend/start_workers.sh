#!/bin/bash

# SARAL Worker Quick Start Script
# This script starts all workers in the background for development/testing

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting SARAL Workers...${NC}"

# Check if Redis is running
if ! redis-cli ping &> /dev/null; then
    echo -e "${RED}Error: Redis is not running. Please start Redis first.${NC}"
    echo "Try: redis-server &"
    exit 1
fi

echo -e "${GREEN}✓ Redis is running${NC}"

# Get the backend directory
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BACKEND_DIR"

# Create logs directory
mkdir -p logs

# Function to start a worker
start_worker() {
    local worker_name=$1
    local worker_module=$2
    local log_file=$3
    
    echo -e "${YELLOW}Starting ${worker_name}...${NC}"
    python -m "$worker_module" > "logs/${log_file}" 2>&1 &
    local pid=$!
    echo "$pid" > "logs/${log_file}.pid"
    echo -e "${GREEN}✓ ${worker_name} started (PID: ${pid})${NC}"
}

# Start workers
start_worker "PDF Processor Worker" "app.workers.pdf_processor_worker" "pdf_processor.log"
start_worker "PDF to Video Worker" "app.workers.pdf_to_video_worker" "pdf_worker.log"
start_worker "arXiv to Video Worker" "app.workers.arxiv_to_video_worker" "arxiv_worker.log"
start_worker "LaTeX to Video Worker" "app.workers.latex_to_video_worker" "latex_worker.log"
start_worker "Video Generation Worker" "app.workers.video_generation_worker" "video_worker.log"
start_worker "Poster Generation Worker" "app.workers.poster_worker" "poster_worker.log"
start_worker "Audio Generation Worker" "app.workers.saral_audio_worker" "audio_worker.log"

echo ""
echo -e "${GREEN}All workers started successfully!${NC}"
echo ""
echo "To view logs:"
echo "  tail -f logs/pdf_processor.log"
echo "  tail -f logs/pdf_worker.log"
echo "  tail -f logs/arxiv_worker.log"
echo "  tail -f logs/latex_worker.log"
echo "  tail -f logs/video_worker.log"
echo "  tail -f logs/poster_worker.log"
echo "  tail -f logs/audio_worker.log"
echo ""
echo "To stop all workers:"
echo "  ./stop_workers.sh"
echo ""
