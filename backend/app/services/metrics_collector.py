"""
Prometheus Metrics Collector for SARAL Services

Collects custom metrics for:
- Service health (pdf-to-video, reels, podcast, poster, etc.)
- Worker queue depths
- Paper processing counts
- Storage usage
- API key status
"""

import os
import logging
from pathlib import Path
from typing import Dict, Optional
from prometheus_client import Counter, Gauge, Histogram, Info
from datetime import datetime
import psutil

logger = logging.getLogger(__name__)

# ============================================================================
# Custom Prometheus Metrics
# ============================================================================

# Paper Processing Counters
papers_processed_total = Counter(
    'saral_papers_processed_total',
    'Total papers processed by SARAL',
    ['source_type']  # pdf, arxiv, biorxiv, patent
)

papers_uploaded_total = Counter(
    'saral_papers_uploaded_total',
    'Total papers uploaded',
    ['user_id']
)

# Output Generation Counters
outputs_generated_total = Counter(
    'saral_outputs_generated_total',
    'Total outputs generated',
    ['output_type']  # video, podcast, reels, poster, slides
)

# Service Health Gauges (1 = healthy, 0 = unhealthy, -1 = unknown)
service_health = Gauge(
    'saral_service_health',
    'Service health status',
    ['service_name']
)

# Worker Queue Depth
worker_queue_depth = Gauge(
    'saral_worker_queue_depth',
    'Current queue depth for workers',
    ['worker_type']
)

# Active Jobs
active_jobs = Gauge(
    'saral_active_jobs',
    'Currently processing jobs',
    ['service_type']
)

# Storage Usage (bytes)
storage_usage_bytes = Gauge(
    'saral_storage_usage_bytes',
    'Disk usage in bytes',
    ['directory']
)

# API Keys Status (1 = configured, 0 = missing)
api_key_status = Gauge(
    'saral_api_key_status',
    'API key configuration status',
    ['api_name']
)

# Processing Time Histogram
processing_duration_seconds = Histogram(
    'saral_processing_duration_seconds',
    'Time spent processing requests',
    ['service_type', 'operation'],
    buckets=[1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600]  # Up to 1 hour
)

# Error Counters
processing_errors_total = Counter(
    'saral_processing_errors_total',
    'Total processing errors',
    ['service_type', 'error_type']
)

# System Metrics
system_info = Info('saral_system', 'System information')


# ============================================================================
# Metrics Collection Functions
# ============================================================================

class MetricsCollector:
    """Collects and updates custom metrics for SARAL services"""
    
    def __init__(self):
        self._initialized = False
        self._last_update = None
        
    def initialize(self):
        """Initialize metrics with default values"""
        if self._initialized:
            return
            
        logger.info("Initializing Prometheus metrics collector")
        
        # Set system info
        try:
            system_info.info({
                'version': '1.0.0',
                'python_version': f"{os.sys.version_info.major}.{os.sys.version_info.minor}",
                'platform': os.sys.platform,
            })
        except Exception as e:
            logger.error(f"Error setting system info: {e}")
        
        # Initialize service health to unknown (-1)
        services = ['pdf_to_video', 'reels', 'podcast', 'poster', 'slides', 
                   'arxiv_scraper', 'latex_processor', 'scripts']
        for service in services:
            service_health.labels(service_name=service).set(-1)
        
        # Initialize API key status
        self.update_api_key_status()
        
        # Initialize storage metrics
        self.update_storage_metrics()
        
        self._initialized = True
        logger.info("Metrics collector initialized")
    
    def update_api_key_status(self):
        """Check and update API key configuration status"""
        api_keys = {
            'gemini': os.getenv('GEMINI_API_KEY'),
            'sarvam': os.getenv('SARVAM_API_KEY'),
            'bhashini': os.getenv('BHASHINI_API_KEY'),
            'openai': os.getenv('OPENAI_API_KEY'),
        }
        
        for api_name, api_value in api_keys.items():
            status = 1 if api_value else 0
            api_key_status.labels(api_name=api_name).set(status)
    
    def update_storage_metrics(self):
        """Update storage usage metrics for temp directories"""
        temp_dirs = {
            'papers': 'temp/papers',
            'videos': 'temp/videos',
            'audio': 'temp/audio',
            'podcasts': 'temp/podcasts',
            'reels': 'temp/reels',
            'posters': 'temp/posters',
            'slides': 'temp/slides',
            'scripts': 'temp/scripts',
        }
        
        for dir_name, dir_path in temp_dirs.items():
            try:
                if os.path.exists(dir_path):
                    total_size = sum(
                        f.stat().st_size 
                        for f in Path(dir_path).rglob('*') 
                        if f.is_file()
                    )
                    storage_usage_bytes.labels(directory=dir_name).set(total_size)
                else:
                    storage_usage_bytes.labels(directory=dir_name).set(0)
            except Exception as e:
                logger.error(f"Error calculating storage for {dir_name}: {e}")
                storage_usage_bytes.labels(directory=dir_name).set(-1)
    
    def check_redis_health(self) -> bool:
        """Check if Redis is accessible"""
        try:
            import redis
            r = redis.Redis(host='localhost', port=6379, socket_connect_timeout=2)
            r.ping()
            return True
        except Exception as e:
            logger.warning(f"Redis health check failed: {e}")
            return False
    
    def check_firebase_health(self) -> bool:
        """Check if Firebase is accessible"""
        try:
            from app.firebase import db
            # Simple test query
            db.collection('_health_check').limit(1).get()
            return True
        except Exception as e:
            logger.warning(f"Firebase health check failed: {e}")
            return False
    
    def update_service_health_status(self, service_name: str, is_healthy: bool):
        """Update health status for a specific service"""
        status = 1 if is_healthy else 0
        service_health.labels(service_name=service_name).set(status)
    
    def get_service_health_status(self) -> Dict[str, dict]:
        """Get health status for all services"""
        services_status = {}
        
        # Check Redis (affects all worker-based services)
        redis_healthy = self.check_redis_health()
        
        # Check Firebase
        firebase_healthy = self.check_firebase_health()
        
        # Update service statuses
        worker_services = ['pdf_to_video', 'reels', 'podcast', 'poster']
        for service in worker_services:
            is_healthy = redis_healthy  # Workers depend on Redis
            self.update_service_health_status(service, is_healthy)
            services_status[service] = {
                'healthy': is_healthy,
                'reason': 'Redis unavailable' if not redis_healthy else 'OK'
            }
        
        # Non-worker services
        other_services = ['slides', 'scripts', 'arxiv_scraper', 'latex_processor']
        for service in other_services:
            is_healthy = True  # These don't depend on Redis
            self.update_service_health_status(service, is_healthy)
            services_status[service] = {
                'healthy': is_healthy,
                'reason': 'OK'
            }
        
        # Update infrastructure health gauges (so Prometheus can scrape them)
        service_health.labels(service_name="redis").set(1 if redis_healthy else 0)
        service_health.labels(service_name="firebase").set(1 if firebase_healthy else 0)
        
        # Add infrastructure status
        services_status['redis'] = {
            'healthy': redis_healthy,
            'reason': 'OK' if redis_healthy else 'Connection failed'
        }
        services_status['firebase'] = {
            'healthy': firebase_healthy,
            'reason': 'OK' if firebase_healthy else 'Connection failed'
        }
        
        return services_status
    
    def record_paper_upload(self, source_type: str = 'pdf', user_id: Optional[str] = None):
        """Record a paper upload"""
        papers_processed_total.labels(source_type=source_type).inc()
        if user_id:
            papers_uploaded_total.labels(user_id=user_id).inc()
    
    def record_output_generation(self, output_type: str):
        """Record output generation (video, podcast, etc.)"""
        outputs_generated_total.labels(output_type=output_type).inc()
    
    def record_processing_error(self, service_type: str, error_type: str = 'unknown'):
        """Record a processing error"""
        processing_errors_total.labels(
            service_type=service_type,
            error_type=error_type
        ).inc()
    
    def update_queue_depth(self, worker_type: str, depth: int):
        """Update worker queue depth"""
        worker_queue_depth.labels(worker_type=worker_type).set(depth)
    
    def update_active_jobs(self, service_type: str, count: int):
        """Update active jobs count"""
        active_jobs.labels(service_type=service_type).set(count)
    
    def record_processing_time(self, service_type: str, operation: str, duration_seconds: float):
        """Record processing duration"""
        processing_duration_seconds.labels(
            service_type=service_type,
            operation=operation
        ).observe(duration_seconds)


# Global instance
metrics_collector = MetricsCollector()


# ============================================================================
# Helper Functions
# ============================================================================

def get_queue_depth_from_redis(worker_type: str) -> int:
    """Get queue depth from Redis for a specific worker type"""
    try:
        import redis
        r = redis.Redis(host='localhost', port=6379)
        
        # ARQ uses specific key patterns for queues
        queue_key = f"arq:queue:{worker_type}"
        depth = r.llen(queue_key)
        return depth
    except Exception as e:
        logger.error(f"Error getting queue depth for {worker_type}: {e}")
        return -1


def update_all_queue_depths():
    """Update queue depths for all worker types"""
    worker_types = [
        'pdf_processor',
        'video_worker',
        'latex_worker',
        'arxiv_worker',
        'poster_worker',
    ]
    
    for worker_type in worker_types:
        depth = get_queue_depth_from_redis(worker_type)
        if depth >= 0:
            metrics_collector.update_queue_depth(worker_type, depth)
