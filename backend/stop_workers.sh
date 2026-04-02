#!/bin/bash

# SARAL Worker Stop Script
# This script stops all running workers

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Stopping SARAL Workers...${NC}"

# Get the backend directory
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BACKEND_DIR"

# Function to stop a worker
stop_worker() {
    local worker_name=$1
    local pid_file=$2
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p "$pid" > /dev/null 2>&1; then
            echo -e "${YELLOW}Stopping ${worker_name} (PID: ${pid})...${NC}"
            kill "$pid"
            # Wait for process to stop
            for i in {1..10}; do
                if ! ps -p "$pid" > /dev/null 2>&1; then
                    echo -e "${GREEN}✓ ${worker_name} stopped${NC}"
                    rm "$pid_file"
                    return
                fi
                sleep 0.5
            done
            # Force kill if still running
            if ps -p "$pid" > /dev/null 2>&1; then
                echo -e "${RED}Force killing ${worker_name}...${NC}"
                kill -9 "$pid"
                rm "$pid_file"
            fi
        else
            echo -e "${YELLOW}${worker_name} is not running${NC}"
            rm "$pid_file"
        fi
    else
        echo -e "${YELLOW}No PID file found for ${worker_name}${NC}"
    fi
}

# Stop workers by PID file first
if [ -d "logs" ]; then
    stop_worker "PDF Processor Worker" "logs/pdf_processor.log.pid"
    stop_worker "PDF to Video Worker" "logs/pdf_worker.log.pid"
    stop_worker "arXiv to Video Worker" "logs/arxiv_worker.log.pid"
    stop_worker "LaTeX to Video Worker" "logs/latex_worker.log.pid"
    stop_worker "Video Generation Worker" "logs/video_worker.log.pid"
    stop_worker "Poster Generation Worker" "logs/poster_worker.log.pid"
    stop_worker "Audio Generation Worker" "logs/audio_worker.log.pid"
fi

# Kill any remaining worker processes by name (in case of orphaned processes)
echo ""
echo -e "${YELLOW}Checking for any remaining worker processes...${NC}"

worker_modules=(
    "app.workers.pdf_processor_worker"
    "app.workers.pdf_to_video_worker"
    "app.workers.arxiv_to_video_worker"
    "app.workers.latex_to_video_worker"
    "app.workers.video_generation_worker"
    "app.workers.saral_audio_worker"
)

for module in "${worker_modules[@]}"; do
    remaining_pids=$(pgrep -f "$module" 2>/dev/null || true)
    if [ -n "$remaining_pids" ]; then
        echo -e "${YELLOW}Found orphaned processes for ${module}: ${remaining_pids}${NC}"
        pkill -f "$module" 2>/dev/null || true
        sleep 0.5
        echo -e "${GREEN}✓ Cleaned up orphaned processes${NC}"
    fi
done

echo ""
echo -e "${GREEN}All workers stopped${NC}"
