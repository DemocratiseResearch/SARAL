"""
Enhanced GPU Monitoring for Docling + FFmpeg Workloads

This version properly tracks:
1. NVENC/NVDEC usage (FFmpeg video encoding/decoding)
2. GPU memory percentage (fixed calculation)
3. CUDA core utilization (for ML workloads)
4. Process-level statistics

Key fixes:
- Calculates actual GPU memory % (not controller utilization)
- Tracks encoder/decoder usage for FFmpeg
- Works with bursty workloads like docling
"""

import os
import sys
import time
import csv
import signal
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict
import psutil

# Optional GPU monitoring
try:
    import pynvml
    PYNVML_AVAILABLE = True
except ImportError:
    PYNVML_AVAILABLE = False
    print("WARNING: nvidia-ml-py not installed. Install with: pip install nvidia-ml-py")

# Configuration
SAMPLE_INTERVAL = int(os.getenv("MONITOR_SAMPLE_INTERVAL", "30"))
MONITORING_DATA_DIR = Path(__file__).parent.parent.parent / "monitoring_data"
LOG_LEVEL = os.getenv("MONITOR_LOG_LEVEL", "INFO")

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("gpu_cpu_monitor")

shutdown_flag = False

def signal_handler(signum, frame):
    global shutdown_flag
    logger.info(f"Received signal {signum}. Shutting down gracefully...")
    shutdown_flag = True


class GPUMonitor:
    """Enhanced GPU monitoring with NVENC/NVDEC support."""
    
    def __init__(self):
        self.available = False
        self.device_count = 0
        self.handles = []
        self.supports_encoder_stats = False
        
        if not PYNVML_AVAILABLE:
            logger.warning("PyNVML not available. GPU monitoring disabled.")
            return
        
        try:
            pynvml.nvmlInit()
            self.device_count = pynvml.nvmlDeviceGetCount()
            
            if self.device_count == 0:
                logger.warning("No NVIDIA GPUs detected.")
                return
            
            for i in range(self.device_count):
                handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                self.handles.append(handle)
                name = pynvml.nvmlDeviceGetName(handle)
                logger.info(f"GPU {i}: {name}")
            
            # Check if encoder/decoder stats are supported
            try:
                handle = self.handles[0]
                encoder_util = pynvml.nvmlDeviceGetEncoderUtilization(handle)
                self.supports_encoder_stats = True
                logger.info("✓ NVENC/NVDEC monitoring supported")
            except Exception as e:
                logger.warning(f"NVENC/NVDEC monitoring not available: {e}")
                self.supports_encoder_stats = False
            
            self.available = True
            logger.info(f"GPU monitoring initialized ({self.device_count} GPU(s))")
            
        except Exception as e:
            logger.error(f"Failed to initialize GPU monitoring: {e}")
            self.available = False
    
    def get_metrics(self) -> Optional[Dict]:
        """Get comprehensive GPU metrics including encoder/decoder usage."""
        if not self.available or not self.handles:
            return None
        
        try:
            handle = self.handles[0]
            
            # 1. CUDA Core Utilization (for ML/compute workloads)
            try:
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                gpu_util = util.gpu
            except Exception:
                gpu_util = None
            
            # 2. GPU Memory (FIXED - actual usage %, not controller util)
            try:
                mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
                mem_used_mb = mem_info.used / (1024 ** 2)
                mem_total_mb = mem_info.total / (1024 ** 2)
                # CORRECT calculation: actual memory usage percentage
                memory_util = (mem_info.used / mem_info.total * 100) if mem_info.total > 0 else 0
            except Exception:
                mem_used_mb = None
                mem_total_mb = None
                memory_util = None
            
            # 3. NVENC Utilization (FFmpeg encoding)
            encoder_util = None
            if self.supports_encoder_stats:
                try:
                    enc_util, _ = pynvml.nvmlDeviceGetEncoderUtilization(handle)
                    encoder_util = enc_util
                except Exception:
                    pass
            
            # 4. NVDEC Utilization (FFmpeg decoding)  
            decoder_util = None
            if self.supports_encoder_stats:
                try:
                    dec_util, _ = pynvml.nvmlDeviceGetDecoderUtilization(handle)
                    decoder_util = dec_util
                except Exception:
                    pass
            
            # 5. Temperature
            try:
                temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            except Exception:
                temp = None
            
            # 6. Power
            try:
                power_mw = pynvml.nvmlDeviceGetPowerUsage(handle)
                power_w = power_mw / 1000.0
            except Exception:
                power_w = None
            
            # 7. Active processes count (helps understand if GPU is in use)
            process_count = 0
            try:
                processes = pynvml.nvmlDeviceGetComputeRunningProcesses(handle)
                process_count = len(processes)
            except Exception:
                pass
            
            return {
                'gpu_utilization_%': gpu_util,  # CUDA cores (ML, docling bursts)
                'gpu_memory_util_%': round(memory_util, 1) if memory_util is not None else None,  # FIXED
                'gpu_memory_used_MB': round(mem_used_mb, 1) if mem_used_mb is not None else None,
                'gpu_memory_total_MB': round(mem_total_mb, 1) if mem_total_mb is not None else None,
                'encoder_util_%': encoder_util,  # FFmpeg NVENC
                'decoder_util_%': decoder_util,  # FFmpeg NVDEC
                'gpu_temperature_C': temp,
                'gpu_power_W': round(power_w, 1) if power_w is not None else None,
                'gpu_process_count': process_count,
            }
            
        except Exception as e:
            logger.error(f"Error getting GPU metrics: {e}")
            return None
    
    def shutdown(self):
        if self.available:
            try:
                pynvml.nvmlShutdown()
                logger.info("GPU monitoring shutdown successfully")
            except Exception as e:
                logger.error(f"Error during GPU shutdown: {e}")


class CPUMonitor:
    """Monitor CPU and system memory."""
    
    def __init__(self):
        self.cpu_count = psutil.cpu_count()
        logger.info(f"CPU monitoring initialized ({self.cpu_count} cores)")
    
    def get_metrics(self) -> Dict:
        try:
            cpu_percent_per_core = psutil.cpu_percent(interval=1, percpu=True)
            cpu_avg_percent = sum(cpu_percent_per_core) / len(cpu_percent_per_core) if cpu_percent_per_core else 0
            
            mem = psutil.virtual_memory()
            mem_used_gb = mem.used / (1024 ** 3)
            mem_total_gb = mem.total / (1024 ** 3)
            mem_percent = mem.percent
            
            return {
                'cpu_avg_%': round(cpu_avg_percent, 1),
                'cpu_per_core_%': [round(x, 1) for x in cpu_percent_per_core],
                'memory_used_GB': round(mem_used_gb, 2),
                'memory_total_GB': round(mem_total_gb, 2),
                'memory_%': round(mem_percent, 1),
            }
        except Exception as e:
            logger.error(f"Error getting CPU metrics: {e}")
            return {
                'cpu_avg_%': None,
                'cpu_per_core_%': None,
                'memory_used_GB': None,
                'memory_total_GB': None,
                'memory_%': None,
            }


class MetricsWriter:
    """Write metrics to CSV with daily rotation."""
    
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.current_file = None
        self.current_writer = None
        self.current_date = None
        logger.info(f"Metrics writer initialized. Data directory: {self.data_dir}")
    
    def _get_csv_path(self, date: datetime) -> Path:
        filename = f"gpu_cpu_metrics_{date.strftime('%Y-%m-%d')}.csv"
        return self.data_dir / filename
    
    def _ensure_file_open(self, timestamp: datetime):
        current_date = timestamp.date()
        
        if self.current_date != current_date or self.current_file is None:
            if self.current_file:
                self.current_file.close()
                logger.info(f"Closed previous metrics file for {self.current_date}")
            
            csv_path = self._get_csv_path(timestamp)
            file_exists = csv_path.exists()
            
            self.current_file = open(csv_path, 'a', newline='')
            self.current_writer = csv.DictWriter(
                self.current_file,
                fieldnames=[
                    'timestamp',
                    'gpu_utilization_%',
                    'gpu_memory_util_%',
                    'gpu_memory_used_MB',
                    'gpu_memory_total_MB',
                    'encoder_util_%',
                    'decoder_util_%',
                    'gpu_temperature_C',
                    'gpu_power_W',
                    'gpu_process_count',
                    'cpu_avg_%',
                    'cpu_per_core_%',
                    'memory_used_GB',
                    'memory_total_GB',
                    'memory_%',
                ]
            )
            
            if not file_exists:
                self.current_writer.writeheader()
                self.current_file.flush()
                logger.info(f"Created new metrics file: {csv_path}")
            else:
                logger.info(f"Appending to existing metrics file: {csv_path}")
            
            self.current_date = current_date
    
    def write_metrics(self, gpu_metrics: Optional[Dict], cpu_metrics: Dict):
        timestamp = datetime.now()
        
        try:
            self._ensure_file_open(timestamp)
            
            row = {
                'timestamp': timestamp.strftime('%Y-%m-%d %H:%M:%S'),
            }
            
            if gpu_metrics:
                row.update(gpu_metrics)
            else:
                row.update({
                    'gpu_utilization_%': 'N/A',
                    'gpu_memory_util_%': 'N/A',
                    'gpu_memory_used_MB': 'N/A',
                    'gpu_memory_total_MB': 'N/A',
                    'encoder_util_%': 'N/A',
                    'decoder_util_%': 'N/A',
                    'gpu_temperature_C': 'N/A',
                    'gpu_power_W': 'N/A',
                    'gpu_process_count': 'N/A',
                })
            
            cpu_per_core_str = str(cpu_metrics['cpu_per_core_%']) if cpu_metrics['cpu_per_core_%'] else 'N/A'
            row['cpu_per_core_%'] = cpu_per_core_str
            row['cpu_avg_%'] = cpu_metrics['cpu_avg_%']
            row['memory_used_GB'] = cpu_metrics['memory_used_GB']
            row['memory_total_GB'] = cpu_metrics['memory_total_GB']
            row['memory_%'] = cpu_metrics['memory_%']
            
            self.current_writer.writerow(row)
            self.current_file.flush()
            
        except Exception as e:
            logger.error(f"Error writing metrics: {e}")
    
    def close(self):
        if self.current_file:
            self.current_file.close()
            logger.info("Metrics writer closed")


def main():
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    logger.info("=" * 60)
    logger.info("Enhanced GPU & CPU Monitor (Docling + FFmpeg Support)")
    logger.info("=" * 60)
    logger.info(f"Sample interval: {SAMPLE_INTERVAL} seconds")
    logger.info(f"Data directory: {MONITORING_DATA_DIR}")
    logger.info("=" * 60)
    
    gpu_monitor = GPUMonitor()
    cpu_monitor = CPUMonitor()
    metrics_writer = MetricsWriter(MONITORING_DATA_DIR)
    
    if not gpu_monitor.available:
        logger.warning("Running in CPU-only mode")
    
    logger.info("Monitoring started. Press Ctrl+C to stop.")
    
    sample_count = 0
    
    try:
        while not shutdown_flag:
            gpu_metrics = gpu_monitor.get_metrics()
            cpu_metrics = cpu_monitor.get_metrics()
            
            metrics_writer.write_metrics(gpu_metrics, cpu_metrics)
            
            sample_count += 1
            
            if sample_count % 10 == 0:
                if gpu_metrics:
                    logger.info(
                        f"Sample #{sample_count} - "
                        f"GPU: {gpu_metrics.get('gpu_utilization_%', 'N/A')}% compute, "
                        f"{gpu_metrics.get('gpu_memory_util_%', 'N/A')}% mem | "
                        f"ENC: {gpu_metrics.get('encoder_util_%', 'N/A')}%, "
                        f"DEC: {gpu_metrics.get('decoder_util_%', 'N/A')}% | "
                        f"CPU: {cpu_metrics['cpu_avg_%']}%"
                    )
                else:
                    logger.info(
                        f"Sample #{sample_count} - "
                        f"CPU: {cpu_metrics['cpu_avg_%']}%, "
                        f"MEM: {cpu_metrics['memory_%']}%"
                    )
            
            for _ in range(SAMPLE_INTERVAL):
                if shutdown_flag:
                    break
                time.sleep(1)
    
    except Exception as e:
        logger.error(f"Unexpected error in monitoring loop: {e}", exc_info=True)
    
    finally:
        logger.info("Shutting down monitoring...")
        metrics_writer.close()
        gpu_monitor.shutdown()
        logger.info(f"Monitoring stopped. Collected {sample_count} samples.")


if __name__ == "__main__":
    main()