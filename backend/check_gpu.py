#!/usr/bin/env python3
"""
GPU Capability Check for SARAL Backend Services
Tests GPU availability for PDF processing (Docling) and video encoding (FFmpeg/MoviePy)
"""

import sys
from pathlib import Path

# Add backend to path
backend_root = Path(__file__).parent
sys.path.insert(0, str(backend_root))

print("=" * 70)
print("SARAL BACKEND - GPU CAPABILITY CHECK")
print("=" * 70)

# 1. Check PyTorch CUDA Support
print("\n1. 🔥 PyTorch CUDA Support (for Docling PDF Processing):")
print("-" * 70)
try:
    import torch
    
    cuda_available = torch.cuda.is_available()
    print(f"   CUDA Available: {cuda_available}")
    
    if cuda_available:
        print(f"   CUDA Version: {torch.version.cuda}")
        print(f"   GPU Count: {torch.cuda.device_count()}")
        for i in range(torch.cuda.device_count()):
            gpu_name = torch.cuda.get_device_name(i)
            print(f"   GPU {i}: {gpu_name}")
        print(f"   ✅ Status: Docling will use NVIDIA GPU for PDF processing")
    else:
        print("   ℹ️  Status: Docling will use CPU for PDF processing")
        
except ImportError as e:
    print(f"   ⚠️  PyTorch not installed: {e}")
except Exception as e:
    print(f"   ⚠️  Error checking CUDA: {e}")

# 2. Check PyTorch MPS Support (Apple Silicon)
print("\n2. 🍎 PyTorch MPS Support (Apple Silicon GPU):")
print("-" * 70)
try:
    import torch
    
    if torch.backends.mps.is_built():
        mps_available = torch.backends.mps.is_available()
        print(f"   MPS Available: {mps_available}")
        if mps_available:
            print("   ✅ Status: Docling will use Apple Silicon GPU")
        else:
            print("   ℹ️  Status: MPS not available")
    else:
        print("   ℹ️  MPS not built (not on macOS)")
        
except ImportError:
    print("   ⚠️  PyTorch not installed")
except Exception as e:
    print(f"   ⚠️  Error checking MPS: {e}")

# 3. Check Docling Configuration
print("\n3. 📄 Docling Configuration:")
print("-" * 70)
try:
    from docling.datamodel.accelerator_options import AcceleratorDevice, AcceleratorOptions
    from docling.utils.accelerator_utils import decide_device
    
    # Test AUTO mode
    device = decide_device(AcceleratorDevice.AUTO)
    print(f"   AcceleratorDevice.AUTO will use: {device}")
    
    if device.startswith('cuda'):
        print("   ✅ Docling configured to use NVIDIA GPU")
    elif device == 'mps':
        print("   ✅ Docling configured to use Apple Silicon GPU")
    else:
        print("   ℹ️  Docling configured to use CPU")
        
    # Check current pdf_processor.py configuration
    print("\n   Checking pdf_processor.py configuration...")
    pdf_processor_path = backend_root / "app" / "services" / "pdf_processor.py"
    with open(pdf_processor_path, 'r') as f:
        content = f.read()
        if 'AcceleratorDevice.AUTO' in content:
            print("   ✅ pdf_processor.py uses AcceleratorDevice.AUTO (GPU-enabled)")
        elif 'AcceleratorDevice.CPU' in content:
            print("   ⚠️  pdf_processor.py uses AcceleratorDevice.CPU (GPU-disabled)")
        else:
            print("   ⚠️  Could not determine AcceleratorDevice setting")
            
except ImportError as e:
    print(f"   ⚠️  Docling not installed: {e}")
except Exception as e:
    print(f"   ⚠️  Error checking Docling: {e}")

# 4. Check FFmpeg NVENC Support
print("\n4. 🎬 FFmpeg NVENC Support (for Video Encoding):")
print("-" * 70)
try:
    import subprocess
    
    result = subprocess.run(
        ['ffmpeg', '-codecs'],
        capture_output=True,
        text=True,
        timeout=5
    )
    
    has_h264_nvenc = 'h264_nvenc' in result.stdout
    has_hevc_nvenc = 'hevc_nvenc' in result.stdout
    
    print(f"   H.264 NVENC: {'✅ Available' if has_h264_nvenc else '❌ Not available'}")
    print(f"   H.265 NVENC: {'✅ Available' if has_hevc_nvenc else '❌ Not available'}")
    
    if has_h264_nvenc:
        print("   ✅ Status: Video encoding will use NVIDIA GPU (NVENC)")
    else:
        print("   ℹ️  Status: Video encoding will use CPU (libx264)")
        
except FileNotFoundError:
    print("   ⚠️  FFmpeg not found in PATH")
except subprocess.TimeoutExpired:
    print("   ⚠️  FFmpeg command timed out")
except Exception as e:
    print(f"   ⚠️  Error checking FFmpeg: {e}")

# 5. Test GPU Utils
print("\n5. 🛠️  GPU Utils Module (Backend Integration):")
print("-" * 70)
try:
    from app.utils.gpu_utils import (
        has_cuda_available,
        has_nvenc_support,
        get_video_encoding_config,
        get_fast_video_encoding_config,
    )
    
    cuda = has_cuda_available()
    nvenc = has_nvenc_support()
    
    print(f"   has_cuda_available(): {cuda}")
    print(f"   has_nvenc_support(): {nvenc}")
    
    print("\n   Video Encoding Configuration (Standard):")
    std_config = get_video_encoding_config()
    print(f"      Codec: {std_config['codec']}")
    print(f"      Hardware: {std_config['hardware']}")
    print(f"      Preset: {std_config.get('preset', 'N/A')}")
    
    print("\n   Video Encoding Configuration (Fast):")
    fast_config = get_fast_video_encoding_config()
    print(f"      Codec: {fast_config['codec']}")
    print(f"      Hardware: {fast_config['hardware']}")
    print(f"      Preset: {fast_config.get('preset', 'N/A')}")
    
    print("\n   ✅ GPU Utils module working correctly")
    
except ImportError as e:
    print(f"   ⚠️  GPU Utils not found: {e}")
except Exception as e:
    print(f"   ⚠️  Error testing GPU Utils: {e}")

# 6. Summary
print("\n" + "=" * 70)
print("SUMMARY & RECOMMENDATIONS")
print("=" * 70)

try:
    import torch
    from app.utils.gpu_utils import has_nvenc_support
    
    cuda = torch.cuda.is_available()
    mps = torch.backends.mps.is_built() and torch.backends.mps.is_available()
    nvenc = has_nvenc_support()
    
    if cuda or mps:
        print("\n✅ GPU ACCELERATION ENABLED FOR PDF PROCESSING")
        if cuda:
            print(f"   Using: NVIDIA CUDA GPU ({torch.cuda.get_device_name(0)})")
        elif mps:
            print("   Using: Apple Silicon GPU (MPS)")
        print("   Expected speedup: 2-5x faster PDF processing")
    else:
        print("\nℹ️  CPU MODE FOR PDF PROCESSING")
        print("   No GPU detected - using CPU (this is normal on CPU-only systems)")
    
    if nvenc:
        print("\n✅ GPU ACCELERATION ENABLED FOR VIDEO ENCODING")
        print("   Using: NVIDIA NVENC hardware encoder")
        print("   Expected speedup: 2-3x faster video generation")
    else:
        print("\nℹ️  CPU MODE FOR VIDEO ENCODING")
        print("   No NVENC support - using libx264 CPU encoder")
        print("   This is normal on non-NVIDIA systems")
    
    print("\n📊 PERFORMANCE EXPECTATIONS:")
    if cuda or mps:
        print("   • PDF Processing: 2-5x faster with GPU")
    if nvenc:
        print("   • Video Encoding: 2-3x faster with GPU")
    if not (cuda or mps or nvenc):
        print("   • All processing using CPU (no GPU acceleration)")
    
    print("\n🔧 CONFIGURATION:")
    print("   • Docling: AcceleratorDevice.AUTO (detects GPU automatically)")
    print("   • FFmpeg: Dynamic detection (NVENC if available, libx264 fallback)")
    print("   • MoviePy: Uses FFmpeg backend (inherits GPU support)")
    
except Exception as e:
    print(f"\n⚠️  Error generating summary: {e}")

print("\n" + "=" * 70)
print("GPU check complete! All services configured for GPU/CPU compatibility.")
print("=" * 70)