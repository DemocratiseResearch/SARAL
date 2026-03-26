"""
Firestore Helper Functions

Provides utility functions for interacting with Firebase Firestore.
Handles:
- Paper metadata storage
- User activity tracking
- Session management
- Query operations

BACKWARD COMPATIBLE - all operations are optional and won't break if data is missing.
"""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
from app.firebase import db
import traceback

logger = logging.getLogger(__name__)

# ============================================================================
# Firestore Collections
# ============================================================================

PAPER_METADATA_COLLECTION = 'paper_metadata'
USER_ACTIVITY_COLLECTION = 'user_activity_summary'
PAPER_PIPELINE_COLLECTION = 'paper_pipeline'

# ============================================================================
# Paper Metadata Operations
# ============================================================================

def save_paper_metadata(paper_id: str, metadata: Dict[str, Any]) -> bool:
    """
    Save or update paper metadata in Firestore.
    
    BACKWARD COMPATIBLE: Won't fail if data is incomplete.
    """
    try:
        # Add timestamp if not present
        if 'created_at' not in metadata:
            metadata['created_at'] = datetime.now()
        
        metadata['updated_at'] = datetime.now()
        
        # Save to Firestore
        db.collection(PAPER_METADATA_COLLECTION).document(paper_id).set(
            metadata,
            merge=True  # Merge with existing data, don't overwrite
        )
        
        logger.info(f"Saved paper metadata to Firestore: {paper_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error saving paper metadata to Firestore: {e}")
        logger.error(traceback.format_exc())
        return False


def get_paper_metadata(paper_id: str) -> Optional[Dict[str, Any]]:
    """Get paper metadata from Firestore"""
    try:
        doc = db.collection(PAPER_METADATA_COLLECTION).document(paper_id).get()
        if doc.exists:
            return doc.to_dict()
        return None
    except Exception as e:
        logger.error(f"Error getting paper metadata from Firestore: {e}")
        return None


def update_paper_output(paper_id: str, output_type: str, output_data: Dict[str, Any]) -> bool:
    """
    Update paper metadata when an output is generated (video, podcast, etc.)
    
    Args:
        paper_id: The paper UUID
        output_type: 'video', 'podcast', 'reels', 'poster', 'slides', 'audio'
        output_data: Dict with path, size_bytes, duration, etc.
    """
    try:
        output_data['generated_at'] = datetime.now()
        
        # Use set(merge=True) with nested dict structure
        # This correctly creates nested fields AND works on non-existing documents
        # (unlike update() which fails if document doesn't exist)
        db.collection(PAPER_METADATA_COLLECTION).document(paper_id).set({
            'processing_outputs': {
                output_type: output_data
            },
            'updated_at': datetime.now()
        }, merge=True)
        
        logger.info(f"Updated {output_type} output for paper {paper_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error updating paper output: {e}")
        return False


def get_papers_by_user(user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    """Get all papers created by a specific user"""
    try:
        # Query without order_by to avoid requiring a composite index
        docs = db.collection(PAPER_METADATA_COLLECTION)\
            .where('user_id', '==', user_id)\
            .limit(limit)\
            .stream()
        
        papers = []
        for doc in docs:
            paper_data = doc.to_dict()
            paper_data['paper_id'] = doc.id
            papers.append(paper_data)
        
        # Sort in Python (newest first)
        papers.sort(key=lambda p: p.get('created_at', ''), reverse=True)
        
        return papers
        
    except Exception as e:
        logger.error(f"Error getting papers by user {user_id}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return []


# ============================================================================
# User Activity Operations
# ============================================================================

def update_user_activity(user_id: str, activity_data: Dict[str, Any]) -> bool:
    """
    Update user activity summary.
    Increments counters for papers, videos, podcasts, etc.
    """
    try:
        user_ref = db.collection(USER_ACTIVITY_COLLECTION).document(user_id)
        
        # Get current data
        user_doc = user_ref.get()
        
        if user_doc.exists:
            # Update existing record
            current_data = user_doc.to_dict()
            
            # Increment counters
            for key, value in activity_data.items():
                if key.startswith('total_'):
                    current_data[key] = current_data.get(key, 0) + value
                else:
                    current_data[key] = value
            
            current_data['last_activity'] = datetime.now()
            user_ref.set(current_data, merge=True)
            
        else:
            # Create new record
            activity_data['first_activity'] = datetime.now()
            activity_data['last_activity'] = datetime.now()
            user_ref.set(activity_data)
        
        logger.info(f"Updated user activity for user {user_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error updating user activity: {e}")
        return False


def get_user_activity(user_id: str) -> Optional[Dict[str, Any]]:
    """Get user activity summary"""
    try:
        doc = db.collection(USER_ACTIVITY_COLLECTION).document(user_id).get()
        if doc.exists:
            return doc.to_dict()
        return None
    except Exception as e:
        logger.error(f"Error getting user activity: {e}")
        return None


def increment_user_counter(user_id: str, counter_name: str, amount: int = 1) -> bool:
    """
    Increment a specific counter for a user.
    
    Args:
        user_id: The user's Firebase UID
        counter_name: e.g., 'total_papers', 'total_videos', 'total_podcasts'
        amount: Amount to increment by (default 1)
    """
    try:
        from google.cloud.firestore import Increment
        
        db.collection(USER_ACTIVITY_COLLECTION).document(user_id).set({
            counter_name: Increment(amount),
            'last_activity': datetime.now()
        }, merge=True)
        
        return True
        
    except Exception as e:
        logger.error(f"Error incrementing user counter: {e}")
        return False



# ============================================================================
# Query Operations
# ============================================================================

def get_recent_papers(limit: int = 50) -> List[Dict[str, Any]]:
    """Get recently processed papers across all users"""
    try:
        docs = db.collection(PAPER_METADATA_COLLECTION)\
            .order_by('created_at', direction='DESCENDING')\
            .limit(limit)\
            .stream()
        
        papers = []
        for doc in docs:
            paper_data = doc.to_dict()
            paper_data['paper_id'] = doc.id
            papers.append(paper_data)
        
        return papers
        
    except Exception as e:
        logger.error(f"Error getting recent papers: {e}")
        return []


def get_storage_breakdown() -> Dict[str, int]:
    """
    Get storage breakdown by output type across all papers.
    Returns dict with total bytes per output type.
    """
    try:
        breakdown = {
            'videos': 0,
            'podcasts': 0,
            'reels': 0,
            'posters': 0,
            'slides': 0,
            'pdfs': 0,
            'business_briefs': 0,
            'other': 0
        }
        
        # Query all papers (in production, you'd want to use aggregation)
        docs = db.collection(PAPER_METADATA_COLLECTION).stream()
        
        for doc in docs:
            paper_data = doc.to_dict()
            outputs = paper_data.get('processing_outputs', {})
            
            for output_type, output_data in outputs.items():
                if isinstance(output_data, dict):
                    size = output_data.get('size_bytes', 0)
                    if output_type in breakdown:
                        breakdown[output_type] += size
                    else:
                        breakdown['other'] += size
        
        return breakdown
        
    except Exception as e:
        logger.error(f"Error getting storage breakdown: {e}")
        return {}


# ============================================================================
# Batch Operations
# ============================================================================

def batch_update_papers(updates: List[Dict[str, Any]]) -> bool:
    """
    Batch update multiple papers at once.
    Each update should have 'paper_id' and data to update.
    """
    try:
        batch = db.batch()
        
        for update in updates:
            paper_id = update.pop('paper_id')
            paper_ref = db.collection(PAPER_METADATA_COLLECTION).document(paper_id)
            batch.set(paper_ref, update, merge=True)
        
        batch.commit()
        logger.info(f"Batch updated {len(updates)} papers")
        return True
        
    except Exception as e:
        logger.error(f"Error in batch update: {e}")
        return False


# ============================================================================
# Pipeline Step Tracking (paper_pipeline collection)
# ============================================================================

def _extract_root_cause(error: Exception) -> str:
    """
    Extract a human-readable root cause from an exception.

    Inspects the error message (and its chain) for well-known service names so
    that the stored Firestore message says "Gemini API failure" instead of a
    raw Python traceback line.
    """
    raw = " ".join(str(arg) for arg in error.args).lower()

    patterns = [
        # API / quota issues
        (["quota", "resource_exhausted", "rate limit", "ratelimit", "too many requests"], "API quota / rate-limit exceeded"),
        (["api key", "apikey", "api_key", "invalid_api_key", "invalid api key"], "API key missing or invalid"),
        # Service-specific
        (["gemini"], "Gemini API failure"),
        (["sarvam"], "Sarvam TTS failure"),
        (["bhashini", "mt_bhashini"], "Bhashini TTS/translation failure"),
        # Infrastructure
        (["latex", "pdflatex", "xelatex", "compile"], "LaTeX compilation failure"),
        (["timeout", "timed out", "deadline"], "External service timeout"),
        (["connection", "connectionerror", "connection refused", "network"], "Network / connection failure"),
        (["permission", "unauthorized", "403", "401"], "Authentication / permission failure"),
        (["not found", "404"], "Resource not found"),
        (["memory", "out of memory", "oom"], "Out-of-memory error"),
    ]

    for keywords, label in patterns:
        if any(kw in raw for kw in keywords):
            return label

    # Fall back to the first non-empty line of the raw error string
    for line in str(error).splitlines():
        line = line.strip()
        if line:
            # Truncate to 200 chars to avoid huge strings in Firestore
            return line[:200]

    return "Unknown error"


def init_pipeline_tracking(paper_id: str, user_id: Optional[str] = None) -> bool:
    """
    Create or refresh the pipeline tracking document for a paper.
    Safe to call multiple times — uses merge=True.
    """
    try:
        doc_data: Dict[str, Any] = {
            'paper_id': paper_id,
            'created_at': datetime.now(),
            'updated_at': datetime.now(),
            'current_stage': 'uploaded',
            'last_successful_stage': 'uploaded',
            'stages': {},
        }
        if user_id:
            doc_data['user_id'] = user_id

        db.collection(PAPER_PIPELINE_COLLECTION).document(paper_id).set(
            doc_data, merge=True
        )
        logger.info(f"Initialized pipeline tracking for paper {paper_id}")
        return True

    except Exception as e:
        logger.error(f"Error initializing pipeline tracking for {paper_id}: {e}")
        return False


def update_pipeline_step(
    paper_id: str,
    step: str,
    metadata: Optional[Dict[str, Any]] = None,
    started_at: Optional[datetime] = None,
    status: str = "completed",
) -> bool:
    """
    Record a pipeline step result in the ``paper_pipeline`` Firestore collection.

    Parameters
    ----------
    paper_id:   The paper UUID.
    step:       Stage name, e.g. ``"script_generation"``, ``"slides_generation"``,
                ``"video_generation"``.
    metadata:   Arbitrary key/value pairs to store alongside the step
                (audience_level, language, template_type, video_path, …).
    started_at: When the step began; used to compute ``duration_seconds``.
    status:     ``"in_progress"``, ``"completed"``, or ``"failed"``.
    """
    try:
        now = datetime.now()
        step_data: Dict[str, Any] = {
            'status': status,
            'updated_at': now,
        }

        if status == "in_progress":
            step_data['started_at'] = now

        if status in ("completed", "failed"):
            step_data['completed_at'] = now
            if started_at is not None:
                step_data['duration_seconds'] = (now - started_at).total_seconds()

        if metadata:
            step_data.update(metadata)

        doc_update: Dict[str, Any] = {
            f'stages.{step}': step_data,
            'current_stage': step,
            'updated_at': now,
        }

        if status == "completed":
            doc_update['last_successful_stage'] = step

        db.collection(PAPER_PIPELINE_COLLECTION).document(paper_id).set(
            doc_update, merge=True
        )
        logger.info(f"Pipeline step '{step}' [{status}] recorded for paper {paper_id}")
        return True

    except Exception as e:
        logger.error(f"Error updating pipeline step '{step}' for {paper_id}: {e}")
        return False


def mark_pipeline_failed(
    paper_id: str,
    step: str,
    error: Exception,
    started_at: Optional[datetime] = None,
) -> bool:
    """
    Record a pipeline step failure, including the extracted root cause.

    Parameters
    ----------
    paper_id:   The paper UUID.
    step:       Stage name where the failure occurred.
    error:      The exception that was raised.
    started_at: When the step began; used to compute ``duration_seconds``.
    """
    try:
        root_cause = _extract_root_cause(error)
        now = datetime.now()

        step_data: Dict[str, Any] = {
            'status': 'failed',
            'completed_at': now,
            'updated_at': now,
            'error_root_cause': root_cause,
        }
        if started_at is not None:
            step_data['duration_seconds'] = (now - started_at).total_seconds()

        doc_update: Dict[str, Any] = {
            f'stages.{step}': step_data,
            'current_stage': f'{step}_failed',
            'updated_at': now,
        }

        db.collection(PAPER_PIPELINE_COLLECTION).document(paper_id).set(
            doc_update, merge=True
        )
        logger.info(
            f"Pipeline failure at '{step}' recorded for paper {paper_id}: {root_cause}"
        )
        return True

    except Exception as e:
        logger.error(f"Error recording pipeline failure for {paper_id}: {e}")
        return False
