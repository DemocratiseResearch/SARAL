import os
from pathlib import Path
from moviepy.editor import AudioFileClip, VideoFileClip, concatenate_videoclips, CompositeAudioClip
import wave

import subprocess
import shlex

# create two videos by overlaying each character
subprocess.run(shlex.split('ffmpeg -y -i ../assets/bg2.mp4 -i ../assets/female.png -filter_complex "[0:v][1:v] overlay=0:H-h:enable=\'between(t,0,20)\'" -pix_fmt yuv420p -c:a copy ../../temp/videos/a_video.mp4'))
subprocess.run(shlex.split('ffmpeg -y -i ../assets/bg2.mp4 -i ../assets/male.png -filter_complex "[0:v][1:v] overlay=W-w:H-h:enable=\'between(t,0,20)\'" -pix_fmt yuv420p -c:a copy ../../temp/videos/k_video.mp4'))

# then load both videos
a_video = VideoFileClip("../../temp/videos/a_video.mp4")
k_video = VideoFileClip("../../temp/videos/k_video.mp4")

curstart = 0
video_clips = []
for i in range(2):
    # 1. create audio clip:
    if i%2:
        audio_clip = AudioFileClip(f"../assets/a{i}.wav")
    else:
        audio_clip = AudioFileClip(f"../assets/k{i+1}.wav")
    # 2. create video subclip:
    if i%2:
        video_clip = a_video.subclip(curstart, curstart+audio_clip.duration)
    else:
        video_clip = k_video.subclip(curstart, curstart+audio_clip.duration)
    curstart += audio_clip.duration
    # 3. combine the audio with the video
    video_clip = video_clip.set_audio(audio_clip)
    video_clips.append(video_clip)


final_video = concatenate_videoclips(video_clips, method="compose")
final_video.write_videofile("../../temp/videos/output.mp4", fps=30, preset="ultrafast", threads=8)

for clip in video_clips:
    clip.close()
final_video.close()
