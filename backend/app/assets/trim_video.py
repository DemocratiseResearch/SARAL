from moviepy.editor import AudioFileClip, VideoFileClip, concatenate_videoclips, CompositeAudioClip
import wave

raw_video = VideoFileClip("bg.mp4")

video_clip = raw_video.subclip(0, 60)
video_clip.write_videofile("bg2.mp4", fps=30, preset="ultrafast", threads=8)
