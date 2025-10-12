import os
from pathlib import Path
from moviepy.editor import AudioFileClip, VideoFileClip, concatenate_videoclips, CompositeVideoClip, TextClip
from moviepy.editor import AudioFileClip, VideoFileClip, concatenate_videoclips, CompositeVideoClip, TextClip
import wave

import subprocess
import shlex

def generate_dialogue_video(paper_id, audio_count, dialogues=None):
    # Ensure we're working with absolute paths and use 'gen' directory like podcasts
    backend_root = "/home/th4kur/Documents/SARAL-notvibing/backend"
    
    # Ensure gen directory exists (same as podcasts)
    gen_dir = os.path.join(backend_root, "gen")
    os.makedirs(gen_dir, exist_ok=True)
    
    # Still need temp/videos for intermediate files
    temp_videos_dir = os.path.join(backend_root, "temp", "videos")
    os.makedirs(temp_videos_dir, exist_ok=True)
    
    # Use new character assets
    female = "student.png"
    male = "pkExplains.png"
    
    # create two videos by overlaying each character (store in temp first)
    subprocess.run(shlex.split(f'ffmpeg -y -i {backend_root}/app/assets/bg2.mp4 -i {backend_root}/app/assets/{female} -filter_complex "[0:v][1:v] overlay=0:H-h:enable=\'between(t,0,60)\'" -pix_fmt yuv420p -c:a copy {temp_videos_dir}/a_video.mp4'))
    subprocess.run(shlex.split(f'ffmpeg -y -i {backend_root}/app/assets/bg2.mp4 -i {backend_root}/app/assets/{male} -filter_complex "[0:v][1:v] overlay=W-w:H-h:enable=\'between(t,0,60)\'" -pix_fmt yuv420p -c:a copy {temp_videos_dir}/k_video.mp4'))

    # then load both videos using absolute paths
    a_video = VideoFileClip(f"{temp_videos_dir}/a_video.mp4")
    k_video = VideoFileClip(f"{temp_videos_dir}/k_video.mp4")

    curstart = 0
    video_clips = []
    for i in range(audio_count):
        # 1. create audio clip using absolute path:
        if i%2:
            audio_clip = AudioFileClip(f"{backend_root}/temp/audio/{paper_id}/{i:02}_A.wav")
        else:
            audio_clip = AudioFileClip(f"{backend_root}/temp/audio/{paper_id}/{i:02}_K.wav")
        # 2. create video subclip:
        if i%2:
            video_clip = a_video.subclip(curstart, curstart+audio_clip.duration)
        else:
            video_clip = k_video.subclip(curstart, curstart+audio_clip.duration)
        curstart += audio_clip.duration
        # 3. combine the audio with the video
        video_clip = video_clip.set_audio(audio_clip)
        # 4. place the text on the video (optional, commented out for now)
        # if dialogues and i < len(dialogues):
        #     text_clip = TextClip(dialogues[i]["dialogue"])
        #     video_clip = CompositeVideoClip([video_clip, text_clip])
        
        video_clips.append(video_clip)

    final_video = concatenate_videoclips(video_clips, method="compose")
    # Save final output to 'gen' directory like podcasts do
    output_path = f"{gen_dir}/reel_output.mp4"
    final_video.write_videofile(output_path, fps=30, preset="ultrafast", threads=8)

    for clip in video_clips:
        clip.close()
    final_video.close()
    
    # Return the absolute path to the generated video in gen directory
    return output_path
