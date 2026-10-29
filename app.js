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
  raiseHand: false,
  reaction: null, // "up" | "down" | null
  reactionUntil: 0,
  timerSeconds: 300,
  timerRunning: false,
  timerInterval: null,

  // gesture engine
  raw: "NONE",
  stable: "NONE",
  stableCount: 0,
  lastActionAt: 0,
  cooldown: 700,

  // motion tracking
  tipHistory: [],
  palmHistory: [],
  pinchHistory: [],
  lastPinchAt: 0,
  pointHoldFrames: 0,
  zoomBox: null,
};

let hands = null;
let camera = null;

function now() { return performance.now(); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function canAct() { return now() - state.lastActionAt > state.cooldown; }
function markAct() { state.lastActionAt = now(); }

// ---------- Finger helpers ----------
function fingerExtended(lm, tip, pip, mcp) {
  // for non-thumb: tip further up than pip
  return lm[tip].y < lm[pip].y - 0.015;
}
function thumbExtended(lm) {
  return Math.abs(lm[4].x - lm[2].x) > 0.045;
}
function countExtended(lm) {
  let n = 0;
  if (thumbExtended(lm)) n++;
  if (fingerExtended(lm, 8, 6, 5)) n++;
  if (fingerExtended(lm, 12, 10, 9)) n++;
  if (fingerExtended(lm, 16, 14, 13)) n++;
  if (fingerExtended(lm, 20, 18, 17)) n++;
  return n;
}

function isPinch(lm) {
  return lm && lm.length > 8 && dist(lm[4], lm[8]) < 0.048;
}
function isOpenPalm(lm) {
  return countExtended(lm) >= 4 && !isPinch(lm);
}
function isFist(lm) {
  return countExtended(lm) <= 1 && !isPinch(lm);
}
function isVictory(lm) {
  // index + middle up, ring+pinky down
  const i = fingerExtended(lm, 8, 6, 5);
  const m = fingerExtended(lm, 12, 10, 9);
  const r = fingerExtended(lm, 16, 14, 13);
  const p = fingerExtended(lm, 20, 18, 17);
  return i && m && !r && !p;
}
function isThumbsUp(lm) {
  const thumbUp = lm[4].y < lm[3].y && lm[3].y < lm[2].y;
  const othersDown =
    !fingerExtended(lm, 8, 6, 5) &&
    !fingerExtended(lm, 12, 10, 9) &&
    !fingerExtended(lm, 16, 14, 13) &&
    !fingerExtended(lm, 20, 18, 17);
  return thumbUp && othersDown;
}
function isThumbsDown(lm) {
  const thumbDown = lm[4].y > lm[3].y && lm[3].y > lm[2].y;
  const othersDown =
    !fingerExtended(lm, 8, 6, 5) &&
    !fingerExtended(lm, 12, 10, 9) &&
    !fingerExtended(lm, 16, 14, 13) &&
    !fingerExtended(lm, 20, 18, 17);
  return thumbDown && othersDown;
}
function isPoint(lm) {
  // only index extended
  return (
    fingerExtended(lm, 8, 6, 5) &&
    !fingerExtended(lm, 12, 10, 9) &&
    !fingerExtended(lm, 16, 14, 13) &&
    !fingerExtended(lm, 20, 18, 17) &&
    !isPinch(lm)
  );
}
function isRaiseHand(lm) {
  return isOpenPalm(lm) && lm[9].y < 0.32;
}

function detectRaw(lm) {
  if (isPinch(lm)) return "PINCH";
  if (isVictory(lm)) return "VICTORY";
  if (isThumbsUp(lm)) return "THUMBS_UP";
  if (isThumbsDown(lm)) return "THUMBS_DOWN";
  if (isPoint(lm)) return "POINT";
  if (isFist(lm)) return "FIST";
  if (isOpenPalm(lm)) return "OPEN_PALM";
  return "NONE";
}

function stabilize(raw) {
  if (raw === state.raw) state.stableCount++;
  else { state.raw = raw; state.stableCount = 1; }
  if (state.stableCount >= 4) state.stable = state.raw;
  return state.stable;
}

// ---------- UI helpers ----------
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
function drawPaths() {
  for (const p of state.paths) {
    if (p.points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(p.points[0].x, p.points[0].y);
    for (let i = 1; i < p.points.length; i++) ctx.lineTo(p.points[i].x, p.points[i].y);
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
    for (let i = 1; i < p.points.length; i++) ctx.lineTo(p.points[i].x, p.points[i].y);
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
function resizeBoard() {
  const rect = boardWrap.getBoundingClientRect();
  boardCanvas.width = Math.max(1, rect.width * 2);
  boardCanvas.height = Math.max(1, rect.height * 2);
  boardCtx.setTransform(2, 0, 0, 2, 0, 0);
  redrawBoard();
}
function redrawBoard() {
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  boardCtx.fillStyle = state.boardMode === "black" ? "#111" : "#f8f9fc";
  boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
  for (const p of state.boardPaths) {
    if (p.points.length < 2) continue;
    boardCtx.beginPath();
    boardCtx.moveTo(p.points[0].x, p.points[0].y);
    for (let i = 1; i < p.points.length; i++) boardCtx.lineTo(p.points[i].x, p.points[i].y);
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

// ---------- Motion: vertical slide + horizontal swipe ----------
function trackMotions(tip, palm, stable) {
  const t = now();
  state.tipHistory.push({ x: tip.x, y: tip.y, t });
  state.tipHistory = state.tipHistory.filter(p => t - p.t < 320);

  if (stable === "OPEN_PALM" || stable === "POINT") {
    state.palmHistory.push({ x: palm.x, y: palm.y, t });
    state.palmHistory = state.palmHistory.filter(p => t - p.t < 360);
  } else {
    state.palmHistory = [];
  }

  if (state.palmHistory.length >= 5 && canAct()) {
    const first = state.palmHistory[0];
    const last = state.palmHistory[state.palmHistory.length - 1];
    const dy = last.y - first.y; // down positive
    const dx = first.x - last.x; // right→left positive in many mirrored setups

    // Slide hand down → open menu
    if (dy > 0.14 && Math.abs(dx) < 0.12) {
      openMenu();
      state.palmHistory = [];
      return;
    }
    // Slide hand up → close everything
    if (dy < -0.14 && Math.abs(dx) < 0.12) {
      closeMenuAndMore();
      state.palmHistory = [];
      return;
    }
    // Swipe right → left → whiteboard
    if (dx > 0.16 && Math.abs(dy) < 0.12) {
      openBoard("white");
      state.palmHistory = [];
      return;
    }
  }
}

function trackDoublePinch(stable) {
  const t = now();
  if (stable === "PINCH") {
    if (t - state.lastPinchAt > 80) {
      state.pinchHistory.push(t);
      state.pinchHistory = state.pinchHistory.filter(x => t - x < 600);
      state.lastPinchAt = t;
    }
    // double pinch pattern: two pinch bursts close together when not drawing heavily
    if (state.pinchHistory.length >= 2 && canAct() && state.mode !== "draw") {
      // undo
      state.paths.pop();
      state.pinchHistory = [];
      markAct();
      drawBadge("Undo", 60);
    }
  }
}

// ---------- Two-hand zoom frame ----------
function handleTwoHands(multi) {
  if (!multi || multi.length < 2) {
    state.zoomBox = null;
    return;
  }
  const a = multi[0][8];
  const b = multi[1][8];
  const x1 = Math.min(a.x, b.x) * canvas.width;
  const y1 = Math.min(a.y, b.y) * canvas.height;
  const x2 = Math.max(a.x, b.x) * canvas.width;
  const y2 = Math.max(a.y, b.y) * canvas.height;
  state.zoomBox = { x1, y1, x2, y2 };

  // draw frame
  ctx.save();
  ctx.strokeStyle = "rgba(0,212,255,0.85)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  ctx.setLineDash([]);
  ctx.restore();
}

// ---------- Main loop ----------
function onResults(results) {
  canvas.width = video.videoWidth || window.innerWidth;
  canvas.height = video.videoHeight || window.innerHeight;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  drawPaths();

  let stable = "NONE";
  let tipX = 0, tipY = 0;

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const lm = results.multiHandLandmarks[0];
    const raw = detectRaw(lm);
    stable = stabilize(raw);

    const tip = lm[8];
    const palm = lm[9];
    tipX = tip.x * canvas.width;
    tipY = tip.y * canvas.height;

    state.trail.push({ x: tipX, y: tipY });
    if (state.trail.length > 16) state.trail.shift();
    drawTrail();

    // motions
    trackMotions(tip, palm, stable);
    trackDoublePinch(stable);

    // raise hand
    state.raiseHand = isRaiseHand(lm);

    // reactions
    if (stable === "THUMBS_UP" && state.stableCount > 6) {
      state.reaction = "up";
      state.reactionUntil = now() + 1200;
    }
    if (stable === "THUMBS_DOWN" && state.stableCount > 6) {
      state.reaction = "down";
      state.reactionUntil = now() + 1200;
    }

    // Victory → highlighter mode
    if (stable === "VICTORY" && state.stableCount > 7 && canAct()) {
      state.highlighter = true;
      state.eraser = false;
      setMode("draw");
      markAct();
    }

    // Point hold → laser / spotlight toggle
    if (stable === "POINT") {
      state.pointHoldFrames++;
      if (state.pointHoldFrames > 18 && canAct()) {
        // long point toggles laser
        state.laser = !state.laser;
        state.spotlight = false;
        setMode(state.laser ? "laser" : "idle");
        markAct();
        state.pointHoldFrames = 0;
      }
    } else {
      state.pointHoldFrames = 0;
    }

    // Fist hold → cancel
    if (stable === "FIST" && state.stableCount > 8 && canAct()) {
      closeMenuAndMore();
      state.stableCount = 0;
    }

    // Draw with pinch (touch-screen style)
    if (state.mode === "draw") {
      if (stable === "PINCH") {
        if (!state.currentPath) {
          state.currentPath = {
            points: [{ x: tipX, y: tipY }],
            color: state.eraser ? "#000" : state.drawColor,
            width: state.eraser ? 26 : (state.highlighter ? 20 : 4),
            alpha: state.highlighter ? 0.35 : 1,
            eraser: state.eraser
          };
        } else {
          const last = state.currentPath.points[state.currentPath.points.length - 1];
          if (Math.hypot(tipX - last.x, tipY - last.y) > 2.2) {
            state.currentPath.points.push({ x: tipX, y: tipY });
          }
        }
      } else if (state.currentPath) {
        state.paths.push(state.currentPath);
        state.currentPath = null;
      }
    }

    // two hands frame
    handleTwoHands(results.multiHandLandmarks);

    // overlays
    if (state.spotlight) drawSpotlight(tipX, tipY);
    if (state.laser) drawLaser(tipX, tipY);
    else drawCursor(tipX, tipY, stable === "PINCH" || stable === "POINT");

    if (state.raiseHand) drawBadge("Hand Raised", canvas.height - 24);
    if (state.reaction && now() < state.reactionUntil) {
      drawBadge(state.reaction === "up" ? "Thumbs Up" : "Thumbs Down", 56);
    } else {
      state.reaction = null;
    }

    gesturePill.textContent = stable.replace("_", " ");
  } else {
    state.trail = [];
    state.raiseHand = false;
    state.stableCount = 0;
    state.raw = "NONE";
    state.stable = "NONE";
    state.pointHoldFrames = 0;
    state.zoomBox = null;
    gesturePill.textContent = "—";
    if (state.currentPath) {
      state.paths.push(state.currentPath);
      state.currentPath = null;
    }
  }

  ctx.restore();
}

// ---------- UI events ----------
document.getElementById("menu-btn").onclick = () => sideMenu.classList.toggle("hidden");

document.querySelectorAll("[data-close]").forEach(btn => {
  btn.onclick = () => {
    document.getElementById(btn.dataset.close).classList.add("hidden");
    if (["board-panel", "pdf-panel", "notes-panel", "timer-panel"].includes(btn.dataset.close)) {
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
    else if (a === "draw") { closeAllPanels(); state.highlighter = false; state.eraser = false; setMode("draw"); }
    else if (a === "highlight") { closeAllPanels(); state.highlighter = true; state.eraser = false; setMode("draw"); }
    else if (a === "laser") { state.laser = !state.laser; state.spotlight = false; setMode(state.laser ? "laser" : "idle"); }
    else if (a === "pdf") { closeAllPanels(); pdfPanel.classList.remove("hidden"); setMode("pdf"); }
    else if (a === "notes") { closeAllPanels(); notesPanel.classList.remove("hidden"); setMode("notes"); }
    else if (a === "timer") { closeAllPanels(); timerPanel.classList.remove("hidden"); }
    else if (a === "clear") { state.paths = []; state.currentPath = null; }
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
    redrawBoard();
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
function startBoardDraw(e) {
  boardDrawing = true;
  const p = boardPos(e);
  const baseColor = state.boardMode === "black" ? "#ffffff" : "#111111";
  state.boardCurrent = {
    points: [p],
    color: state.boardTool === "highlighter" ? "#ffd60a" : baseColor,
    width: state.boardTool === "eraser" ? 22 : (state.boardTool === "highlighter" ? 16 : 3),
    alpha: state.boardTool === "highlighter" ? 0.4 : 1
  };
}
function moveBoardDraw(e) {
  if (!boardDrawing || !state.boardCurrent) return;
  const p = boardPos(e);
  const last = state.boardCurrent.points[state.boardCurrent.points.length - 1];
  if (Math.hypot(p.x - last.x, p.y - last.y) > 1.5) state.boardCurrent.points.push(p);
  redrawBoard();
  const path = state.boardCurrent;
  boardCtx.beginPath();
  boardCtx.moveTo(path.points[0].x, path.points[0].y);
  for (let i = 1; i < path.points.length; i++) boardCtx.lineTo(path.points[i].x, path.points[i].y);
  boardCtx.strokeStyle = path.color;
  boardCtx.lineWidth = path.width;
  boardCtx.lineCap = "round";
  boardCtx.globalAlpha = path.alpha;
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
boardCanvas.addEventListener("touchstart", e => { e.preventDefault(); startBoardDraw(e); }, { passive: false });
boardCanvas.addEventListener("touchmove", e => { e.preventDefault(); moveBoardDraw(e); }, { passive: false });
boardCanvas.addEventListener("touchend", endBoardDraw);

// PDF
const pdfInput = document.getElementById("pdf-input");
const pdfFrame = document.getElementById("pdf-frame");
const pdfDrop = document.getElementById("pdf-drop");
pdfInput.onchange = () => {
  const file = pdfInput.files[0];
  if (!file) return;
  pdfFrame.src = URL.createObjectURL(file);
  pdfFrame.classList.remove("hidden");
  pdfDrop.classList.add("hidden");
};

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
async function init() {
  hands = new Hands({
    locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
  });
  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.72,
    minTrackingConfidence: 0.65
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
  updateTimerDisplay();
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
document.addEventListener("touchmove", e => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });
