import json
import os
import uuid
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
import aiofiles
from app.utils.timing import track_performance

class SessionManager:

    @track_performance
    def __init__(self, session_dir: str = "temp/sessions"):
        self.session_dir = Path(session_dir)
        self.session_dir.mkdir(parents=True, exist_ok=True)
        self.active_sessions: Dict[str, datetime] = {}
        self.session_timeout = timedelta(hours=24)  # 24 hour session timeout
    
    @track_performance
    def create_session(self) -> str:
        """Create a new session ID."""
        session_id = str(uuid.uuid4())
        self.active_sessions[session_id] = datetime.now()
        return session_id
    
    @track_performance
    def is_valid_session(self, session_id: str) -> bool:
        """Check if session is valid and not expired."""
        if not session_id or session_id not in self.active_sessions:
            return False
        
        # Check if session has expired
        if datetime.now() - self.active_sessions[session_id] > self.session_timeout:
            self.cleanup_session(session_id)
            return False
        
        # Update last access time
        self.active_sessions[session_id] = datetime.now()
        return True
    
    @track_performance
    def get_session_file(self, session_id: str, data_type: str) -> Path:
        """Get the file path for session data."""
        session_dir = self.session_dir / session_id
        session_dir.mkdir(exist_ok=True)
        return session_dir / f"{data_type}.json"
    
    @track_performance
    async def save_session_data(self, session_id: str, data_type: str, data: Any):
        """Save data for a specific session."""
        file_path = self.get_session_file(session_id, data_type)
        async with aiofiles.open(file_path, 'w') as f:
            await f.write(json.dumps(data, default=str, indent=2))
    
    @track_performance
    async def load_session_data(self, session_id: str, data_type: str) -> Optional[Dict]:
        """Load data for a specific session."""
        file_path = self.get_session_file(session_id, data_type)
        if not file_path.exists():
            return None
        
        try:
            async with aiofiles.open(file_path, 'r') as f:
                content = await f.read()
                return json.loads(content)
        except Exception as e:
            print(f"Error loading session data: {e}")
            return None
    
    @track_performance
    def cleanup_session(self, session_id: str):
        """Remove expired session data."""
        if session_id in self.active_sessions:
            del self.active_sessions[session_id]
        
        # Optionally delete session files
        session_dir = self.session_dir / session_id
        if session_dir.exists():
            import shutil
            shutil.rmtree(session_dir, ignore_errors=True)

# Global session manager instance
session_manager = SessionManager()
