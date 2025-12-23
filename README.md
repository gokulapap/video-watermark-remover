## Video Watermark Remover

A Flask-based web app to remove rectangular watermarks from videos. Upload a video, draw a rectangle over the watermark, and click Remove. Processing uses OpenCV inpainting and FFmpeg re-encoding while preserving audio.

## Video Demo

https://github.com/user-attachments/assets/e55500f7-f8d0-4087-8c1d-e5314c668d03


### Features
- **Upload**: MP4, MOV, WEBM, MKV, AVI
- **ROI selection**: Draw rectangle directly on the video overlay
- **Algorithms**: OpenCV Telea (fast) and Navier–Stokes (slower)
- **Quality modes**: Fast → Ultra (lossless), BT.709 tags, yuv420p for wide compatibility
- **Audio**: Original audio is preserved and muxed back
- **Responsive UI**: Drag-and-drop upload, progress bars, and toasts

### Requirements
- **Python**: 3.9+
- **FFmpeg**: Installed and available on PATH (`ffmpeg` and `ffprobe`)

On macOS using Homebrew:
```bash
brew install ffmpeg
```

### Quick Start
```bash
cd /Users/gokul/Projects/watermark-remover
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
python app.py
```
Open `http://127.0.0.1:5000` in your browser.

### Usage
1. **Upload**: Drag & drop a video or click Browse, then Upload.
2. **Select ROI**: When the video loads, draw a rectangle over the watermark.
3. **Method**: Choose Telea (default) or Navier–Stokes.
4. **Quality**: Pick from Fast, Balanced, Better, Best, or Ultra (lossless).
5. **Process**: Click Remove Watermark. When finished, download the result.

### Quality Modes
- **Fast**: x264 veryfast, CRF 23 (smaller, lower quality)
- **Balanced**: x264 medium, CRF 20
- **Better**: x264 slow, CRF 18
- **Best**: x264 veryslow, CRF 16 (near-lossless)
- **Ultra**: x264 placebo, QP 0 (lossless, very large files)

Scaling policy (current behavior):
- Keep 4K if input is 4K or higher
- If input is ≥1080p, keep as-is
- Otherwise upscale to 1080p (Lanczos)

### Project Structure
```text
watermark-remover/
  app.py                 # Flask app & processing orchestration
  requirements.txt       # Python dependencies
  templates/
    index.html           # UI
  static/
    app.js               # Frontend logic (upload, ROI, progress)
    style.css            # Styling
  utils/
    __init__.py
    video.py             # OpenCV inpainting utilities
  uploads/               # Uploaded videos (gitignored)
  outputs/               # Processed outputs (gitignored)
  temp/                  # Temp frames (gitignored)
  README.md
```

### API (for reference)
- **POST** `/upload`
  - multipart form-data `video`: file
  - returns `{ filename, videoUrl }`
- **GET** `/video/<filename>`: stream uploaded video
- **POST** `/process`
  - JSON body: `{ filename, roi: {x,y,width,height}, method, quality }`
  - returns `{ downloadUrl, outputFilename }`
- **GET** `/download/<filename>`: download processed file

### Troubleshooting
- **“ffmpeg failed”**: Ensure `ffmpeg`/`ffprobe` are installed and on PATH.
- **Upload too large**: Default limit is 2GB (`app.config['MAX_CONTENT_LENGTH']`).
- **Blurry patch**: Tighten ROI; try Navier–Stokes; choose higher quality.
- **Performance**: Ultra/Best are slow. Prefer Better for a good balance.

### Deployment
- Production example (gunicorn):
```bash
pip install gunicorn
export FLASK_ENV=production
gunicorn -w 2 -b 0.0.0.0:5000 app:app
```
- Put a reverse proxy (nginx) in front for TLS and static caching.

### Security & Privacy
- Files are stored locally in `uploads/`, interim frames in `temp/`, and results in `outputs/`.
- Clean up old files periodically if deploying to a server.

### License
MIT
