import os
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime
from app.services.firestore_helpers import (
    save_paper_metadata,
    update_paper_output,
    update_user_activity,
    increment_user_counter
)
from app.services.metrics_collector import metrics_collector

logger = logging.getLogger(__name__)

# ============================================================================
# Temp Folder Scanner
# ============================================================================

def scan_temp_folder(paper_id: str) -> Dict[str, Any]:
    """
    Scan temp folders for a specific paper and return metadata.
    
    Scans:
    - temp/papers/{paper_id}/
    - temp/videos/{paper_id}/
    - temp/audio/{paper_id}/
    - temp/podcasts/{paper_id}/
    - temp/reels/{paper_id}/
    - temp/posters/{paper_id}/
    - temp/slides/{paper_id}/
    - temp/scripts/{paper_id}/
    """
    temp_data = {
        'base_path': f'temp/papers/{paper_id}',
        'files': {},
        'total_size_bytes': 0
    }
    
    # Define folders to scan
    folders_to_scan = {
        'papers': 'temp/papers',
        'videos': 'temp/videos',
        'audio': 'temp/audio',
        'podcasts': 'temp/podcasts',
        'reels': 'temp/reels',
        'posters': 'temp/posters',
        'slides': 'temp/slides',
        'scripts': 'temp/scripts',
        'business_briefs': 'temp/business_briefs',
    }
    
    for folder_type, base_path in folders_to_scan.items():
        folder_path = Path(base_path) / paper_id
        
        if folder_path.exists() and folder_path.is_dir():
            files = list(folder_path.rglob('*'))
            file_list = []
            folder_size = 0
            
            for file in files:
                if file.is_file():
                    try:
                        file_size = file.stat().st_size
                        folder_size += file_size
                        file_list.append({
                            'name': file.name,
                            'path': str(file.relative_to(base_path)),
                            'size_bytes': file_size,
                            'extension': file.suffix
                        })
                    except Exception as e:
                        logger.warning(f"Error reading file {file}: {e}")
            
            if file_list:
                temp_data['files'][folder_type] = {
                    'count': len(file_list),
                    'size_bytes': folder_size,
                    'files': file_list
                }
                temp_data['total_size_bytes'] += folder_size
    
    return temp_data


def get_file_size(file_path: str) -> int:
    """Get file size in bytes, return 0 if file doesn't exist"""
    try:
        if os.path.exists(file_path):
            return os.path.getsize(file_path)
        return 0
    except Exception as e:
        logger.warning(f"Error getting file size for {file_path}: {e}")
        return 0


# ============================================================================
# Paper Tracking Functions
# ============================================================================

def track_paper_upload(
    paper_id: str,
    user_id: Optional[str] = None,
    user_email: Optional[str] = None,
    session_id: Optional[str] = None,
    source_type: str = 'pdf',
    filename: Optional[str] = None,
    title: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None
) -> bool:
    try:
        # Build paper metadata
        paper_metadata = {
            'paper_id': paper_id,
            'created_at': datetime.now(),
            'updated_at': datetime.now(),
            'source': {
                'type': source_type,
                'filename': filename or 'unknown',
            },
            'status': 'uploaded',
        }
        
        # Add user info if available (OPTIONAL)
        if user_id:
            paper_metadata['user_id'] = user_id
            paper_metadata['user_email'] = user_email
            
        # Add session if available (OPTIONAL)
        if session_id:
            paper_metadata['session_id'] = session_id
        
        # Add title if available
        if title:
            paper_metadata['title'] = title
        
        # Add additional metadata if provided
        if metadata:
            paper_metadata['metadata'] = metadata
        
        # Initialize processing outputs structure
        paper_metadata['processing_outputs'] = {}
        
        # Scan temp folder for initial files
        temp_data = scan_temp_folder(paper_id)
        paper_metadata['temp_storage'] = temp_data
        
        # Save to Firestore
        save_paper_metadata(paper_id, paper_metadata)
        
        # Update user activity if user is logged in
        if user_id:
            increment_user_counter(user_id, 'total_papers')
            update_user_activity(user_id, {
                'email': user_email
            })
        
        # Record metrics
        metrics_collector.record_paper_upload(source_type, user_id)
        
        logger.info(f"Tracked paper upload: {paper_id} by user {user_id or 'anonymous'}")
        return True
        
    except Exception as e:
        logger.error(f"Error tracking paper upload: {e}")
        return False


def track_output_generation(
    paper_id: str,
    output_type: str,
    file_path: Optional[str] = None,
    duration: Optional[float] = None,
    user_id: Optional[str] = None,
    additional_data: Optional[Dict[str, Any]] = None
) -> bool:
    try:
        output_data = {
            'generated': True,
            'generated_at': datetime.now(),
        }
        
        # Add file info if available
        if file_path:
            output_data['path'] = file_path
            output_data['size_bytes'] = get_file_size(file_path)
        
        # Add duration if available
        if duration is not None:
            output_data['duration_seconds'] = duration
        
        # Add any additional data
        if additional_data:
            output_data.update(additional_data)
        
        # Update Firestore
        update_paper_output(paper_id, output_type, output_data)
        
        # Update user counter if user is logged in
        if user_id:
            counter_name = f'total_{output_type}' if output_type.endswith('s') else f'total_{output_type}s'  # total_reels, total_videos, etc.
            increment_user_counter(user_id, counter_name)
        
        # Record metrics
        metrics_collector.record_output_generation(output_type)
        
        logger.info(f"Tracked {output_type} generation for paper {paper_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error tracking output generation: {e}")
        return False





def update_paper_status(paper_id: str, status: str, error_message: Optional[str] = None) -> bool:
    try:
        update_data = {
            'status': status,
            'updated_at': datetime.now()
        }
        
        if error_message:
            update_data['error_message'] = error_message
        
        save_paper_metadata(paper_id, update_data)
        return True
        
    except Exception as e:
        logger.error(f"Error updating paper status: {e}")
        return False


# ============================================================================
# Batch Operations
# ============================================================================

def rescan_all_papers_storage() -> Dict[str, int]:
    """
    Rescan temp folders for all papers and update Firestore.
    Useful for initial data migration or periodic updates.
    
    Returns count of papers updated.
    """
    try:
        # Get all paper directories
        papers_dir = Path('temp/papers')
        if not papers_dir.exists():
            logger.warning("Papers directory doesn't exist")
            return {'updated': 0, 'failed': 0}
        
        paper_dirs = [d for d in papers_dir.iterdir() if d.is_dir()]
        updated = 0
        failed = 0
        
        for paper_dir in paper_dirs:
            paper_id = paper_dir.name
            try:
                # Scan temp folder
                temp_data = scan_temp_folder(paper_id)
                
                # Update Firestore
                save_paper_metadata(paper_id, {
                    'temp_storage': temp_data,
                    'updated_at': datetime.now()
                })
                
                updated += 1
                
            except Exception as e:
                logger.error(f"Error updating paper {paper_id}: {e}")
                failed += 1
        
        logger.info(f"Rescanned storage: {updated} updated, {failed} failed")
        return {'updated': updated, 'failed': failed}
        
    except Exception as e:
        logger.error(f"Error in rescan operation: {e}")
        return {'updated': 0, 'failed': 0}
