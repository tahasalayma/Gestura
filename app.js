// =====================================================
// GESTURA – Full Gesture System
// =====================================================

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const modePill = document.getElementById("mode-pill");
const gesturePill = document.getElementById("gesture-pill");
const startScreen = document.getElementById("start-screen");
const startBtn = document.getElementById("start-btn");
const sideMenu = document.getElementById("side-menu");
const boardPanel = document.getElementById("board-panel");
const boardCanvas = document.getElementById("board-canvas");
const boardCtx = boardCanvas.getContext("2d");
const boardTitle = document.getElementById("board-title");
const boardWrap = document.getElementById("board-canvas-wrap");
const pdfPanel = document.getElementById("pdf-panel");
const notesPanel = document.getElementById("notes-panel");
const timerPanel = document.getElementById("timer-panel");
const drawBar = document.getElementById("draw-bar");
const timerDisplay = document.getElementById("timer-display");

const state = {
  mode: "idle",
  brushSize: 3,
  drawColor: "#00d4ff",
  highlighter: false,
  eraser: false,
  boardMode: "white",
  boardTool: "pen",
  paths: [],
  currentPath: null,
  boardPaths: [],
  boardCurrent: null,
  trail: [],
  laser: false,
  spotlight: false,
  timerSeconds: 300,
  timerRunning: false,
  timerInterval: null,


};

let hands = null;

function now() { return performance.now(); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function markAct() {}

// Only an extended index finger controls the workspace. Fold it to lift ink.
function isPoint(lm) {
  const extended = (tip, joint, base) => dist(lm[tip], lm[base]) > dist(lm[joint], lm[base]) * 1.45;
  return extended(8, 6, 5) && !extended(12, 10, 9) &&
    !extended(16, 14, 13) && !extended(20, 18, 17);
}
let filteredTip = null;
function smoothTip(tip) {
  const t = now();
  if (!filteredTip) filteredTip = {...tip, t};
  const dt = Math.max(1, t - filteredTip.t);
  const speed = dist(tip, filteredTip) / dt;
  const alpha = 1 - Math.exp(-dt / (speed > .001 ? 18 : 65));
  filteredTip = {x: filteredTip.x + alpha * (tip.x - filteredTip.x),
    y: filteredTip.y + alpha * (tip.y - filteredTip.y), t};
  return filteredTip;
}
// ---------- UI helpers ----------
function setMode(m) {
  if (m !== "draw" && state.currentPath) { state.paths.push(state.currentPath); state.currentPath = null; }
  state.mode = m;
  modePill.textContent = m.charAt(0).toUpperCase() + m.slice(1);
  drawBar.classList.toggle("hidden", m !== "draw");
}
function closeAllPanels() {
  sideMenu.classList.add("hidden");
  boardPanel.classList.add("hidden");
  pdfPanel.classList.add("hidden");
  notesPanel.classList.add("hidden");
  timerPanel.classList.add("hidden");
}
function openMenu() {
  sideMenu.classList.remove("hidden");
  markAct();
}
function closeMenuAndMore() {
  closeAllPanels();
  state.laser = false;
  state.spotlight = false;
  if (state.currentPath) {
    state.paths.push(state.currentPath);
    state.currentPath = null;
  }
  setMode("idle");
  markAct();
}

// ---------- Drawing ----------
function drawCursor(x, y, active) {
  ctx.beginPath();
  ctx.arc(x, y, active ? 11 : 7, 0, Math.PI * 2);
  ctx.fillStyle = active ? "#ff4d6d" : "#00d4ff";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.stroke();
}
function drawTrail() {
  if (state.trail.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(state.trail[0].x, state.trail[0].y);
  for (let i = 1; i < state.trail.length; i++) ctx.lineTo(state.trail[i].x, state.trail[i].y);
  ctx.strokeStyle = "rgba(0,212,255,0.35)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.stroke();
}
const inkCache = document.createElement('canvas');
const inkCtx = inkCache.getContext('2d');
let cachedPaths = -1;
function paintPath(context, path) {
  if (!path?.points.length) return;
  const points = path.points;
  context.save();
  context.strokeStyle = context.fillStyle = path.color;
  context.lineWidth = path.width;
  context.lineCap = context.lineJoin = 'round';
  context.globalAlpha = path.alpha ?? 1;
  context.globalCompositeOperation = path.eraser ? 'destination-out' : 'source-over';
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  if (points.length === 1) {
    context.arc(points[0].x, points[0].y, path.width / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    for (let i = 1; i < points.length - 1; i++) {
      context.quadraticCurveTo(points[i].x, points[i].y,
        (points[i].x + points[i+1].x)/2, (points[i].y + points[i+1].y)/2);
    }
    context.lineTo(points.at(-1).x, points.at(-1).y);
    context.stroke();
  }
  context.restore();
}
function drawPaths() {
  if (inkCache.width !== canvas.width || inkCache.height !== canvas.height) {
    inkCache.width = canvas.width; inkCache.height = canvas.height; cachedPaths = -1;
  }
  if (cachedPaths !== state.paths.length) {
    inkCtx.clearRect(0, 0, inkCache.width, inkCache.height);
    state.paths.forEach(path => paintPath(inkCtx, path));
    cachedPaths = state.paths.length;
  }
  ctx.drawImage(inkCache, 0, 0);
  paintPath(ctx, state.currentPath);
}
function drawLaser(x, y) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, 30);
  g.addColorStop(0, "rgba(255,70,70,0.95)");
  g.addColorStop(0.35, "rgba(255,80,80,0.35)");
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 30, 0, Math.PI * 2);
  ctx.fill();
}
function drawSpotlight(x, y) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "destination-out";
  const g = ctx.createRadialGradient(x, y, 36, x, y, 150);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function drawBadge(text, y = 28) {
  ctx.save();
  ctx.font = "bold 16px -apple-system, sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  const w = ctx.measureText(text).width + 20;
  ctx.fillRect(16, y - 18, w, 28);
  ctx.fillStyle = "#00d4ff";
  ctx.fillText(text, 26, y);
  ctx.restore();
}

// ---------- Board ----------
const boardCache = document.createElement('canvas');
const boardCacheCtx = boardCache.getContext('2d');
let boardDirty = true, boardFrame = null;
function resizeBoard() {
  const rect = boardWrap.getBoundingClientRect();
  const ratio = Math.min(2, devicePixelRatio || 1);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (boardCanvas.width === width && boardCanvas.height === height) return;
  if (boardCanvas.width > 1 && boardCanvas.height > 1) {
    const sx = width / boardCanvas.width, sy = height / boardCanvas.height;
    for (const path of [...state.boardPaths, state.boardCurrent].filter(Boolean)) {
      path.points.forEach(point => {point.x *= sx; point.y *= sy;});
    }
  }
  boardCanvas.width = boardCache.width = width;
  boardCanvas.height = boardCache.height = height;
  boardCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  boardCacheCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  boardDirty = true; redrawBoard();
}
function redrawBoard() {
  if (boardDirty) {
    boardCacheCtx.clearRect(0, 0, boardCache.width, boardCache.height);
    state.boardPaths.forEach(path => paintPath(boardCacheCtx, path));
    boardDirty = false;
  }
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  boardCtx.drawImage(boardCache, 0, 0, boardWrap.clientWidth, boardWrap.clientHeight);
  paintPath(boardCtx, state.boardCurrent);
}
function queueBoardDraw() {
  if (boardFrame !== null) return;
  boardFrame = requestAnimationFrame(() => {boardFrame = null; redrawBoard();});
}
function openBoard(mode) {
  state.boardMode = mode;
  boardTitle.textContent = mode === "black" ? "Blackboard" : "Whiteboard";
  boardWrap.classList.toggle("black", mode === "black");
  boardPanel.classList.remove("hidden");
  setTimeout(resizeBoard, 40);
  setMode("board");
  markAct();
}

// ---------- Timer ----------
function updateTimerDisplay() {
  const m = Math.floor(state.timerSeconds / 60).toString().padStart(2, "0");
  const s = (state.timerSeconds % 60).toString().padStart(2, "0");
  timerDisplay.textContent = `${m}:${s}`;
}
function startTimer() {
  if (state.timerRunning) return;
  state.timerRunning = true;
  state.timerInterval = setInterval(() => {
    if (state.timerSeconds > 0) {
      state.timerSeconds--;
      updateTimerDisplay();
    } else {
      clearInterval(state.timerInterval);
      state.timerRunning = false;
    }
  }, 1000);
}

// ---------- One-finger pointer ----------
let gestureTarget = null, gestureBoardDrawing = false;
let dwellStarted = 0, dwellActivated = false, dwellBlockedUntil = 0;
const gestureCursor = document.getElementById('gesture-cursor');
function resetGesturePointer() {
  if (gestureBoardDrawing) endBoardDraw();
  gestureBoardDrawing = false;
  if (state.currentPath && !manualDrawing) {
    state.paths.push(state.currentPath); state.currentPath = null;
  }
  dwellStarted = 0; dwellActivated = false; filteredTip = null;
  gestureTarget?.classList.remove('gesture-target'); gestureTarget = null;
  gestureCursor.hidden = true;
}
function trackGesturePointer(tip) {
  // Clamp to viewport to avoid edge miss-hits
  const x = Math.max(2, Math.min(innerWidth - 2, tip.x * innerWidth));
  const y = Math.max(2, Math.min(innerHeight - 2, tip.y * innerHeight));
  gestureCursor.hidden = false;
  gestureCursor.style.left = `${x}px`;
  gestureCursor.style.top = `${y}px`;

  // Temporarily hide cursor so elementFromPoint hits real UI
  const prevVis = gestureCursor.style.visibility;
  gestureCursor.style.visibility = 'hidden';
  const hit = document.elementFromPoint(x, y);
  gestureCursor.style.visibility = prevVis || '';

  const target = hit?.closest('button, .file-btn, summary, #pdf-scroll, label.file-btn, [data-action], [data-close], [data-board-tool], [data-board-action], [data-timer], [data-brush-step], .swatch');
  if (target !== gestureTarget) {
    gestureTarget?.classList.remove('gesture-target');
    gestureTarget = target || null;
    dwellStarted = 0;
    dwellActivated = false;
    target?.classList.add('gesture-target');
  }
  let progress = 0;
  if (target && !target.disabled && now() >= dwellBlockedUntil) {
    if (target.id === 'pdf-scroll') {
      scrollPdfAt(y);
    } else if (!dwellActivated) {
      if (!dwellStarted) dwellStarted = now();
      // Slightly faster, more reliable dwell for tool selection
      progress = Math.min(1, (now() - dwellStarted) / 700);
      if (progress >= 1) {
        dwellActivated = true;
        dwellBlockedUntil = now() + 650;
        try {
          if (target.matches('.file-btn, #pdf-change, label.file-btn')) {
            pdfStatus.textContent = 'Opening file picker…';
            (document.getElementById('pdf-input') || target).click();
          } else {
            target.click();
          }
        } catch (err) {
          console.warn('Gesture click failed', err);
        }
      }
    }
  }
  gestureCursor.style.setProperty('--progress', `${progress * 360}deg`);
  if (hit === boardCanvas) {
    if (!gestureBoardDrawing) { startBoardDraw({clientX:x, clientY:y}); gestureBoardDrawing = true; }
    else moveBoardDraw({clientX:x, clientY:y});
  } else if (gestureBoardDrawing) { endBoardDraw(); gestureBoardDrawing = false; }
  const overUI = !!target || !!hit?.closest('.glass-panel, #draw-bar');
  if (state.mode === 'draw' && !overUI && !manualDrawing) {
    if (!state.currentPath) state.currentPath = newInkPath();
    appendPoint(state.currentPath, {x,y});
  } else if (state.currentPath && !manualDrawing) {
    state.paths.push(state.currentPath); state.currentPath = null;
  }
  return {x,y};
}
function onResults(results) {
  if (canvas.width !== innerWidth || canvas.height !== innerHeight) {
    canvas.width = innerWidth; canvas.height = innerHeight;
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const lm = results.multiHandLandmarks?.[0];
  let position = null;
  if (lm && isPoint(lm)) {
    // Match the mirrored, cover-fitted camera to viewport coordinates.
    const scale = Math.max(innerWidth / video.videoWidth, innerHeight / video.videoHeight);
    const tip = smoothTip({x: .5 + (.5-lm[8].x)*video.videoWidth*scale/innerWidth,
      y: .5 + (lm[8].y-.5)*video.videoHeight*scale/innerHeight});
    position = trackGesturePointer(tip);
    gesturePill.textContent = 'Point · fold to lift';
  } else { resetGesturePointer(); gesturePill.textContent = 'Point one finger'; }
  drawPaths();
  if (position && state.spotlight) drawSpotlight(position.x, position.y);
  if (position && state.laser) drawLaser(position.x, position.y);
}
// ---------- UI events ----------
document.getElementById("menu-btn").onclick = () => sideMenu.classList.toggle("hidden");

document.querySelectorAll("[data-close]").forEach(btn => {
  btn.onclick = () => {
    document.getElementById(btn.dataset.close).classList.add("hidden");
    if ((btn.dataset.close === 'board-panel' && state.mode === 'board') ||
        (btn.dataset.close === 'pdf-panel' && state.mode === 'pdf') ||
        (btn.dataset.close === 'notes-panel' && state.mode === 'notes')) setMode('idle');
    document.getElementById('menu-btn').focus({preventScroll:true});
  };
});

document.querySelectorAll(".menu-item").forEach(btn => {
  btn.onclick = () => {
    const a = btn.dataset.action;
    sideMenu.classList.add("hidden");
    if (a === "whiteboard") openBoard("white");
    else if (a === "blackboard") openBoard("black");
    else if (a === "draw") { state.highlighter = false; state.eraser = false; setMode("draw"); }
    else if (a === "highlight") { state.highlighter = true; state.eraser = false; setMode("draw"); }
    else if (a === "laser") { state.laser = !state.laser; state.spotlight = false; setMode(state.laser ? "laser" : "idle"); }
    else if (a === "pdf") { pdfPanel.classList.remove("hidden"); setMode("pdf"); }
    else if (a === "notes") { notesPanel.classList.remove("hidden"); setMode("notes"); }
    else if (a === "timer") { timerPanel.classList.remove("hidden"); }
    else if (a === "clear") { state.paths = []; state.currentPath = null; cachedPaths = -1; }
    else if (a === "settings") { state.spotlight = !state.spotlight; state.laser = false; setMode(state.spotlight ? "spotlight" : "idle"); }
  };
});

document.querySelectorAll(".swatch").forEach(s => {
  s.onclick = () => {
    document.querySelectorAll(".swatch").forEach(x => x.classList.remove("active"));
    s.classList.add("active");
    state.drawColor = s.dataset.color;
    state.highlighter = false;
    state.eraser = false;
  };
});
document.getElementById("btn-highlighter").onclick = () => { state.highlighter = !state.highlighter; state.eraser = false; };
document.getElementById("btn-eraser").onclick = () => { state.eraser = !state.eraser; state.highlighter = false; };
document.getElementById("btn-undo").onclick = () => { state.paths.pop(); };
document.getElementById("btn-exit-draw").onclick = () => {
  if (state.currentPath) { state.paths.push(state.currentPath); state.currentPath = null; }
  setMode("idle");
};

document.querySelectorAll("[data-board-tool]").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("[data-board-tool]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    state.boardTool = btn.dataset.boardTool;
  };
});
document.querySelectorAll("[data-board-action]").forEach(btn => {
  btn.onclick = () => {
    if (btn.dataset.boardAction === "undo") state.boardPaths.pop();
    if (btn.dataset.boardAction === "clear") state.boardPaths = [];
    boardDirty = true; redrawBoard();
  };
});

// Board pointer drawing
let boardDrawing = false;
function boardPos(e) {
  const r = boardCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: clientX - r.left, y: clientY - r.top };
}
function appendPoint(path, point) {
  const last = path.points.at(-1);
  if (!last || Math.hypot(point.x-last.x, point.y-last.y) >= .65) path.points.push(point);
}
function newInkPath() {
  return {points:[], color:state.drawColor, width: state.brushSize * (state.eraser ? 6 : state.highlighter ? 4 : 1),
    alpha:state.highlighter ? .28 : 1, eraser:state.eraser};
}
function startBoardDraw(e) {
  boardDrawing = true;
  state.boardCurrent = {points:[boardPos(e)], color:state.boardTool === 'highlighter' ? '#e9b949' :
    (state.boardMode === 'black' ? '#ffffff' : '#18252b'),
    width:state.brushSize * (state.boardTool === 'eraser' ? 6 : state.boardTool === 'highlighter' ? 4 : 1),
    alpha:state.boardTool === 'highlighter' ? .3 : 1, eraser:state.boardTool === 'eraser'};
  queueBoardDraw();
}
function moveBoardDraw(e) {
  if (!boardDrawing || !state.boardCurrent) return;
  appendPoint(state.boardCurrent, boardPos(e)); queueBoardDraw();
}
function endBoardDraw() {
  if (state.boardCurrent) {state.boardPaths.push(state.boardCurrent); state.boardCurrent = null; boardDirty = true;}
  boardDrawing = false; queueBoardDraw();
}
let boardPointer = null;
boardCanvas.addEventListener('pointerdown', e => {
  if (!e.isPrimary || e.button !== 0 || boardPointer !== null) return;
  boardPointer = e.pointerId; boardCanvas.setPointerCapture(e.pointerId); startBoardDraw(e);
});
boardCanvas.addEventListener('pointermove', e => {
  if (e.pointerId !== boardPointer) return;
  for (const sample of e.getCoalescedEvents?.() || [e]) moveBoardDraw(sample);
});
function releaseBoardPointer(e) {
  if (e.pointerId !== boardPointer) return;
  boardPointer = null; endBoardDraw();
}
boardCanvas.addEventListener('pointerup', releaseBoardPointer);
boardCanvas.addEventListener('pointercancel', releaseBoardPointer);
boardCanvas.addEventListener('lostpointercapture', releaseBoardPointer);

// PDF: lazy-render pages in our own scroll container; native iframe viewers
// do not expose scrolling to hand gestures or custom controls.
const pdfInput = document.getElementById("pdf-input");
const pdfDrop = document.getElementById("pdf-drop");
const pdfReader = document.getElementById("pdf-reader");
const pdfPages = document.getElementById("pdf-pages");
const pdfScroll = document.getElementById("pdf-scroll");
const pdfStatus = document.getElementById("pdf-status");
let pdfDocument = null, pdfObserver = null, pdfGeneration = 0;
let pdfLibrary = null;
let currentPdfPage = 1;
async function loadPdf(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 50 * 1024 * 1024) {
    pdfStatus.textContent = "Choose a PDF smaller than 50 MB."; return;
  }
  const generation = ++pdfGeneration;
  pdfObserver?.disconnect();
  if (pdfDocument) { await pdfDocument.destroy(); pdfDocument = null; }
  pdfPages.replaceChildren();
  pdfReader.classList.add("hidden");
  pdfDrop.classList.remove("hidden");
  document.getElementById('pdf-prev').disabled = true;
  document.getElementById('pdf-next').disabled = true;
  pdfStatus.textContent = "Opening PDF…";
  try {
    pdfLibrary ||= await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
    pdfLibrary.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
    const data = await file.arrayBuffer();
    const doc = await pdfLibrary.getDocument({data, isEvalSupported: false}).promise;
    if (generation !== pdfGeneration) { await doc.destroy(); return; }
    pdfDocument = doc;
    const first = await doc.getPage(1);
    const viewport = first.getViewport({scale:1});
    for (let n = 1; n <= doc.numPages; n++) {
      const page = document.createElement('div');
      page.className = 'pdf-page'; page.dataset.page = n;
      page.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
      page.setAttribute('aria-label', `Page ${n}`);
      pdfPages.append(page);
    }
    pdfDrop.classList.add("hidden"); pdfReader.classList.remove("hidden");
    currentPdfPage = 1;
    pdfPages.scrollTop = 0;
    pdfObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        entry.target.dataset.nearby = entry.isIntersecting ? "true" : "false";
        if (entry.isIntersecting) renderPdfPage(entry.target, generation);
        else if (entry.target.dataset.rendered) {
          entry.target.replaceChildren(); delete entry.target.dataset.rendered;
        }
      }
    }, { root: pdfPages, rootMargin: '300px' });
    pdfPages.querySelectorAll('.pdf-page').forEach(page => pdfObserver.observe(page));
    pdfStatus.textContent = `${file.name} · ${doc.numPages} pages · Drag the right rail to scroll`;
    document.getElementById('pdf-prev').disabled = false;
    document.getElementById('pdf-next').disabled = false;
  } catch {
    if (generation !== pdfGeneration) return;
    pdfStatus.textContent = "Could not open this PDF. It may be password-protected, damaged, or the reader could not load. Choose another file or try again.";
    pdfReader.classList.add('hidden'); pdfDrop.classList.remove('hidden');
  }
}
async function renderPdfPage(container, generation) {
  if (container.dataset.rendered || container.dataset.rendering) return;
  container.dataset.rendering = 'true';
  try {
    const page = await pdfDocument.getPage(Number(container.dataset.page));
    if (generation !== pdfGeneration || !container.isConnected) return;
    const base = page.getViewport({scale:1});
    const width = pdfPages.clientWidth;
    const viewport = page.getViewport({scale: Math.min(1.5, devicePixelRatio || 1) * width / base.width});
    const surface = document.createElement('canvas');
    surface.width = Math.ceil(viewport.width); surface.height = Math.ceil(viewport.height);
    container.style.aspectRatio = `${base.width} / ${base.height}`;
    await page.render({canvasContext:surface.getContext('2d'), viewport}).promise;
    if (generation !== pdfGeneration || !container.isConnected) return;
    if (container.dataset.nearby !== "true") return;
    container.replaceChildren(surface); container.dataset.rendered = 'true';
  } catch { container.classList.add('failed'); }
  finally { delete container.dataset.rendering; }
}
pdfInput.onchange = () => { loadPdf(pdfInput.files[0]); pdfInput.value = ''; };
pdfDrop.addEventListener('dragover', e => {e.preventDefault();});
pdfDrop.addEventListener('drop', e => {e.preventDefault(); loadPdf(e.dataTransfer.files[0]);});
document.getElementById('pdf-change').onclick = () => pdfInput.click();
document.getElementById('pdf-expand').onclick = e => {
  const expanded = pdfPanel.classList.toggle('expanded');
  e.currentTarget.textContent = expanded ? 'Restore' : 'Expand';
  e.currentTarget.setAttribute('aria-pressed', expanded);
};
function scrollPdfAt(clientY) {
  const rect = pdfScroll.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientY - rect.top - 19) / Math.max(1, rect.height - 38)));
  pdfPages.scrollTop = ratio * (pdfPages.scrollHeight - pdfPages.clientHeight);
}
let railDragging = false;
pdfScroll.onpointerdown = e => { railDragging = true; pdfScroll.setPointerCapture(e.pointerId); scrollPdfAt(e.clientY); };
pdfScroll.onpointermove = e => { if (railDragging) scrollPdfAt(e.clientY); };
pdfScroll.onpointerup = pdfScroll.onpointercancel = () => { railDragging = false; };
pdfScroll.onkeydown = e => {
  const offsets = {ArrowDown:80, ArrowUp:-80, PageDown:pdfPages.clientHeight, PageUp:-pdfPages.clientHeight};
  if (e.key in offsets) {e.preventDefault(); pdfPages.scrollTop += offsets[e.key];}
  if (e.key === 'Home' || e.key === 'End') {e.preventDefault(); pdfPages.scrollTop = e.key === 'Home' ? 0 : pdfPages.scrollHeight;}
};
pdfPages.onscroll = () => {
  const max = pdfPages.scrollHeight - pdfPages.clientHeight;
  const ratio = max > 0 ? pdfPages.scrollTop / max : 0;
  pdfScroll.firstElementChild.style.top = `${ratio * Math.max(0, pdfScroll.clientHeight - 38)}px`;
  pdfScroll.setAttribute('aria-valuenow', Math.round(ratio * 100));
  const pages = [...pdfPages.children];
  currentPdfPage = Math.max(1, pages.findLastIndex(page => page.offsetTop <= pdfPages.offsetTop + pdfPages.scrollTop + 30) + 1);
};
function stepPdf(direction) {
  const page = pdfPages.children[Math.max(0, Math.min(pdfPages.children.length - 1, currentPdfPage - 1 + direction))];
  if (page) { pdfPages.scrollTop += page.getBoundingClientRect().top - pdfPages.getBoundingClientRect().top; }
}
document.getElementById('pdf-prev').onclick = () => stepPdf(-1);
document.getElementById('pdf-next').onclick = () => stepPdf(1);

// Timer
document.querySelectorAll("[data-timer]").forEach(btn => {
  btn.onclick = () => {
    const v = btn.dataset.timer;
    if (v === "5") { state.timerSeconds = 300; updateTimerDisplay(); }
    if (v === "10") { state.timerSeconds = 600; updateTimerDisplay(); }
    if (v === "15") { state.timerSeconds = 900; updateTimerDisplay(); }
    if (v === "start") startTimer();
    if (v === "reset") {
      clearInterval(state.timerInterval);
      state.timerRunning = false;
      state.timerSeconds = 300;
      updateTimerDisplay();
    }
  };
});

// ---------- Init ----------
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = src;
    script.onload = resolve; script.onerror = () => {script.remove(); reject(new Error('Could not load gesture engine'));};
    document.head.append(script);
  });
}
let stream = null, frameId = null, frameRunning = false;
let lastFrameAt = 0;
function renderManual() {
  if (hands) return;
  const width = innerWidth, height = innerHeight;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  ctx.clearRect(0, 0, width, height); drawPaths();
  frameId = requestAnimationFrame(renderManual);
}
async function init() {
  if (!window.Hands) await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js');
  hands = new Hands({locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`});
  hands.setOptions({maxNumHands:1, modelComplexity:0, minDetectionConfidence:0.6, minTrackingConfidence:0.6});
  hands.onResults(onResults);
  // Open the camera once; Camera utility previously opened a second stream.
  stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user', width:{ideal:640}, height:{ideal:480}}, audio:false});
  video.srcObject = stream; video.style.opacity = '1';
  await video.play();
  await hands.send({image:video});
  frameRunning = true;
  async function frame(t) {
    if (!frameRunning) return;
    if (!document.hidden && t - lastFrameAt > 32) {
      lastFrameAt = t;
      try { await hands.send({image:video}); }
      catch { frameRunning = false; resetGesturePointer(); stream?.getTracks().forEach(track => track.stop()); const engine = hands; hands = null; engine.close().catch(() => {}); modePill.textContent = 'Tracking paused — use mouse or touch'; renderManual(); }
    }
    if (frameRunning) frameId = requestAnimationFrame(frame);
  }
  frameId = requestAnimationFrame(frame);
  setMode('idle'); updateTimerDisplay();
}
startBtn.onclick = async () => {
  startBtn.disabled = true;
  document.getElementById('manual-btn').disabled = true;
  startBtn.textContent = 'Starting camera…';
  try {
    await init(); startScreen.classList.add('hidden');
  } catch (e) {
    stream?.getTracks().forEach(track => track.stop());
    if (hands) { try { await hands.close(); } catch {} hands = null; }
    document.getElementById('start-status').textContent = e.name === 'NotAllowedError' ? 'Camera access was denied. Allow it in your browser settings, or open without camera.' : 'Camera or gesture tools could not start. Check your connection and camera, or open without camera.';
    startBtn.disabled = false; startBtn.textContent = 'Try camera again';
  } finally { document.getElementById('manual-btn').disabled = false; }
};
document.getElementById('manual-btn').onclick = () => {
  startScreen.classList.add('hidden'); setMode('idle'); renderManual();
};
let manualDrawing = false, manualPointer = null;
canvas.style.touchAction = 'none';
document.getElementById('app').addEventListener('pointerdown', e => {
  if (!e.isPrimary || e.button !== 0 || manualDrawing || state.mode !== 'draw' || e.target !== canvas) return;
  manualDrawing = true; manualPointer = e.pointerId; canvas.setPointerCapture(e.pointerId);
  state.currentPath = newInkPath();
  addManualPoint(e);
});
function addManualPoint(e) {
  if (e.pointerId === manualPointer && manualDrawing && state.currentPath) appendPoint(state.currentPath, {x:e.clientX, y:e.clientY});
}
canvas.addEventListener('pointermove', addManualPoint);
function finishManualDraw(e) { if (e && e.pointerId !== manualPointer) return; if (manualDrawing && state.currentPath) {state.paths.push(state.currentPath); state.currentPath = null;} manualDrawing = false; manualPointer = null; }
canvas.addEventListener('pointerup', finishManualDraw);
canvas.addEventListener('pointercancel', finishManualDraw);
canvas.addEventListener('lostpointercapture', finishManualDraw);
new MutationObserver(() => {canvas.style.pointerEvents = state.mode === 'draw' ? 'auto' : 'none';}).observe(modePill, {childList:true});
document.addEventListener('keydown', e => {if (e.key === 'Escape') closeMenuAndMore();});
new MutationObserver(() => {document.getElementById('menu-btn').setAttribute('aria-expanded', !sideMenu.classList.contains('hidden'));}).observe(sideMenu, {attributes:true, attributeFilter:['class']});
document.querySelectorAll('.close-btn').forEach(btn => btn.setAttribute('aria-label', `Close ${btn.dataset.close.replace('-panel','').replace('side-menu','tools')}`));
window.addEventListener('pagehide', () => {frameRunning = false; clearInterval(state.timerInterval); cancelAnimationFrame(frameId); stream?.getTracks().forEach(track => track.stop());});

window.addEventListener("resize", () => {
  if (!boardPanel.classList.contains("hidden")) resizeBoard();
});

// CSS grid keeps every open tool in the layout; no manual dragging is needed.
const workspace = document.getElementById('workspace');
const toolPanels = [boardPanel, pdfPanel, notesPanel, timerPanel];
function syncWorkspace() {
  const count = toolPanels.filter(panel => !panel.classList.contains('hidden')).length;
  workspace.dataset.count = count;
  document.getElementById('workspace-hint').classList.toggle('hidden', count > 0);
  document.querySelectorAll('.menu-item').forEach(button => {
    const panel = {whiteboard:boardPanel, blackboard:boardPanel, pdf:pdfPanel, notes:notesPanel, timer:timerPanel}[button.dataset.action];
    if (panel) button.setAttribute('aria-pressed', !panel.classList.contains('hidden') &&
      (button.dataset.action !== 'whiteboard' || state.boardMode === 'white') &&
      (button.dataset.action !== 'blackboard' || state.boardMode === 'black'));
  });
}
const panelObserver = new MutationObserver(syncWorkspace);
toolPanels.forEach(panel => panelObserver.observe(panel, {attributes:true, attributeFilter:['class']}));
new ResizeObserver(() => {
  if (!boardPanel.classList.contains('hidden')) resizeBoard();
}).observe(boardWrap);
syncWorkspace();

// Brush size is shared between board and screen ink; step buttons support dwell.
function updateBrush(delta) {
  state.brushSize = Math.max(1, Math.min(12, state.brushSize + delta));
  document.querySelectorAll('.brush-value').forEach(label => label.textContent = `${state.brushSize} px`);
}
document.querySelectorAll('[data-brush-step]').forEach(button => button.onclick = () => updateBrush(Number(button.dataset.brushStep)));
function syncBrushUI() {
  document.getElementById('btn-highlighter').setAttribute('aria-pressed', state.highlighter);
  document.getElementById('btn-eraser').setAttribute('aria-pressed', state.eraser);
  document.querySelectorAll('[data-board-tool]').forEach(button => button.setAttribute('aria-pressed', button.dataset.boardTool === state.boardTool));
  document.querySelectorAll('.swatch').forEach(button => button.setAttribute('aria-pressed', button.dataset.color === state.drawColor));
}
document.addEventListener('click', syncBrushUI); syncBrushUI();
