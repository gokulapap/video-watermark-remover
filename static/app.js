const dropzone = document.getElementById('dropzone');
const browseBtn = document.getElementById('browseBtn');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadStatus = document.getElementById('uploadStatus');
const uploadProgress = document.getElementById('uploadProgress');
const uploadProgressBar = document.getElementById('uploadProgressBar');

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const overlayHelp = document.getElementById('overlayHelp');

const methodSelect = document.getElementById('method');
const qualitySelect = document.getElementById('quality');
const clearRoiBtn = document.getElementById('clearRoi');
const processBtn = document.getElementById('processBtn');
const processStatus = document.getElementById('processStatus');
const processProgress = document.getElementById('processProgress');
const downloadLink = document.getElementById('downloadLink');
const toasts = document.getElementById('toasts');

let uploadedFilename = null;
let isDrawing = false;
let startX = 0, startY = 0;
let roi = null; // {x, y, width, height}

// Toasts
function toast(message, type = 'success', timeout = 2500) {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  toasts.appendChild(t);
  setTimeout(() => { t.remove(); }, timeout);
}

// Dropzone
['dragenter', 'dragover'].forEach(evt => dropzone.addEventListener(evt, e => {
  e.preventDefault(); e.stopPropagation();
  dropzone.classList.add('dragover');
}));
['dragleave', 'drop'].forEach(evt => dropzone.addEventListener(evt, e => {
  e.preventDefault(); e.stopPropagation();
  dropzone.classList.remove('dragover');
}));
dropzone.addEventListener('drop', (e) => {
  const files = e.dataTransfer.files;
  if (!files || !files.length) return;
  fileInput.files = files;
  updateUploadState();
});

browseBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', updateUploadState);

function updateUploadState() {
  if (fileInput.files && fileInput.files[0]) {
    uploadBtn.disabled = false;
    uploadStatus.textContent = fileInput.files[0].name;
  } else {
    uploadBtn.disabled = true;
    uploadStatus.textContent = '';
  }
}

// Canvas size to video
function fitCanvasToVideo() {
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
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  const scaleX = overlay.width / video.videoWidth;
  const scaleY = overlay.height / video.videoHeight;
  ctx.strokeRect(roi.x * scaleX, roi.y * scaleY, roi.width * scaleX, roi.height * scaleY);
}

window.addEventListener('resize', () => { fitCanvasToVideo(); drawOverlay(); });
video.addEventListener('loadedmetadata', () => { fitCanvasToVideo(); overlayHelp.style.display = 'block'; processBtn.disabled = !uploadedFilename; });

// Upload with progress (XHR for progress events)
uploadBtn.addEventListener('click', async () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) { toast('Select a video first', 'error'); return; }
  uploadProgress.hidden = false;
  uploadProgressBar.style.width = '0%';
  uploadBtn.disabled = true;

  const form = new FormData();
  form.append('video', file);

  try {
    const data = await uploadWithProgress('/upload', form, (pct) => {
      uploadProgressBar.style.width = `${pct}%`;
    });
    uploadedFilename = data.filename;
    video.src = data.videoUrl;
    toast('Uploaded successfully');
    processBtn.disabled = false;
  } catch (e) {
    toast(e.message || 'Upload failed', 'error');
  } finally {
    uploadBtn.disabled = false;
    setTimeout(() => { uploadProgress.hidden = true; }, 500);
  }
});

function uploadWithProgress(url, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(pct);
      }
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || 'Upload failed'));
      } catch {
        reject(new Error('Invalid server response'));
      }
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(form);
  });
}

// ROI interactions
function getMousePos(evt) {
  const rect = overlay.getBoundingClientRect();
  return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
}

overlay.addEventListener('mousedown', (e) => {
  if (!video.videoWidth) return;
  isDrawing = true;
  const p = getMousePos(e);
  startX = p.x; startY = p.y;
  roi = { x: 0, y: 0, width: 0, height: 0 };
  overlayHelp.style.display = 'none';
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

overlay.addEventListener('mouseup', () => { isDrawing = false; });
clearRoiBtn.addEventListener('click', () => { roi = null; drawOverlay(); overlayHelp.style.display = 'block'; });

// Process
processBtn.addEventListener('click', async () => {
  if (!uploadedFilename) { toast('Upload a video first', 'error'); return; }
  if (!roi || roi.width <= 0 || roi.height <= 0) { toast('Draw a rectangle over the watermark', 'error'); return; }

  processStatus.textContent = 'Processing...';
  processProgress.hidden = false;
  downloadLink.innerHTML = '';
  processBtn.disabled = true;

  try {
    const res = await fetch('/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: uploadedFilename, roi, method: methodSelect.value, quality: qualitySelect.value || 'ultra' })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Processing failed');
    processStatus.textContent = 'Done';
    const a = document.createElement('a');
    a.href = data.downloadUrl;
    a.textContent = 'Download processed video';
    a.className = 'btn';
    a.download = data.outputFilename;
    downloadLink.appendChild(a);
    toast('Processing complete');
  } catch (e) {
    processStatus.textContent = 'Error';
    toast(e.message || 'Processing failed', 'error');
  } finally {
    processProgress.hidden = true;
    processBtn.disabled = false;
  }
});
