import os
from pathlib import Path
from typing import List, Optional
from moviepy.editor import ImageClip, concatenate_videoclips, AudioFileClip, CompositeAudioClip
import wave
import subprocess
from app.utils.timing import track_performance
from app.utils import gpu_utils  # Import module instead of function

@track_performance
def validate_audio_file_for_video(audio_path: str) -> bool:
    """Validate audio file before using in video creation."""
    try:
        if not os.path.exists(audio_path):
            print(f"Audio file does not exist: {audio_path}")
            return False
        
        # Check file size
        file_size = os.path.getsize(audio_path)
        if file_size < 1000:
            print(f"Audio file too small ({file_size} bytes): {audio_path}")
            return False
        
        # Try to read with wave module
        try:
            with wave.open(audio_path, 'rb') as wav_file:
                frames = wav_file.getnframes()
                sample_rate = wav_file.getframerate()
                channels = wav_file.getnchannels()
                duration = frames / sample_rate if sample_rate > 0 else 0
                
                if frames == 0 or sample_rate == 0 or duration == 0:
                    print(f"Invalid audio parameters: {audio_path}")
                    return False
                
                print(f"Audio validated: {duration:.2f}s, {sample_rate}Hz, {channels}ch")
                return True
                
        except wave.Error as e:
            print(f"Wave validation failed for {audio_path}: {e}")
            return False
            
    except Exception as e:
        print(f"Error validating audio file {audio_path}: {e}")
        return False

@track_performance
def repair_audio_with_ffmpeg(audio_path: str) -> bool:
    """Repair corrupted audio file using FFmpeg."""
    try:
        backup_path = audio_path + ".backup"
        temp_path = audio_path + ".temp"
        
        # Backup original
        os.rename(audio_path, backup_path)
        
        # Repair with FFmpeg
        cmd = [
            'ffmpeg', '-y',
            '-err_detect', 'ignore_err',
            '-i', backup_path,
            '-c:a', 'pcm_s16le',
            '-ar', '22050',
            '-ac', '1',
            temp_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0 and os.path.exists(temp_path):
            # Replace with repaired version
            os.rename(temp_path, audio_path)
            os.remove(backup_path)
            print(f"Repaired audio file: {audio_path}")
            return True
        else:
            # Restore backup
            os.rename(backup_path, audio_path)
            print(f"Failed to repair {audio_path}: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"Error repairing audio: {e}")
        return False

@track_performance
def create_safe_audio_clip(audio_path: str) -> Optional[AudioFileClip]:
    """Safely create AudioFileClip with validation and repair attempts."""
    try:
        # First validate the audio file
        if not validate_audio_file_for_video(audio_path):
            print(f"Audio validation failed, attempting repair: {audio_path}")
            if repair_audio_with_ffmpeg(audio_path):
                print(f"Audio repair successful: {audio_path}")
            else:
                print(f"Audio repair failed: {audio_path}")
                return None
        
        # Try to create AudioFileClip
        try:
            audio_clip = AudioFileClip(audio_path)
            
            # Validate duration
            if audio_clip.duration is None or audio_clip.duration <= 0:
                print(f"Invalid duration for audio: {audio_path}")
                audio_clip.close()
                return None
            
            print(f"Successfully loaded audio: {audio_path} (duration: {audio_clip.duration:.2f}s)")
            return audio_clip
            
        except Exception as e:
            print(f"MoviePy failed to load audio {audio_path}: {e}")
            # Attempt repair and retry
            if repair_audio_with_ffmpeg(audio_path):
                try:
                    audio_clip = AudioFileClip(audio_path)
                    if audio_clip.duration is None or audio_clip.duration <= 0:
                        audio_clip.close()
                        return None
                    print(f"Successfully loaded repaired audio: {audio_path}")
                    return audio_clip
                except Exception as e2:
                    print(f"Failed to load even after repair: {e2}")
                    return None
            return None
            
    except Exception as e:
        print(f"Error creating audio clip for {audio_path}: {e}")
        return None

@track_performance
def create_video_with_audio(
    slide_images: List[str],
    audio_files: List[str],
    background_music_file: Optional[str] = None,
    output_file: str = "output_video.mp4"
) -> str:
    """Create video from slide images and audio files with improved error handling."""
    video_clips = []
    final_video = None
    background_music = None
    
    try:
        successful_clips = 0
        
        # Filter out invalid audio files first
        valid_audio_files = []
        for audio_path in audio_files:
            if validate_audio_file_for_video(audio_path):
                valid_audio_files.append(audio_path)
            else:
                print(f"Skipping invalid audio file: {audio_path}")
        
        if not valid_audio_files:
            raise Exception("No valid audio files found")
        
        # Ensure we have matching slides for valid audio files
        min_length = min(len(slide_images), len(valid_audio_files))
        print(f"Creating video with {min_length} slides and audio clips")
        
        for i in range(min_length):
            slide_path = slide_images[i]
            audio_path = valid_audio_files[i]
            
            if not os.path.exists(slide_path):
                print(f"Warning: Slide image not found: {slide_path}")
                continue
            
            # Create audio clip safely
            audio_clip = create_safe_audio_clip(audio_path)
            if audio_clip is None:
                print(f"Warning: Failed to load audio file: {audio_path}")
                continue
            
            duration = audio_clip.duration
            print(f"Processing slide {i+1}: {os.path.basename(slide_path)} with duration {duration:.2f}s")
            
            image_clip = None
            try:
                # Create image clip with audio duration
                image_clip = ImageClip(slide_path, duration=duration)
                
                # Set audio to image clip (audio_clip is now owned by image_clip)
                image_clip = image_clip.set_audio(audio_clip)
                video_clips.append(image_clip)
                successful_clips += 1
                
            except Exception as e:
                print(f"Error processing slide {i+1}: {e}")
                # CRITICAL: Clean up - if image_clip creation failed, close audio_clip
                # If image_clip succeeded, it owns the audio_clip, so only close image_clip
                if image_clip is not None:
                    try:
                        image_clip.close()
                    except:
                        pass
                elif audio_clip is not None:
                    try:
                        audio_clip.close()
                    except:
                        pass
                continue
        
        if not video_clips:
            raise Exception("No valid video clips created")
        
        print(f"Successfully created {successful_clips} video clips")
        
        # Concatenate all clips - this creates a NEW composite clip
        final_video = concatenate_videoclips(video_clips, method="compose")
        
        # IMPORTANT: Close individual clips immediately after concatenation
        # The final_video now has its own references to the underlying data
        print("Closing individual video clips after concatenation...")
        for clip in video_clips:
            try:
                clip.close()
            except Exception as e:
                print(f"Warning: Error closing individual clip: {e}")
        video_clips = []  # Clear the list
        
        # Add background music if provided
        if background_music_file and os.path.exists(background_music_file):
            try:
                background_music = AudioFileClip(background_music_file)
                
                # Loop background music to match video duration
                if background_music.duration < final_video.duration:
                    loops_needed = int(final_video.duration / background_music.duration) + 1
                    background_music = background_music.loop(n=loops_needed)
                
                # Set background music volume lower
                background_music = background_music.volumex(0.1)
                
                # Trim background music to video duration
                background_music = background_music.subclip(0, final_video.duration)
                
                # Composite audio
                final_audio = CompositeAudioClip([final_video.audio, background_music])
                final_video = final_video.set_audio(final_audio)
                
                print("Added background music to video")
                
            except Exception as e:
                print(f"Warning: Could not add background music: {e}")
                # Clean up background music on error
                if background_music is not None:
                    try:
                        background_music.close()
                    except:
                        pass
                    background_music = None
        
        # Write the final video
        print(f"Writing video to: {output_file}")

        # Ensure dimensions are even (required by some codecs)
        final_video = final_video.resize(
            newsize=(
                final_video.w // 2 * 2,
                final_video.h // 2 * 2
            )
        )

        # Get GPU-aware encoding configuration (automatically uses NVIDIA GPU if available, falls back to CPU)
        encoding_config = gpu_utils.get_video_encoding_config()
        
        # Try GPU encoding first, fallback to CPU if it fails
        write_success = False
        for attempt in [1, 2]:
            try:
                if attempt == 2:
                    # Force CPU encoding on second attempt
                    print("⚠️  GPU encoding failed, falling back to CPU encoding...")
                    encoding_config = {
                        "codec": "libx264",
                        "preset": "medium",
                        "threads": 4,
                        "ffmpeg_params": [
                            "-pix_fmt", "yuv420p",
                            "-profile:v", "main",
                            "-level", "3.1",
                            "-movflags", "+faststart",
                        ],
                        "hardware": "CPU (fallback)",
                    }
                
                # Write video file
                final_video.write_videofile(
                    output_file,
                    fps=1,  
                    codec=encoding_config["codec"],
                    audio_codec='aac',
                    temp_audiofile='temp-audio.m4a',
                    remove_temp=True,
                    preset=encoding_config.get("preset"),
                    threads=encoding_config.get("threads"),
                    ffmpeg_params=encoding_config["ffmpeg_params"],
                    logger=None
                )
                write_success = True
                break  # Success, exit loop
                
            except (IOError, OSError) as e:
                error_msg = str(e)
                # Check if it's an NVENC-specific error
                if attempt == 1 and ('nvenc' in error_msg.lower() or 'encoder not found' in error_msg.lower()):
                    print(f"GPU encoding error: {error_msg}")
                    continue  # Try again with CPU
                else:
                    # Not a GPU error or already on second attempt, re-raise
                    raise
        
        if not write_success:
            raise RuntimeError("Failed to write video with both GPU and CPU encoding")
        
        print(f"Video created successfully: {output_file}")
        return output_file
        
    except Exception as e:
        print(f"Error creating video: {e}")
        import traceback
        traceback.print_exc()
        raise
        
    finally:
        # CRITICAL: Always clean up resources in finally block to prevent leaks
        print("Cleaning up all resources...")
        
        # Close individual clips if still in memory
        if video_clips:
            for clip in video_clips:
                try:
                    clip.close()
                except Exception as e:
                    print(f"Warning: Error closing clip: {e}")
        
        # Close background music
        if background_music is not None:
            try:
                background_music.close()
            except Exception as e:
                print(f"Warning: Error closing background music: {e}")
        
        # Close final video
        if final_video is not None:
            try:
                final_video.close()
            except Exception as e:
                print(f"Warning: Error closing final video: {e}")
        
        print("Resource cleanup complete")
