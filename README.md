# Watermark Remover (Web)

A simple Flask-based web application to remove a rectangular watermark from videos using OpenCV inpainting, while preserving original audio. Upload a video, drag a rectangle over the watermark, and click Remove.

## Features
- Upload MP4/MOV/WEBM videos
- Draw ROI rectangle on the video to mark watermark area
- OpenCV Telea-based inpainting across all frames
- Original audio preserved via ffmpeg muxing

## Requirements
- Python 3.9+
- ffmpeg installed and available on PATH

## Setup
```bash
cd /Users/gokul/Projects/watermark-remover
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Then open http://127.0.0.1:5000 in your browser.

## Notes
- Processing time scales with video duration and resolution.
- ROI is applied consistently across all frames.
- If audio is missing, the output will be video-only.

## License
MIT
