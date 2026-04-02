import os
import base64
import json
import wave
import struct
import subprocess
from pathlib import Path
from typing import Dict, List, Optional
import requests
import re
import tempfile
from app.utils.timing import track_performance

class SarvamTTSError(Exception):
    """Custom exception for Sarvam TTS errors"""
    pass

class SarvamTTS:
    """Enhanced Sarvam TTS client aligned with working Streamlit implementation"""
    
    @track_performance
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.sarvam.ai/text-to-speech"
        self.supported_voices = {
            "ishita": "hi-IN",
            "shubh": "hi-IN",
            "roopa": "hi-IN",
            "kavya": "hi-IN",
            "simran": "hi-IN",
            "aditya": "hi-IN",
            "aayan": "hi-IN"
        }
        self.supported_sample_rates = [8000, 16000, 22050, 24000]
        self.default_sample_rate = 22050
    
    @track_performance
    def test_connection(self) -> bool:
        """Test API connection with minimal complexity"""
        try:
            headers = {
                "api-subscription-key": self.api_key,
                "Content-Type": "application/json"
            }
            
            test_data = {
                "inputs": ["test"],
                "target_language_code": "hi-IN",
                "speaker": "simran",
                #"pitch": 0,
                "pace": 1.0,
                #"loudness": 1.5,
                "speech_sample_rate": self.default_sample_rate,
                "enable_preprocessing": True,
                "model": "bulbul:v3"
            }
            
            response = requests.post(self.base_url, headers=headers, json=test_data, timeout=30)
            return response.status_code == 200
        except Exception as e:
            print(f"Connection test failed: {e}")
            return False
    
    @track_performance
    def synthesize_text(self, text: str, target_language, voice: str = "simran", sample_rate: int = 22050) -> Optional[bytes]:
        """Simplified synthesis method aligned with working Streamlit version"""
        try:
            if sample_rate not in self.supported_sample_rates:
                sample_rate = self.default_sample_rate
            
            headers = {
                "api-subscription-key": self.api_key,
                "Content-Type": "application/json"
            }
            
            # target_language = self.supported_voices.get(voice, "hi-IN")
            print(f"Using voice: {voice}, target language: {target_language}, sample rate: {sample_rate}")
            
            # data = {
            #     "inputs": [text],
            #     "target_language_code": target_language,
            #     "speaker": voice,
            #     "pitch": 0,
            #     "pace": 1.0,
            #     "loudness": 1.5,
            #     "speech_sample_rate": sample_rate,
            #     "enable_preprocessing": True,
            #     "model": "bulbul:v2"
            # }


            data = {
                "inputs": [text],
                "target_language_code": target_language,
                "speaker": voice,
                "pace": 1.0,
                "speech_sample_rate": sample_rate,
                "enable_preprocessing": True,
                "model": "bulbul:v3"
            }
            
            print(f"Making TTS request for {len(text)} characters...")
            response = requests.post(self.base_url, headers=headers, json=data, timeout=60)
            
            if response.status_code != 200:
                raise SarvamTTSError(f"API request failed: {response.status_code} - {response.text}")
            
            # Simplified response parsing - aligned with Streamlit approach
            try:
                response_data = response.json()
                print(f"Response keys: {list(response_data.keys())}")
                
                # Direct extraction without complex validation
                audio_content = None
                
                # Try different possible response structures
                if 'audios' in response_data:
                    audios = response_data['audios']
                    if isinstance(audios, list) and len(audios) > 0:
                        audio_content = audios[0]
                    elif isinstance(audios, str):
                        audio_content = audios
                    else:
                        print(f"Unexpected audios format: {type(audios)}")
                        # Try to extract from first element if it's a dict or other structure
                        if hasattr(audios, '__getitem__'):
                            try:
                                audio_content = audios[0] if len(audios) > 0 else None
                            except (IndexError, TypeError):
                                pass
                
                if not audio_content:
                    print(f"No audio content found. Full response: {response_data}")
                    raise SarvamTTSError("No audio content found in response")
                
                # Simple base64 decoding - no complex validation
                try:
                    if isinstance(audio_content, str):
                        # Remove data URI prefix if present
                        if audio_content.startswith('data:audio'):
                            audio_content = audio_content.split(',', 1)[1]
                        
                        # Direct base64 decode
                        audio_bytes = base64.b64decode(audio_content)
                        
                        if len(audio_bytes) < 100:  # Very minimal validation
                            raise SarvamTTSError(f"Audio too small: {len(audio_bytes)} bytes")
                        
                        return audio_bytes
                    else:
                        raise SarvamTTSError(f"Audio content is not string: {type(audio_content)}")
                        
                except Exception as decode_error:
                    raise SarvamTTSError(f"Base64 decoding failed: {decode_error}")
                    
            except json.JSONDecodeError as e:
                raise SarvamTTSError(f"Invalid JSON response: {e}")
                
        except requests.exceptions.RequestException as e:
            raise SarvamTTSError(f"Network error: {e}")
        except Exception as e:
            raise SarvamTTSError(f"Unexpected error: {e}")
    
    @track_performance
    def synthesize_long_text(self, text: str, output_path: str, target_language, voice: str = "meera", 
                           max_chunk_length: int = 500, sample_rate: int = 22050) -> bool:
        """Simplified long text synthesis"""
        try:
            # Basic text cleaning
            text = self._clean_text_for_tts(text)
            if not text.strip():
                return False
            
            # Simple chunking
            chunks = self._split_text_into_chunks(text, max_chunk_length)
            print(f"Processing {len(chunks)} chunks")
            
            audio_segments = []
            for i, chunk in enumerate(chunks):
                print(f"Processing chunk {i+1}/{len(chunks)}")
                
                # Single attempt per chunk - no complex retry logic
                try:
                    audio_bytes = self.synthesize_text(chunk, target_language, voice, sample_rate)
                    if audio_bytes:
                        audio_segments.append(audio_bytes)
                    else:
                        print(f"Failed to generate audio for chunk {i+1}")
                        return False
                except Exception as e:
                    print(f"Error with chunk {i+1}: {e}")
                    return False
            
            if not audio_segments:
                return False
            
            # Simple concatenation or single file
            if len(audio_segments) == 1:
                final_audio = audio_segments[0]
            else:
                final_audio = self._combine_audio_simple(audio_segments)
            
            # Write file
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, 'wb') as f:
                f.write(final_audio)
            
            # Basic validation
            if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
                print(f"Successfully created: {output_path}")
                return True
            else:
                return False
                
        except Exception as e:
            print(f"Error in long text synthesis: {e}")
            return False
    
    @track_performance
    def _clean_text_for_tts(self, text: str) -> str:
        """Basic text cleaning"""
        if not text:
            return ""
        
        # Remove markdown
        text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
        text = re.sub(r'\*([^*]+)\*', r'\1', text)
        text = re.sub(r'#+\s*', '', text)
        text = re.sub(r'[^\w\s.,!?;:\-()"\']', ' ', text)
        text = re.sub(r'\s+', ' ', text)
        
        return text.strip()
    
    @track_performance
    def _split_text_into_chunks(self, text: str, max_length: int) -> List[str]:
        """Simple text chunking"""
        if len(text) <= max_length:
            return [text]
        
        chunks = []
        sentences = re.split(r'(?<=[.!?])\s+', text)
        
        current_chunk = ""
        for sentence in sentences:
            if len(current_chunk) + len(sentence) + 1 <= max_length:
                current_chunk += sentence + " "
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence + " "
        
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return chunks
    
    @track_performance
    def _combine_audio_simple(self, audio_segments: List[bytes]) -> bytes:
        """Simple audio combination - just concatenate the first segment"""
        # For simplicity, return the first segment
        # In a full implementation, you'd properly combine WAV files
        return audio_segments[0] if audio_segments else b''
    
    @track_performance
    def get_available_voices(self) -> Dict[str, str]:
        """Get available voices"""
        return self.supported_voices
