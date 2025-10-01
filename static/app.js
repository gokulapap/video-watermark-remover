const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadStatus = document.getElementById('uploadStatus');
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const methodSelect = document.getElementById('method');
const qualitySelect = document.getElementById('quality');
const clearRoiBtn = document.getElementById('clearRoi');
const processBtn = document.getElementById('processBtn');
const processStatus = document.getElementById('processStatus');
const downloadLink = document.getElementById('downloadLink');

let uploadedFilename = null;
let isDrawing = false;
let startX = 0, startY = 0;
let roi = null; // {x, y, width, height} in video pixel coordinates

// Ensure default quality is ultra if not set by DOM
if (qualitySelect && !qualitySelect.value) {
  qualitySelect.value = 'ultra';
}

function fitCanvasToVideo() {
  // Size the canvas to the rendered video box (within wrapper)
  const w = video.clientWidth || video.videoWidth;
  const h = video.clientHeight || video.videoHeight;
  if (!w || !h) return;
  overlay.width = w;
  overlay.height = h;
  overlay.style.width = w + 'px';
  overlay.style.height = h + 'px';
  overlay.style.left = '0px';
  overlay.style.top = '0px';
}

function drawOverlay() {
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!roi) return;
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  const scaleX = overlay.width / video.videoWidth;
  const scaleY = overlay.height / video.videoHeight;
  ctx.strokeRect(roi.x * scaleX, roi.y * scaleY, roi.width * scaleX, roi.height * scaleY);
}

window.addEventListener('resize', () => {
  fitCanvasToVideo();
  drawOverlay();
});

video.addEventListener('loadedmetadata', () => {
  fitCanvasToVideo();
  processBtn.disabled = !uploadedFilename;
});

uploadBtn.addEventListener('click', async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) {
    uploadStatus.textContent = 'Select a video first.';
    return;
  }
  uploadStatus.textContent = 'Uploading...';
  const form = new FormData();
  form.append('video', file);
  try {
    const res = await fetch('/upload', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    uploadedFilename = data.filename;
    video.src = data.videoUrl;
    uploadStatus.textContent = 'Uploaded.';
    processBtn.disabled = false;
    // Wait a tick for layout, then fit canvas
    setTimeout(() => { fitCanvasToVideo(); drawOverlay(); }, 50);
  } catch (e) {
    uploadStatus.textContent = 'Error: ' + e.message;
  }
});

function getMousePos(evt) {
  const rect = overlay.getBoundingClientRect();
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}

overlay.addEventListener('mousedown', (e) => {
  if (!video.videoWidth) return;
  isDrawing = true;
  const p = getMousePos(e);
  startX = p.x;
  startY = p.y;
  roi = { x: 0, y: 0, width: 0, height: 0 };
});

overlay.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;
  const p = getMousePos(e);
  const x = Math.min(p.x, startX);
  const y = Math.min(p.y, startY);
  const w = Math.abs(p.x - startX);
  const h = Math.abs(p.y - startY);

  const scaleX = video.videoWidth / overlay.width;
  const scaleY = video.videoHeight / overlay.height;
  roi = {
    x: Math.round(x * scaleX),
    y: Math.round(y * scaleY),
    width: Math.round(w * scaleX),
    height: Math.round(h * scaleY),
  };
  drawOverlay();
});

overlay.addEventListener('mouseup', () => {
  isDrawing = false;
});

clearRoiBtn.addEventListener('click', () => {
  roi = null;
  drawOverlay();
});

processBtn.addEventListener('click', async () => {
  if (!uploadedFilename) return;
  if (!roi || roi.width <= 0 || roi.height <= 0) {
    processStatus.textContent = 'Draw a rectangle over the watermark.';
    return;
  }
  processStatus.textContent = 'Processing... This may take a while for long videos.';
  downloadLink.innerHTML = '';
  try {
    const res = await fetch('/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: uploadedFilename, roi, method: methodSelect.value, quality: qualitySelect.value || 'ultra' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Processing failed');
    processStatus.textContent = 'Done.';
    const a = document.createElement('a');
    a.href = data.downloadUrl;
    a.textContent = 'Download processed video';
    a.download = data.outputFilename;
    downloadLink.appendChild(a);
  } catch (e) {
    processStatus.textContent = 'Error: ' + e.message;
  }
});
