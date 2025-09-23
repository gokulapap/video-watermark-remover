import cv2
import numpy as np
from typing import Tuple
import os


def remove_watermark_roi(input_video_path: str, output_video_path: str, roi: Tuple[int, int, int, int], inpaint_method: str = 'telea') -> None:
    """Remove a rectangular watermark using inpainting across all frames and write a temporary video.

    Note: This writes a lossy intermediate. Prefer remove_watermark_roi_to_frames for best quality.
    """
    cap = cv2.VideoCapture(input_video_path)
    if not cap.isOpened():
        raise RuntimeError('Failed to open input video')

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')

    out = cv2.VideoWriter(output_video_path, fourcc, fps, (width, height))
    if not out.isOpened():
        cap.release()
        raise RuntimeError('Failed to open output video for writing')

    x, y, w, h = roi
    x = max(0, min(x, width - 1))
    y = max(0, min(y, height - 1))
    w = max(1, min(w, width - x))
    h = max(1, min(h, height - y))

    flags = cv2.INPAINT_TELEA if inpaint_method.lower() == 'telea' else cv2.INPAINT_NS

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        mask = np.zeros((height, width), dtype=np.uint8)
        mask[y:y+h, x:x+w] = 255
        inpainted = cv2.inpaint(frame, mask, 3, flags)
        out.write(inpainted)

    cap.release()
    out.release()


def remove_watermark_roi_to_frames(input_video_path: str, output_frames_dir: str, roi: Tuple[int, int, int, int], inpaint_method: str = 'telea') -> float:
    """Remove watermark and write lossless PNG frames to a directory.

    Returns:
        fps (float): frames per second of the source video for proper encoding later.
    """
    os.makedirs(output_frames_dir, exist_ok=True)

    cap = cv2.VideoCapture(input_video_path)
    if not cap.isOpened():
        raise RuntimeError('Failed to open input video')

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0

    x, y, w, h = roi
    x = max(0, min(x, width - 1))
    y = max(0, min(y, height - 1))
    w = max(1, min(w, width - x))
    h = max(1, min(h, height - y))

    flags = cv2.INPAINT_TELEA if inpaint_method.lower() == 'telea' else cv2.INPAINT_NS

    idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        mask = np.zeros((height, width), dtype=np.uint8)
        mask[y:y+h, x:x+w] = 255
        inpainted = cv2.inpaint(frame, mask, 3, flags)
        # Write as PNG (lossless)
        fname = os.path.join(output_frames_dir, f"frame_{idx:06d}.png")
        ok = cv2.imwrite(fname, inpainted)
        if not ok:
            cap.release()
            raise RuntimeError(f'Failed to write frame {fname}')
        idx += 1

    cap.release()
    return float(fps)
