import os
import uuid
import subprocess
import json
import shutil

from flask import Flask, render_template, request, send_from_directory, jsonify
from werkzeug.utils import secure_filename

from utils.video import remove_watermark_roi_to_frames

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(APP_ROOT, 'uploads')
OUTPUT_FOLDER = os.path.join(APP_ROOT, 'outputs')
TEMP_FOLDER = os.path.join(APP_ROOT, 'temp')
ALLOWED_EXTENSIONS = {'.mp4', '.mov', '.m4v', '.webm', '.avi', '.mkv'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
os.makedirs(TEMP_FOLDER, exist_ok=True)

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024 * 1024  # 2GB


def is_allowed(filename: str) -> bool:
    _, ext = os.path.splitext(filename.lower())
    return ext in ALLOWED_EXTENSIONS


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload():
    if 'video' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['video']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    if not is_allowed(file.filename):
        return jsonify({'error': 'Unsupported file type'}), 400

    filename = secure_filename(file.filename)
    unique_id = uuid.uuid4().hex
    base, ext = os.path.splitext(filename)
    stored_name = f"{base}_{unique_id}{ext}"
    save_path = os.path.join(UPLOAD_FOLDER, stored_name)
    file.save(save_path)

    return jsonify({
        'filename': stored_name,
        'videoUrl': f"/video/{stored_name}"
    })


@app.route('/video/<path:filename>')
def serve_video(filename):
    return send_from_directory(UPLOAD_FOLDER, filename, as_attachment=False)


@app.route('/download/<path:filename>')
def download_output(filename):
    return send_from_directory(OUTPUT_FOLDER, filename, as_attachment=True)


@app.route('/process', methods=['POST'])
def process():
    data = request.get_json(force=True)
    filename = data.get('filename')
    roi = data.get('roi')
    method = data.get('method', 'telea')
    quality = data.get('quality', 'best')

    if not filename or not roi:
        return jsonify({'error': 'filename and roi are required'}), 400

    input_path = os.path.join(UPLOAD_FOLDER, filename)
    if not os.path.exists(input_path):
        return jsonify({'error': 'File not found'}), 404

    # Paths
    output_basename = f"processed_{uuid.uuid4().hex}.mp4"
    frames_dir = os.path.join(TEMP_FOLDER, f"frames_{uuid.uuid4().hex}")
    output_path = os.path.join(OUTPUT_FOLDER, output_basename)

    try:
        # 1) Write lossless frames
        fps = remove_watermark_roi_to_frames(
            input_video_path=input_path,
            output_frames_dir=frames_dir,
            roi=(int(roi['x']), int(roi['y']), int(roi['width']), int(roi['height'])),
            inpaint_method=method
        )

        # 2) Determine scaling
        width, height = probe_resolution(input_path)
        scale_filter = build_scale_filter(width, height)

        # 3) Encode frames + mux original audio
        encode_frames_and_mux(frames_dir, fps, input_path, output_path, quality, scale_filter)

    except Exception as exc:
        return jsonify({'error': str(exc)}), 500
    finally:
        # Cleanup frames
        try:
            if os.path.isdir(frames_dir):
                shutil.rmtree(frames_dir)
        except Exception:
            pass

    return jsonify({
        'downloadUrl': f"/download/{output_basename}",
        'outputFilename': output_basename
    })


def probe_resolution(path: str):
    cmd = [
        'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        return (1920, 1080)
    try:
        info = json.loads(proc.stdout)
        stream = info['streams'][0]
        return (int(stream['width']), int(stream['height']))
    except Exception:
        return (1920, 1080)


def build_scale_filter(src_w: int, src_h: int) -> str:
    if src_h >= 2160:
        return 'scale=iw:ih:flags=lanczos'
    if src_h >= 1080:
        return 'scale=iw:ih:flags=lanczos'
    target_h = 1080
    target_w = int(round(src_w * (target_h / src_h)))
    if target_w % 2 == 1:
        target_w += 1
    return f'scale={target_w}:{target_h}:flags=lanczos'


def encode_frames_and_mux(frames_dir: str, fps: float, source_with_audio: str, output_path: str, quality: str, scale_filter: str) -> None:
    presets = {
        'fast': ('veryfast', '23'),
        'balanced': ('medium', '20'),
        'better': ('slow', '18'),
        'best': ('veryslow', '16'),
    }
    preset, crf = presets.get(quality, ('veryslow', '16'))

    # Input pattern for frames
    pattern = os.path.join(frames_dir, 'frame_%06d.png')

    cmd = [
        'ffmpeg', '-y',
        '-framerate', str(fps), '-i', pattern,
        '-i', source_with_audio,
        '-map', '0:v:0', '-map', '1:a:0?',
        '-filter:v', scale_filter,
        '-c:v', 'libx264', '-preset', preset, '-crf', crf,
        '-pix_fmt', 'yuv420p',
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
        '-movflags', '+faststart',
        '-c:a', 'aac', '-b:a', '192k',
        output_path
    ]
    run_ffmpeg(cmd)


def run_ffmpeg(cmd: list) -> None:
    env = os.environ.copy()
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr[:800]}")


if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000)
