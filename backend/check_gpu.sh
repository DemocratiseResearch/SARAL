#!/bin/bash

# GPU Memory Cleanup Script
# Use this to free up GPU memory when workers are using too much

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}==================================================${NC}"
echo -e "${BLUE}       GPU Memory Cleanup Script${NC}"
echo -e "${BLUE}==================================================${NC}"
echo ""

# Check if NVIDIA GPU is available
if ! command -v nvidia-smi &> /dev/null; then
    echo -e "${RED}Error: nvidia-smi not found. No NVIDIA GPU detected.${NC}"
    exit 1
fi

# Show current GPU memory usage
echo -e "${YELLOW}Current GPU Status:${NC}"
nvidia-smi --query-gpu=index,name,memory.used,memory.total,utilization.gpu --format=csv
echo ""

# Get GPU memory usage percentage
GPU_MEM_USED=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
GPU_MEM_TOTAL=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits)
GPU_MEM_PERCENT=$((GPU_MEM_USED * 100 / GPU_MEM_TOTAL))

echo -e "${YELLOW}GPU Memory Usage: ${GPU_MEM_USED}MB / ${GPU_MEM_TOTAL}MB (${GPU_MEM_PERCENT}%)${NC}"
echo ""

# Ask for confirmation
read -p "Do you want to clean GPU memory? This will restart worker services. (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}Cancelled.${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}Starting GPU memory cleanup...${NC}"
echo ""

# Step 1: Stop all worker services
echo -e "${YELLOW}[1/5] Stopping all ARQ worker services...${NC}"
sudo systemctl stop 'saral-*worker*' 2>/dev/null || true
sudo systemctl stop 'saral-pdf-processor@*' 2>/dev/null || true
sudo systemctl stop 'saral-poster-worker' 2>/dev/null || true
echo -e "${GREEN}✓ Workers stopped${NC}"
sleep 2
echo ""

# Step 2: Kill any remaining Python processes using GPU
echo -e "${YELLOW}[2/5] Killing Python processes using GPU...${NC}"

# Find all Python processes
GPU_PIDS=$(nvidia-smi --query-compute-apps=pid --format=csv,noheader 2>/dev/null || true)

if [ -n "$GPU_PIDS" ]; then
    echo "Found GPU processes: $GPU_PIDS"
    for PID in $GPU_PIDS; do
        PROCESS_NAME=$(ps -p $PID -o comm= 2>/dev/null || echo "unknown")
        echo "  Killing PID $PID ($PROCESS_NAME)..."
        sudo kill -9 $PID 2>/dev/null || true
    done
    echo -e "${GREEN}✓ GPU processes killed${NC}"
else
    echo -e "${GREEN}✓ No GPU processes found${NC}"
fi
sleep 1
echo ""

# Step 3: Clear GPU memory using Python
echo -e "${YELLOW}[3/5] Clearing GPU cache via Python...${NC}"

# Create a temporary Python script to clear GPU memory
python3 << 'PYTHON_SCRIPT'
import gc
import sys

try:
    import torch
    
    # Clear CUDA cache
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.synchronize()
        
        # Force garbage collection
        gc.collect()
        
        print("✓ PyTorch CUDA cache cleared")
        
        # Show memory stats
        for i in range(torch.cuda.device_count()):
            allocated = torch.cuda.memory_allocated(i) / 1024**2
            reserved = torch.cuda.memory_reserved(i) / 1024**2
            print(f"  GPU {i}: Allocated: {allocated:.0f}MB, Reserved: {reserved:.0f}MB")
    else:
        print("⚠ CUDA not available in PyTorch")
        
except ImportError:
    print("⚠ PyTorch not installed, skipping PyTorch cache cleanup")
except Exception as e:
    print(f"⚠ Error clearing PyTorch cache: {e}")
    
# Force Python garbage collection
gc.collect()
PYTHON_SCRIPT

echo ""

# Step 4: Reset GPU (if possible)
echo -e "${YELLOW}[4/5] Resetting GPU state...${NC}"

# Try to reset GPU compute mode
sudo nvidia-smi --gpu-reset 2>/dev/null && echo -e "${GREEN}✓ GPU reset successful${NC}" || echo -e "${YELLOW}⚠ GPU reset not supported (this is normal)${NC}"

# Enable persistence mode (keeps GPU initialized but clears state)
sudo nvidia-smi -pm 1 2>/dev/null && echo -e "${GREEN}✓ Persistence mode enabled${NC}" || echo -e "${YELLOW}⚠ Could not enable persistence mode${NC}"

echo ""

# Step 5: Show new GPU status
echo -e "${YELLOW}[5/5] Checking new GPU status...${NC}"
sleep 2

GPU_MEM_USED_AFTER=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits)
GPU_MEM_PERCENT_AFTER=$((GPU_MEM_USED_AFTER * 100 / GPU_MEM_TOTAL))

nvidia-smi --query-gpu=index,name,memory.used,memory.total,utilization.gpu --format=csv
echo ""

# Calculate memory freed
MEMORY_FREED=$((GPU_MEM_USED - GPU_MEM_USED_AFTER))

echo -e "${BLUE}==================================================${NC}"
echo -e "${GREEN}Cleanup Complete!${NC}"
echo -e "${BLUE}==================================================${NC}"
echo ""
echo "Before: ${GPU_MEM_USED}MB used (${GPU_MEM_PERCENT}%)"
echo "After:  ${GPU_MEM_USED_AFTER}MB used (${GPU_MEM_PERCENT_AFTER}%)"
echo ""

if [ $MEMORY_FREED -gt 0 ]; then
    echo -e "${GREEN}✓ Freed ${MEMORY_FREED}MB of GPU memory${NC}"
else
    echo -e "${YELLOW}⚠ No significant memory freed (${MEMORY_FREED}MB)${NC}"
fi

echo ""
echo -e "${YELLOW}Note: Workers have been stopped. To restart them:${NC}"
echo "  ./start_workers.sh"
echo ""

# Ask if user wants to restart workers
read -p "Do you want to restart workers now? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${YELLOW}Restarting workers...${NC}"
    ./start_workers.sh
fi

echo ""
echo -e "${GREEN}Done!${NC}"
echo -e "${BLUE}==================================================${NC}"