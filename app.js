// =====================================================
// GESTURA – Live Classroom (iOS glossy style)
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
  drawColor: "#00d4ff",
  highlighter: false,
  eraser: false,
  boardMode: "white",
  boardTool: "pen",
  paths: [],
  currentPath: null,
  boardPaths: [],
  boardCurrent: null,
  lastGesture: "NONE",
  hold: 0,
  trail: [],
  laser: false,
  timerSeconds: 300,
  timerRunning: false,
  timerInterval: null,
  swipeStartX: null,
};

let hands = null;
let camera = null;

// ---------- Helpers ----------
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function isPinch(lm) { return lm && lm.length > 8 && dist(lm[4], lm[8]) < 0.055; }
function isOpenPalm(lm) {
  if (!lm || lm.length < 21) return false;
  const tips = [8,12,16,20], pips = [6,10,14,18];
  let n = 0;
  for (let i=0;i<4;i++) if (lm[tips[i]].y < lm[pips[i]].y) n++;
  return n >= 4;
}
function isFist(lm) {
  if (!lm || lm.length < 21) return false;
  const tips = [8,12,16,20], pips = [6,10,14,18];
  let n = 0;
  for (let i=0;i<4;i++) if (lm[tips[i]].y > lm[pips[i]].y) n++;
  return n >= 3;
}
function detectGesture(lm) {
  if (isPinch(lm)) return "PINCH";
  if (isOpenPalm(lm)) return "OPEN_PALM";
  if (isFist(lm)) return "FIST";
  return "NONE";
}

function setMode(m) {
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

// ---------- Drawing on main canvas ----------
function drawCursor(x, y, pinching) {
  ctx.beginPath();
  ctx.arc(x, y, pinching ? 12 : 8, 0, Math.PI*2);
  ctx.fillStyle = pinching ? "#ff4d6d" : "#00d4ff";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.stroke();
}

function drawPaths() {
  for (const p of state.paths) {
    if (p.points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(p.points[0].x, p.points[0].y);
    for (let i=1;i<p.points.length;i++) ctx.lineTo(p.points[i].x, p.points[i].y);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = p.alpha ?? 1;
    if (p.eraser) ctx.globalCompositeOperation = "destination-out";
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
  if (state.currentPath && state.currentPath.points.length > 1) {
    const p = state.currentPath;
    ctx.beginPath();
    ctx.moveTo(p.points[0].x, p.points[0].y);
    for (let i=1;i<p.points.length;i++) ctx.lineTo(p.points[i].x, p.points[i].y);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.width;
    ctx.lineCap = "round";
    ctx.globalAlpha = p.alpha ?? 1;
    if (p.eraser) ctx.globalCompositeOperation = "destination-out";
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
}

function drawLaser(x, y) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, 28);
  g.addColorStop(0, "rgba(255,60,60,0.9)");
  g.addColorStop(0.4, "rgba(255,80,80,0.35)");
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 28, 0, Math.PI*2);
  ctx.fill();
}

// ---------- Board canvas ----------
function resizeBoard() {
  const rect = boardWrap.getBoundingClientRect();
  boardCanvas.width = rect.width * 2;
  boardCanvas.height = rect.height * 2;
  boardCtx.setTransform(2,0,0,2,0,0);
  redrawBoard();
}

function redrawBoard() {
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  if (state.boardMode === "black") {
    boardCtx.fillStyle = "#111";
    boardCtx.fillRect(0,0,boardCanvas.width,boardCanvas.height);
  } else {
    boardCtx.fillStyle = "#f8f9fc";
    boardCtx.fillRect(0,0,boardCanvas.width,boardCanvas.height);
  }
  for (const p of state.boardPaths) {
    if (p.points.length < 2) continue;
    boardCtx.beginPath();
    boardCtx.moveTo(p.points[0].x, p.points[0].y);
    for (let i=1;i<p.points.length;i++) boardCtx.lineTo(p.points[i].x, p.points[i].y);
    boardCtx.strokeStyle = p.color;
    boardCtx.lineWidth = p.width;
    boardCtx.lineCap = "round";
    boardCtx.globalAlpha = p.alpha ?? 1;
    boardCtx.stroke();
    boardCtx.globalAlpha = 1;
  }
}

function openBoard(mode) {
  state.boardMode = mode;
  boardTitle.textContent = mode === "black" ? "Blackboard" : "Whiteboard";
  boardWrap.classList.toggle("black", mode === "black");
  closeAllPanels();
  boardPanel.classList.remove("hidden");
  setTimeout(resizeBoard, 50);
  setMode("board");
}

// ---------- Timer ----------
function updateTimerDisplay() {
  const m = Math.floor(state.timerSeconds / 60).toString().padStart(2,"0");
  const s = (state.timerSeconds % 60).toString().padStart(2,"0");
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

// ---------- Main MediaPipe loop ----------
function onResults(results) {
  canvas.width = video.videoWidth || window.innerWidth;
  canvas.height = video.videoHeight || window.innerHeight;
  ctx.save();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  drawPaths();

  let gesture = "NONE";
  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const lm = results.multiHandLandmarks[0];
    gesture = detectGesture(lm);
    const tip = lm[8];
    const x = tip.x * canvas.width;
    const y = tip.y * canvas.height;

    // simple swipe detection (open palm moving left)
    if (gesture === "OPEN_PALM") {
      if (state.swipeStartX === null) state.swipeStartX = tip.x;
      else if (state.swipeStartX - tip.x > 0.18) {
        // swipe right-to-left → open whiteboard
        openBoard("white");
        state.swipeStartX = null;
      }
    } else {
      state.swipeStartX = null;
    }

    if (gesture === state.lastGesture) state.hold++;
    else { state.hold = 0; state.lastGesture = gesture; }

    // Open palm hold → toggle side menu
    if (gesture === "OPEN_PALM" && state.hold > 10) {
      sideMenu.classList.toggle("hidden");
      state.hold = 0;
    }

    // Fist → close everything
    if (gesture === "FIST" && state.hold > 6) {
      closeAllPanels();
      setMode("idle");
      state.laser = false;
      state.hold = 0;
    }

    // Drawing mode
    if (state.mode === "draw") {
      if (gesture === "PINCH") {
        if (!state.currentPath) {
          state.currentPath = {
            points: [{x,y}],
            color: state.eraser ? "#000" : state.drawColor,
            width: state.eraser ? 24 : (state.highlighter ? 18 : 4),
            alpha: state.highlighter ? 0.35 : 1,
            eraser: state.eraser
          };
        } else {
          state.currentPath.points.push({x,y});
        }
      } else if (state.currentPath) {
        state.paths.push(state.currentPath);
        state.currentPath = null;
      }
    }

    if (state.laser) drawLaser(x, y);
    else drawCursor(x, y, gesture === "PINCH");

    gesturePill.textContent = gesture.replace("_", " ");
  } else {
    gesturePill.textContent = "—";
    if (state.currentPath) {
      state.paths.push(state.currentPath);
      state.currentPath = null;
    }
  }
  ctx.restore();
}

// ---------- UI Events ----------
document.getElementById("menu-btn").onclick = () => sideMenu.classList.toggle("hidden");

document.querySelectorAll("[data-close]").forEach(btn => {
  btn.onclick = () => {
    document.getElementById(btn.dataset.close).classList.add("hidden");
    if (["board-panel","pdf-panel","notes-panel","timer-panel"].includes(btn.dataset.close)) {
      setMode("idle");
    }
  };
});

document.querySelectorAll(".menu-item").forEach(btn => {
  btn.onclick = () => {
    const a = btn.dataset.action;
    sideMenu.classList.add("hidden");
    if (a === "whiteboard") openBoard("white");
    else if (a === "blackboard") openBoard("black");
    else if (a === "draw") { closeAllPanels(); setMode("draw"); }
    else if (a === "highlight") { closeAllPanels(); setMode("draw"); state.highlighter = true; state.eraser = false; }
    else if (a === "laser") { state.laser = !state.laser; setMode(state.laser ? "laser" : "idle"); }
    else if (a === "pdf") { closeAllPanels(); pdfPanel.classList.remove("hidden"); setMode("pdf"); }
    else if (a === "notes") { closeAllPanels(); notesPanel.classList.remove("hidden"); setMode("notes"); }
    else if (a === "timer") { closeAllPanels(); timerPanel.classList.remove("hidden"); }
    else if (a === "clear") { state.paths = []; state.currentPath = null; }
    else if (a === "shapes") { /* placeholder */ }
    else if (a === "settings") { /* placeholder */ }
  };
});

// Draw bar
document.querySelectorAll(".swatch").forEach(s => {
  s.onclick = () => {
    document.querySelectorAll(".swatch").forEach(x => x.classList.remove("active"));
    s.classList.add("active");
    state.drawColor = s.dataset.color;
    state.highlighter = false;
    state.eraser = false;
  };
});
document.getElementById("btn-highlighter").onclick = () => {
  state.highlighter = !state.highlighter;
  state.eraser = false;
};
document.getElementById("btn-eraser").onclick = () => {
  state.eraser = !state.eraser;
  state.highlighter = false;
};
document.getElementById("btn-undo").onclick = () => { state.paths.pop(); };
document.getElementById("btn-exit-draw").onclick = () => setMode("idle");

// Board tools
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
    redrawBoard();
  };
});

// Simple mouse/touch drawing on board (for now)
let boardDrawing = false;
function boardPos(e) {
  const r = boardCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: clientX - r.left, y: clientY - r.top };
}
function startBoardDraw(e) {
  boardDrawing = true;
  const p = boardPos(e);
  const color = state.boardMode === "black" ? "#ffffff" : "#111111";
  state.boardCurrent = {
    points: [p],
    color: state.boardTool === "highlighter" ? "#ffd60a" : color,
    width: state.boardTool === "eraser" ? 20 : (state.boardTool === "highlighter" ? 16 : 3),
    alpha: state.boardTool === "highlighter" ? 0.4 : 1
  };
}
function moveBoardDraw(e) {
  if (!boardDrawing || !state.boardCurrent) return;
  state.boardCurrent.points.push(boardPos(e));
  redrawBoard();
  // draw current
  const p = state.boardCurrent;
  boardCtx.beginPath();
  boardCtx.moveTo(p.points[0].x, p.points[0].y);
  for (let i=1;i<p.points.length;i++) boardCtx.lineTo(p.points[i].x, p.points[i].y);
  boardCtx.strokeStyle = p.color;
  boardCtx.lineWidth = p.width;
  boardCtx.lineCap = "round";
  boardCtx.globalAlpha = p.alpha;
  boardCtx.stroke();
  boardCtx.globalAlpha = 1;
}
function endBoardDraw() {
  if (state.boardCurrent) {
    state.boardPaths.push(state.boardCurrent);
    state.boardCurrent = null;
  }
  boardDrawing = false;
  redrawBoard();
}
boardCanvas.addEventListener("mousedown", startBoardDraw);
boardCanvas.addEventListener("mousemove", moveBoardDraw);
boardCanvas.addEventListener("mouseup", endBoardDraw);
boardCanvas.addEventListener("mouseleave", endBoardDraw);
boardCanvas.addEventListener("touchstart", e => { e.preventDefault(); startBoardDraw(e); }, {passive:false});
boardCanvas.addEventListener("touchmove", e => { e.preventDefault(); moveBoardDraw(e); }, {passive:false});
boardCanvas.addEventListener("touchend", endBoardDraw);

// PDF
const pdfInput = document.getElementById("pdf-input");
const pdfFrame = document.getElementById("pdf-frame");
const pdfDrop = document.getElementById("pdf-drop");
pdfInput.onchange = () => {
  const file = pdfInput.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  pdfFrame.src = url;
  pdfFrame.classList.remove("hidden");
  pdfDrop.classList.add("hidden");
};

// Timer buttons
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
async function init() {
  hands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.6
  });
  hands.onResults(onResults);

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  });
  video.srcObject = stream;
  await video.play();

  camera = new Camera(video, {
    onFrame: async () => { if (hands) await hands.send({ image: video }); },
    width: 1280,
    height: 720
  });
  await camera.start();
  setMode("idle");
}

startBtn.onclick = async () => {
  startBtn.disabled = true;
  startBtn.textContent = "Loading...";
  try {
    await init();
    startScreen.classList.add("hidden");
  } catch (e) {
    console.error(e);
    alert("Camera permission is required.\nOn iPhone: Settings → Safari → Camera → Allow");
    startBtn.disabled = false;
    startBtn.textContent = "Start Session";
  }
};

window.addEventListener("resize", () => {
  if (!boardPanel.classList.contains("hidden")) resizeBoard();
});

document.addEventListener("gesturestart", e => e.preventDefault());
