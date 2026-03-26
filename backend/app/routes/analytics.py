"""
Analytics API Endpoints

Provides user activity metrics and paper processing statistics.
All endpoints are authenticated and backward compatible.
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from typing import Dict, Any, List, Optional
import logging
from app.auth.dependencies import get_current_user
from app.firebase import db
from app.services.firestore_helpers import (
    get_user_activity,
    get_papers_by_user,
    get_paper_metadata,
    get_storage_breakdown,
    PAPER_METADATA_COLLECTION,
    USER_ACTIVITY_COLLECTION
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/user/{user_id}/summary")
async def get_user_summary(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get summary statistics for a specific user.
    
    Returns:
    - Total papers uploaded
    - Total videos generated
    - Total podcasts generated
    - Total reels generated
    - Total posters generated
    - Recent activity timestamp
    """
    # Verify user can only access their own data (or is admin)
    if current_user.get('id') != user_id and not current_user.get('admin', False):
        raise HTTPException(status_code=403, detail="Forbidden: Cannot access other user's data")
    
    try:
        summary = get_user_activity(user_id)
        
        if not summary:
            # Return default empty summary if user hasn't done anything
            return {
                "user_id": user_id,
                "total_papers": 0,
                "total_videos": 0,
                "total_podcasts": 0,
                "total_reels": 0,
                "total_posters": 0,
                "total_slides": 0,
                "total_business_briefs": 0,
                "last_activity": None
            }
        
        return summary
        
    except Exception as e:
        logger.error(f"Error fetching user summary for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching user summary: {str(e)}")


@router.get("/user/{user_id}/papers")
async def get_user_papers(
    user_id: str,
    limit: Optional[int] = 50,
    current_user: dict = Depends(get_current_user)
):
    """
    Get list of papers uploaded by a specific user.
    
    Args:
        user_id: Firebase user ID
        limit: Maximum number of papers to return (default 50)
    
    Returns:
        List of paper metadata with processing outputs
    """
    # Verify user can only access their own data (or is admin)
    if current_user.get('id') != user_id and not current_user.get('admin', False):
        raise HTTPException(status_code=403, detail="Forbidden: Cannot access other user's data")
    
    try:
        papers = get_papers_by_user(user_id, limit=limit)
        
        return {
            "user_id": user_id,
            "total_papers": len(papers),
            "papers": papers
        }
        
    except Exception as e:
        logger.error(f"Error fetching papers for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching papers: {str(e)}")


@router.get("/paper/{paper_id}/details")
async def get_paper_details(
    paper_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get detailed metadata for a specific paper.
    
    Returns:
    - Paper source information
    - Processing outputs (videos, podcasts, reels, posters, slides)
    - File sizes and storage info
    - User who uploaded it
    - Timestamps
    """
    try:
        paper_data = get_paper_metadata(paper_id)
        
        if not paper_data:
            raise HTTPException(status_code=404, detail=f"Paper {paper_id} not found")
        
        # Verify user owns this paper or is admin
        paper_user_id = paper_data.get('user_id')
        if paper_user_id and paper_user_id != current_user.get('id') and not current_user.get('admin', False):
            raise HTTPException(status_code=403, detail="Forbidden: Cannot access other user's papers")
        
        return paper_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching paper {paper_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching paper details: {str(e)}")


@router.get("/storage/breakdown")
async def get_storage_usage(
    current_user: dict = Depends(get_current_user)
):
    """
    Get storage usage breakdown by output type.
    
    Admin-only endpoint that returns:
    - Total storage used by videos
    - Total storage used by podcasts
    - Total storage used by reels
    - Total storage used by posters
    - Total storage used by papers
    - Overall total
    """
    # Only admins can view global storage stats
    if not current_user.get('admin', False):
        raise HTTPException(status_code=403, detail="Forbidden: Admin access required")
    
    try:
        breakdown = get_storage_breakdown()
        
        return {
            "storage_breakdown": breakdown,
            "total_bytes": sum(breakdown.values()),
            "total_gb": round(sum(breakdown.values()) / (1024**3), 2)
        }
        
    except Exception as e:
        logger.error(f"Error fetching storage breakdown: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching storage breakdown: {str(e)}")


@router.get("/user/{user_id}/storage")
async def get_user_storage(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get storage usage for a specific user.
    
    Returns storage breakdown by output type for this user's papers.
    """
    # Verify user can only access their own data (or is admin)
    if current_user.get('id') != user_id and not current_user.get('admin', False):
        raise HTTPException(status_code=403, detail="Forbidden: Cannot access other user's data")
    
    try:
        # Get all user's papers
        papers = get_papers_by_user(user_id, limit=1000)
        
        # Calculate storage breakdown
        storage_breakdown = {
            'videos': 0,
            'podcasts': 0,
            'reels': 0,
            'posters': 0,
            'slides': 0,
            'papers': 0,
            'business_briefs': 0
        }
        
        for paper in papers:
            temp_storage = paper.get('temp_storage', {})
            storage_breakdown['papers'] += temp_storage.get('total_size_bytes', 0)
            
            outputs = paper.get('processing_outputs', {})
            for output_type, output_data in outputs.items():
                if output_type in storage_breakdown and output_data.get('size_bytes'):
                    storage_breakdown[output_type] += output_data['size_bytes']
        
        total_bytes = sum(storage_breakdown.values())
        
        return {
            "user_id": user_id,
            "storage_breakdown": storage_breakdown,
            "total_bytes": total_bytes,
            "total_mb": round(total_bytes / (1024**2), 2),
            "total_gb": round(total_bytes / (1024**3), 3)
        }
        
    except Exception as e:
        logger.error(f"Error fetching storage for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching user storage: {str(e)}")


@router.get("/users/leaderboard")
async def get_user_leaderboard(
    metric: str = "total_papers",
    limit: int = 10,
    current_user: dict = Depends(get_current_user)
):
    """
    Get top users by a specific metric.
    
    Admin-only endpoint.
    
    Args:
        metric: Metric to sort by (total_papers, total_videos, total_podcasts, etc.)
        limit: Number of users to return
    
    Returns:
        List of users sorted by the specified metric
    """
    # Only admins can view leaderboards
    if not current_user.get('admin', False):
        raise HTTPException(status_code=403, detail="Forbidden: Admin access required")
    
    valid_metrics = [
        'total_papers', 'total_videos', 'total_podcasts',
        'total_reels', 'total_posters', 'total_slides',
        'total_business_briefs'
    ]
    
    if metric not in valid_metrics:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid metric. Must be one of: {', '.join(valid_metrics)}"
        )
    
    try:
        # Note: This requires a Firestore query with ordering
        # For now, return a placeholder
        return {
            "metric": metric,
            "limit": limit,
            "users": [],
            "note": "Leaderboard feature requires Firestore index creation"
        }
        
    except Exception as e:
        logger.error(f"Error fetching leaderboard: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching leaderboard: {str(e)}")


@router.get("/user/{user_id}/dashboard")
async def get_user_dashboard(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get comprehensive user activity dashboard.
    
    Returns:
    - Total papers by source type (pdf, arxiv, latex)
    - Total outputs by type (videos, reels, podcasts, posters)
    - Per-paper breakdown: paper_id, title, source_type, created_at, outputs list
    
    All data is queried live from paper_metadata collection,
    mapped via paper UUID.
    """
    # Verify user can only access their own data (or is admin)
    if current_user.get('id') != user_id and not current_user.get('admin', False):
        raise HTTPException(status_code=403, detail="Forbidden: Cannot access other user's data")
    
    try:
        papers = get_papers_by_user(user_id, limit=1000)
        
        # Aggregate by source type
        papers_by_source = {}
        # Aggregate outputs — dynamically count whatever exists
        total_outputs = {}
        
        paper_details = []
        
        for paper in papers:
            source_type = paper.get('source', {}).get('type', 'unknown')
            papers_by_source[source_type] = papers_by_source.get(source_type, 0) + 1
            
            # Get outputs for this paper
            processing_outputs = paper.get('processing_outputs', {})
            output_types = []
            for out_type, out_data in processing_outputs.items():
                if isinstance(out_data, dict):
                    output_types.append(out_type)
                    total_outputs[out_type] = total_outputs.get(out_type, 0) + 1
            
            # Get title from paper metadata
            title = paper.get('title')
            if not title:
                # Try to extract from nested metadata
                meta = paper.get('metadata', {})
                if isinstance(meta, dict):
                    title = meta.get('title')
            if not title:
                title = paper.get('source', {}).get('filename', 'untitled')
            
            # Get created_at timestamp
            created_at = paper.get('created_at')
            if hasattr(created_at, 'isoformat'):
                created_at = created_at.isoformat()
            
            paper_details.append({
                'paper_id': paper.get('paper_id', ''),
                'title': title,
                'source_type': source_type,
                'created_at': created_at,
                'outputs': output_types,
                'status': paper.get('status', 'unknown')
            })
        
        # Sort papers by created_at (newest first)
        paper_details.sort(key=lambda p: p.get('created_at') or '', reverse=True)
        
        return {
            "user_id": user_id,
            "total_papers": len(papers),
            "papers_by_source": papers_by_source,
            "total_outputs": total_outputs,
            "papers": paper_details
        }
        
    except Exception as e:
        logger.error(f"Error fetching user dashboard for {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching dashboard: {str(e)}")


@router.get("/platform/stats")
async def get_platform_stats(
    current_user: dict = Depends(get_current_user)
):
    """
    Get platform-wide cumulative statistics.
    
    - users: total unique users (from Firebase Auth)
    - logins: cumulative logins across all users
    - papers: total papers uploaded
    - videos/reels/podcasts/posters: counted from paper_metadata.processing_outputs
    """
    try:
        # Count total unique users from Firebase Auth
        import firebase_admin.auth as firebase_auth
        total_users = 0
        page = firebase_auth.list_users()
        while page:
            total_users += len(page.users)
            page = page.get_next_page()
        
        # Aggregate logins from user_activity_summary (across ALL users)
        user_docs = db.collection(USER_ACTIVITY_COLLECTION).stream()
        total_logins = 0
        for doc in user_docs:
            data = doc.to_dict()
            total_logins += data.get('total_logins', 0)
        
        # Count papers and outputs from paper_metadata (source of truth)
        paper_docs = db.collection(PAPER_METADATA_COLLECTION).stream()
        total_papers = 0
        output_counts = {}  # dynamic: {'video': 3, 'reels': 2, ...}
        
        for doc in paper_docs:
            total_papers += 1
            data = doc.to_dict()
            processing_outputs = data.get('processing_outputs', {})
            for out_type, out_data in processing_outputs.items():
                if isinstance(out_data, dict):
                    output_counts[out_type] = output_counts.get(out_type, 0) + 1
        
        return {
            "users": total_users,
            "logins": total_logins,
            "papers": total_papers,
            "videos": output_counts.get('video', 0),
            "reels": output_counts.get('reels', 0),
            "podcasts": output_counts.get('podcast', 0),
            "posters": output_counts.get('poster', 0),
            "business_briefs": output_counts.get('business_brief', 0)
        }
        
    except Exception as e:
        logger.error(f"Error fetching platform stats: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching platform stats: {str(e)}")

