import redis
import os
from typing import Literal
from app.utils.timing import track_performance
import logging
class VoiceRotationManager:
    """
    Centralized voice rotation manager using Redis for production-safe state.
    Implements round-robin rotation for male and female voices.
    """
    
    # Voice pools
    MALE_VOICES = ["aditya", "shubh", "aayan"]  
    FEMALE_VOICES = ["simran", "roopa", "ishita"]
    logging.basicConfig(level=logging.DEBUG)
    logger=logging.getLogger(__name__)
    
    @track_performance
    def __init__(self):
        # Connect to Redis (same instance used by ARQ workers)
        redis_host = os.getenv("REDIS_HOST", "localhost")
        redis_port = int(os.getenv("REDIS_PORT", 6379))
        self.redis_client = redis.Redis(
            host=redis_host, 
            port=redis_port, 
            db=0, 
            decode_responses=True
        )
        
        # Initialize counters if they don't exist
        if not self.redis_client.exists("voice:male:counter"):
            self.redis_client.set("voice:male:counter", 0)
        if not self.redis_client.exists("voice:female:counter"):
            self.redis_client.set("voice:female:counter", 0)
    
    @track_performance
    def get_next_voice(self, gender: Literal["male", "female"]) -> str:
        """
        Get next voice in round-robin fashion.
        Thread-safe and works across multiple servers.
        """
        voice_pool = self.MALE_VOICES if gender == "male" else self.FEMALE_VOICES
        counter_key = f"voice:{gender}:counter"
        
        # Atomic increment and get
        counter = self.redis_client.incr(counter_key)
        
        # Round-robin: use modulo to cycle through voices
        index = (counter - 1) % len(voice_pool)
        voice = voice_pool[index]
        
        print(f"[VoiceManager] Selected {gender} voice: {voice} (rotation #{counter})")
        self.logger.info(f"[VoiceManager] Selected {gender} voice: {voice} (rotation #{counter})")
        return voice
    
    @track_performance
    def get_voice_pair(self) -> tuple[str, str]:
        """
        Get a matched pair of male and female voices.
        Useful for podcasts/reels with alternating speakers.
        """
        male_voice = self.get_next_voice("male")
        female_voice = self.get_next_voice("female")
        return male_voice, female_voice

# Global instance
voice_manager = VoiceRotationManager()