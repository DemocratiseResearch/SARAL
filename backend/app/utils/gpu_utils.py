"""GPU Detection and FFmpeg Configuration Utilities."""
import subprocess
import logging
from typing import Dict, List, Tuple

logger = logging.getLogger(__name__)

# Cache GPU detection results to avoid repeated checks
_gpu_detection_cache = {
    "nvenc_available": None,
    "cuda_available": None,
}


def has_nvenc_support() -> bool:
    """
    Check if FFmpeg has NVIDIA NVENC hardware encoding support.
    Actually tests the encoder to avoid false positives.
    
    Returns:
        bool: True if h264_nvenc codec is available and working in FFmpeg
    """
    # Check for manual override
    import os
    if os.getenv("FORCE_CPU_ENCODING", "").lower() in ("1", "true", "yes"):
        logger.info("🔧 FORCE_CPU_ENCODING is set, using CPU encoding")
        _gpu_detection_cache["nvenc_available"] = False
        return False
    
    if _gpu_detection_cache["nvenc_available"] is not None:
        return _gpu_detection_cache["nvenc_available"]
    
    try:
        # First check if encoder is listed
        result = subprocess.run(
            ['ffmpeg', '-codecs'],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if 'h264_nvenc' not in result.stdout:
            logger.info("ℹ️  NVIDIA NVENC not listed in FFmpeg codecs, using CPU encoding")
            _gpu_detection_cache["nvenc_available"] = False
            return False
        
        # Actually test if the encoder works by attempting to get encoder info
        test_result = subprocess.run(
            ['ffmpeg', '-hide_banner', '-h', 'encoder=h264_nvenc'],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        # If return code is 0, encoder is actually available
        has_nvenc = test_result.returncode == 0
        _gpu_detection_cache["nvenc_available"] = has_nvenc
        
        if has_nvenc:
            logger.info("✅ NVIDIA NVENC hardware encoding available and tested")
        else:
            logger.info("⚠️  NVIDIA NVENC listed but not functional, using CPU encoding")
        
        return has_nvenc
    except (subprocess.TimeoutExpired, FileNotFoundError, Exception) as e:
        logger.warning(f"Could not check FFmpeg NVENC support: {e}")
        _gpu_detection_cache["nvenc_available"] = False
        return False


def has_cuda_available() -> bool:
    """
    Check if CUDA is available for PyTorch/GPU acceleration.
    
    Returns:
        bool: True if CUDA is available
    """
    if _gpu_detection_cache["cuda_available"] is not None:
        return _gpu_detection_cache["cuda_available"]
    
    try:
        import torch
        cuda_available = torch.cuda.is_available()
        _gpu_detection_cache["cuda_available"] = cuda_available
        
        if cuda_available:
            gpu_name = torch.cuda.get_device_name(0)
            logger.info(f"✅ CUDA GPU available: {gpu_name}")
        else:
            logger.info("ℹ️  CUDA not available, using CPU")
        
        return cuda_available
    except ImportError:
        logger.warning("PyTorch not installed, CUDA unavailable")
        _gpu_detection_cache["cuda_available"] = False
        return False
    except Exception as e:
        logger.warning(f"Could not check CUDA availability: {e}")
        _gpu_detection_cache["cuda_available"] = False
        return False


def get_video_encoding_config() -> Dict[str, any]:
    """
    Get optimal video encoding configuration based on available hardware.
    
    Returns:
        dict: Configuration with codec, ffmpeg_params, and preset
    """
    use_nvenc = has_nvenc_support()
    
    if use_nvenc:
        # NVIDIA GPU encoding configuration with compatible options
        config = {
            "codec": "h264_nvenc",
            "preset": "fast",  # NVENC presets: slow, medium, fast, hp, hq, bd, ll, llhq, llhp, lossless
            "threads": None,  # NVENC doesn't use threads parameter
            "ffmpeg_params": [
                "-pix_fmt", "yuv420p",
                "-profile:v", "main",
                "-b:v", "5M",  # Target bitrate
                "-maxrate", "8M",  # Maximum bitrate
                "-bufsize", "10M",  # Buffer size
                "-movflags", "+faststart",
            ],
            "hardware": "NVIDIA GPU (NVENC)",
        }
    else:
        # CPU encoding configuration (fallback)
        config = {
            "codec": "libx264",
            "preset": "medium",  # CPU presets: ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow
            "threads": 4,
            "ffmpeg_params": [
                "-pix_fmt", "yuv420p",
                "-profile:v", "main",
                "-level", "3.1",
                "-movflags", "+faststart",
            ],
            "hardware": "CPU",
        }
    
    logger.info(f"Video encoding: {config['codec']} ({config['hardware']})")
    return config


def get_fast_video_encoding_config() -> Dict[str, any]:
    """
    Get fast video encoding configuration for preview/reel generation.
    Optimized for speed over quality.
    
    Returns:
        dict: Configuration with codec and parameters optimized for speed
    """
    use_nvenc = has_nvenc_support()
    
    if use_nvenc:
        # Ultra-fast NVIDIA GPU encoding with compatible options
        config = {
            "codec": "h264_nvenc",
            "preset": "hp",  # High performance preset (fastest)
            "threads": None,
            "ffmpeg_params": [
                "-pix_fmt", "yuv420p",
                "-b:v", "3M",  # Lower bitrate for speed
                "-maxrate", "5M",
                "-bufsize", "6M",
            ],
            "hardware": "NVIDIA GPU (NVENC HP)",
        }
    else:
        # Ultra-fast CPU encoding (fallback)
        config = {
            "codec": "libx264",
            "preset": "ultrafast",
            "threads": 8,
            "ffmpeg_params": [
                "-pix_fmt", "yuv420p",
            ],
            "hardware": "CPU (ultrafast)",
        }
    
    logger.info(f"Fast video encoding: {config['codec']} ({config['hardware']})")
    return config


def get_audio_compatible_config() -> Dict[str, str]:
    """
    Get audio codec configuration compatible with both GPU and CPU encoding.
    
    Returns:
        dict: Audio codec configuration
    """
    return {
        "audio_codec": "aac",
        "temp_audiofile": "temp-audio.m4a",
    }


def log_gpu_status():
    """Log the current GPU status for debugging."""
    cuda_status = "✅ Available" if has_cuda_available() else "❌ Not available"
    nvenc_status = "✅ Available" if has_nvenc_support() else "❌ Not available"
    
    logger.info("=" * 60)
    logger.info("GPU STATUS CHECK")
    logger.info("=" * 60)
    logger.info(f"CUDA (PyTorch GPU):  {cuda_status}")
    logger.info(f"NVENC (Video GPU):   {nvenc_status}")
    logger.info("=" * 60)


def get_moviepy_write_config(fast_mode: bool = False) -> Dict[str, any]:
    """
    Get complete MoviePy write_videofile configuration.
    
    Args:
        fast_mode: If True, use fastest encoding settings
    
    Returns:
        dict: Complete configuration for write_videofile()
    """
    encoding = get_fast_video_encoding_config() if fast_mode else get_video_encoding_config()
    audio = get_audio_compatible_config()
    
    config = {
        "codec": encoding["codec"],
        "audio_codec": audio["audio_codec"],
        "temp_audiofile": audio["temp_audiofile"],
        "remove_temp": True,
        "logger": None,
        "ffmpeg_params": encoding["ffmpeg_params"],
    }
    
    # Add preset and threads only for CPU encoding
    if encoding["preset"]:
        config["preset"] = encoding["preset"]
    if encoding["threads"]:
        config["threads"] = encoding["threads"]
    
    return config
