// =====================================================
// GESTURA – Brushes + Pins + Full Gesture System
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
const brushSelect = document.getElementById("brush-select");

const BRUSHES = {
  pen:          { width: 3.5,  alpha: 1.0,  soft: false, dashed: false, callig: false },
  marker:       { width: 10,   alpha: 0.9,  soft: false, dashed: false, callig: false },
  highlighter:  { width: 20,   alpha: 0.35, soft: false, dashed: false, callig: false },
  calligraphy:  { width: 7,    alpha: 1.0,  soft: false, dashed: false, callig: true  },
  dotted:       { width: 4,    alpha: 1.0,  soft: false, dashed: true,  callig: false },
  soft:         { width: 16,   alpha: 0.22, soft: true,  dashed: false, callig: false },
};

const state = {
  mode: "idle",
  drawColor: "#00d4ff",
  brush: "pen",
  pinMode: false,
  eraser: false,
  boardMode: "white",
  boardTool: "pen",
  paths: [],
  currentPath: null,
  pins: [],          // {x,y,color,label}
  boardPaths: [],
  boardPins: [],
  boardCurrent: null,
  trail: [],
  laser: false,
  spotlight: false,
  raiseHand: false,
  reaction: null,
  reactionUntil: 0,
  timerSeconds: 300,
  timerRunning: false,
  timerInterval: null,
  raw: "NONE",
  stable: "NONE",
  stableCount: 0,
  lastActionAt: 0,
  cooldown: 700,
  tipHistory: [],
  palmHistory: [],
  pinchHistory: [],
  lastPinchAt: 0,
  pointHoldFrames: 0,
  lastPinAt: 0,
};

let hands = null;
let camera = null;

function now() { return performance.now(); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function canAct() { return now() - state.lastActionAt > state.cooldown; }
function markAct() { state.lastActionAt = now(); }

function fingerExtended(lm, tip, pip) { return lm[tip].y < lm[pip].y - 0.015; }
function thumbExtended(lm) { return Math.abs(lm[4].x - lm[2].x) > 0.045; }
function countExtended(lm) {
  let n = 0;
  if (thumbExtended(lm)) n++;
  if (fingerExtended(lm, 8, 6)) n++;
  if (fingerExtended(lm, 12, 10)) n++;
  if (fingerExtended(lm, 16, 14)) n++;
  if (fingerExtended(lm, 20, 18)) n++;
  return n;
}
function isPinch(lm) { return lm && lm.length > 8 && dist(lm[4], lm[8]) < 0.048; }
function isOpenPalm(lm) { return countExtended(lm) >= 4 && !isPinch(lm); }
function isFist(lm) { return countExtended(lm) <= 1 && !isPinch(lm); }
function isVictory(lm) {
  return fingerExtended(lm,8,6) && fingerExtended(lm,12,10) && !fingerExtended(lm,16,14) && !fingerExtended(lm,20,18);
}
function isThumbsUp(lm) {
  const thumbUp = lm[4].y < lm[3].y && lm[3].y < lm[2].y;
  const othersDown = !fingerExtended(lm,8,6) && !fingerExtended(lm,12,10) && !fingerExtended(lm,16,14) && !fingerExtended(lm,20,18);
  return thumbUp && othersDown;
}
function isThumbsDown(lm) {
  const thumbDown = lm[4].y > lm[3].y && lm[3].y > lm[2].y;
  const othersDown = !fingerExtended(lm,8,6) && !fingerExtended(lm,12,10) && !fingerExtended(lm,16,14) && !fingerExtended(lm,20,18);
  return thumbDown && othersDown;
}
function isPoint(lm) {
  return fingerExtended(lm,8,6) && !fingerExtended(lm,12,10) && !fingerExtended(lm,16,14) && !fingerExtended(lm,20,18) && !isPinch(lm);
}
function isRaiseHand(lm) { return isOpenPalm(lm) && lm[9].y < 0.32; }

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
function openMenu() { sideMenu.classList.remove("hidden"); markAct(); }
function closeMenuAndMore() {
  closeAllPanels();
  state.laser = false;
  state.spotlight = false;
  state.pinMode = false;
  if (state.currentPath) { state.paths.push(state.currentPath); state.currentPath = null; }
  setMode("idle");
  markAct();
}

function currentBrushStyle() {
  if (state.eraser) return { width: 26, alpha: 1, soft: false, dashed: false, callig: false, eraser: true };
  const b = BRUSHES[state.brush] || BRUSHES.pen;
  return { ...b, eraser: false };
}

// ---------- Draw paths with brush styles ----------
function strokePath(ctx2, p) {
  if (!p.points || p.points.length < 2) return;
  ctx2.save();
  ctx2.lineCap = "round";
  ctx2.lineJoin = "round";
  ctx2.strokeStyle = p.color;
  ctx2.globalAlpha = p.alpha ?? 1;

  if (p.eraser) {
    ctx2.globalCompositeOperation = "destination-out";
    ctx2.lineWidth = p.width;
    ctx2.beginPath();
    ctx2.moveTo(p.points[0].x, p.points[0].y);
    for (let i = 1; i < p.points.length; i++) ctx2.lineTo(p.points[i].x, p.points[i].y);
    ctx2.stroke();
    ctx2.restore();
    return;
  }

  if (p.dashed) {
    ctx2.setLineDash([2, 10]);
    ctx2.lineWidth = p.width;
    ctx2.beginPath();
    ctx2.moveTo(p.points[0].x, p.points[0].y);
    for (let i = 1; i < p.points.length; i++) ctx2.lineTo(p.points[i].x, p.points[i].y);
    ctx2.stroke();
    ctx2.setLineDash([]);
  } else if (p.soft) {
    // soft brush: several translucent passes
    for (let k = 0; k < 3; k++) {
      ctx2.lineWidth = p.width * (1 + k * 0.35);
      ctx2.globalAlpha = (p.alpha ?? 0.22) * (1 - k * 0.25);
      ctx2.beginPath();
      ctx2.moveTo(p.points[0].x, p.points[0].y);
      for (let i = 1; i < p.points.length; i++) ctx2.lineTo(p.points[i].x, p.points[i].y);
      ctx2.stroke();
    }
  } else if (p.callig) {
    // calligraphy: width varies slightly by segment direction
    for (let i = 1; i < p.points.length; i++) {
      const a = p.points[i - 1];
      const b = p.points[i];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const w = p.width * (0.55 + Math.abs(Math.sin(ang)) * 0.9);
      ctx2.lineWidth = w;
      ctx2.beginPath();
      ctx2.moveTo(a.x, a.y);
      ctx2.lineTo(b.x, b.y);
      ctx2.stroke();
    }
  } else {
    ctx2.lineWidth = p.width;
    ctx2.beginPath();
    ctx2.moveTo(p.points[0].x, p.points[0].y);
    for (let i = 1; i < p.points.length; i++) ctx2.lineTo(p.points[i].x, p.points[i].y);
    ctx2.stroke();
  }
  ctx2.restore();
}

function drawPins(ctx2, pins, scale = 1) {
  for (const pin of pins) {
    const x = pin.x;
    const y = pin.y;
    ctx2.save();
    // stem
    ctx2.beginPath();
    ctx2.moveTo(x, y);
    ctx2.lineTo(x, y - 18 * scale);
    ctx2.strokeStyle = "rgba(0,0,0,0.35)";
    ctx2.lineWidth = 2 * scale;
    ctx2.stroke();
    // head
    ctx2.beginPath();
    ctx2.arc(x, y - 22 * scale, 8 * scale, 0, Math.PI * 2);
    ctx2.fillStyle = pin.color || "#ff4d6d";
    ctx2.fill();
    ctx2.lineWidth = 2 * scale;
    ctx2.strokeStyle = "rgba(255,255,255,0.7)";
    ctx2.stroke();
    // inner dot
    ctx2.beginPath();
    ctx2.arc(x, y - 22 * scale, 2.5 * scale, 0, Math.PI * 2);
    ctx2.fillStyle = "#fff";
    ctx2.fill();
    ctx2.restore();
  }
}

function drawCursor(x, y, active) {
  ctx.beginPath();
  ctx.arc(x, y, active ? 11 : 7, 0, Math.PI * 2);
  ctx.fillStyle = state.pinMode ? "#ff4d6d" : (active ? "#ff4d6d" : "#00d4ff");
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
  for (const p of state.boardPaths) strokePath(boardCtx, p);
  drawPins(boardCtx, state.boardPins, 1);
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

// ---------- Motion ----------
function trackMotions(tip, palm, stable) {
  const t = now();
  state.tipHistory.push({ x: tip.x, y: tip.y, t });
  state.tipHistory = state.tipHistory.filter(p => t - p.t < 320);
  if (stable === "OPEN_PALM" || stable === "POINT") {
    state.palmHistory.push({ x: palm.x, y: palm.y, t });
    state.palmHistory = state.palmHistory.filter(p => t - p.t < 360);
  } else state.palmHistory = [];

  if (state.palmHistory.length >= 5 && canAct()) {
    const first = state.palmHistory[0];
    const last = state.palmHistory[state.palmHistory.length - 1];
    const dy = last.y - first.y;
    const dx = first.x - last.x;
    if (dy > 0.14 && Math.abs(dx) < 0.12) { openMenu(); state.palmHistory = []; return; }
    if (dy < -0.14 && Math.abs(dx) < 0.12) { closeMenuAndMore(); state.palmHistory = []; return; }
    if (dx > 0.16 && Math.abs(dy) < 0.12) { openBoard("white"); state.palmHistory = []; return; }
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
    if (state.pinchHistory.length >= 2 && canAct() && state.mode !== "draw") {
      state.paths.pop();
      state.pinchHistory = [];
      markAct();
    }
  }
}

function placePin(x, y, list) {
  const t = now();
  if (t - state.lastPinAt < 350) return;
  list.push({ x, y, color: state.drawColor || "#ff4d6d" });
  state.lastPinAt = t;
}

// ---------- Main loop ----------
function onResults(results) {
  canvas.width = video.videoWidth || window.innerWidth;
  canvas.height = video.videoHeight || window.innerHeight;
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

  for (const p of state.paths) strokePath(ctx, p);
  if (state.currentPath) strokePath(ctx, state.currentPath);
  drawPins(ctx, state.pins, 1.1);

  let stable = "NONE";
  let tipX = 0, tipY = 0;

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const lm = results.multiHandLandmarks[0];
    stable = stabilize(detectRaw(lm));
    const tip = lm[8];
    const palm = lm[9];
    tipX = tip.x * canvas.width;
    tipY = tip.y * canvas.height;

    state.trail.push({ x: tipX, y: tipY });
    if (state.trail.length > 16) state.trail.shift();
    drawTrail();

    trackMotions(tip, palm, stable);
    trackDoublePinch(stable);
    state.raiseHand = isRaiseHand(lm);

    if (stable === "THUMBS_UP" && state.stableCount > 6) { state.reaction = "up"; state.reactionUntil = now() + 1200; }
    if (stable === "THUMBS_DOWN" && state.stableCount > 6) { state.reaction = "down"; state.reactionUntil = now() + 1200; }

    if (stable === "VICTORY" && state.stableCount > 7 && canAct()) {
      state.brush = "highlighter";
      state.pinMode = false;
      state.eraser = false;
      if (brushSelect) brushSelect.value = "highlighter";
      setMode("draw");
      markAct();
    }

    if (stable === "POINT") {
      state.pointHoldFrames++;
      if (state.pointHoldFrames > 18 && canAct()) {
        state.laser = !state.laser;
        state.spotlight = false;
        setMode(state.laser ? "laser" : "idle");
        markAct();
        state.pointHoldFrames = 0;
      }
    } else state.pointHoldFrames = 0;

    if (stable === "FIST" && state.stableCount > 8 && canAct()) {
      closeMenuAndMore();
      state.stableCount = 0;
    }

    // Draw / Pin with pinch
    if (state.mode === "draw") {
      if (stable === "PINCH") {
        if (state.pinMode) {
          placePin(tipX, tipY, state.pins);
        } else {
          const style = currentBrushStyle();
          if (!state.currentPath) {
            state.currentPath = {
              points: [{ x: tipX, y: tipY }],
              color: style.eraser ? "#000" : state.drawColor,
              width: style.width,
              alpha: style.alpha,
              soft: style.soft,
              dashed: style.dashed,
              callig: style.callig,
              eraser: style.eraser
            };
          } else {
            const last = state.currentPath.points[state.currentPath.points.length - 1];
            if (Math.hypot(tipX - last.x, tipY - last.y) > 2.2) {
              state.currentPath.points.push({ x: tipX, y: tipY });
            }
          }
        }
      } else if (state.currentPath) {
        state.paths.push(state.currentPath);
        state.currentPath = null;
      }
    }

    // two-hand frame
    if (results.multiHandLandmarks.length >= 2) {
      const a = results.multiHandLandmarks[0][8];
      const b = results.multiHandLandmarks[1][8];
      const x1 = Math.min(a.x, b.x) * canvas.width;
      const y1 = Math.min(a.y, b.y) * canvas.height;
      const x2 = Math.max(a.x, b.x) * canvas.width;
      const y2 = Math.max(a.y, b.y) * canvas.height;
      ctx.save();
      ctx.strokeStyle = "rgba(0,212,255,0.85)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (state.spotlight) drawSpotlight(tipX, tipY);
    if (state.laser) drawLaser(tipX, tipY);
    else drawCursor(tipX, tipY, stable === "PINCH" || stable === "POINT");

    if (state.raiseHand) drawBadge("Hand Raised", canvas.height - 24);
    if (state.reaction && now() < state.reactionUntil) {
      drawBadge(state.reaction === "up" ? "Thumbs Up" : "Thumbs Down", 56);
    } else state.reaction = null;

    if (state.pinMode) drawBadge("Pin Mode", 56);
    gesturePill.textContent = stable.replace("_", " ");
  } else {
    state.trail = [];
    state.raiseHand = false;
    state.stableCount = 0;
    state.raw = "NONE";
    state.stable = "NONE";
    state.pointHoldFrames = 0;
    gesturePill.textContent = "—";
    if (state.currentPath) { state.paths.push(state.currentPath); state.currentPath = null; }
  }
  ctx.restore();
}

// ---------- UI ----------
document.getElementById("menu-btn").onclick = () => sideMenu.classList.toggle("hidden");
document.querySelectorAll("[data-close]").forEach(btn => {
  btn.onclick = () => {
    document.getElementById(btn.dataset.close).classList.add("hidden");
    if (["board-panel", "pdf-panel", "notes-panel", "timer-panel"].includes(btn.dataset.close)) setMode("idle");
  };
});

document.querySelectorAll(".menu-item").forEach(btn => {
  btn.onclick = () => {
    const a = btn.dataset.action;
    sideMenu.classList.add("hidden");
    if (a === "whiteboard") openBoard("white");
    else if (a === "blackboard") openBoard("black");
    else if (a === "draw") { closeAllPanels(); state.pinMode = false; state.eraser = false; setMode("draw"); }
    else if (a === "highlight") { closeAllPanels(); state.brush = "highlighter"; state.pinMode = false; state.eraser = false; if (brushSelect) brushSelect.value = "highlighter"; setMode("draw"); }
    else if (a === "laser") { state.laser = !state.laser; state.spotlight = false; setMode(state.laser ? "laser" : "idle"); }
    else if (a === "pdf") { closeAllPanels(); pdfPanel.classList.remove("hidden"); setMode("pdf"); }
    else if (a === "notes") { closeAllPanels(); notesPanel.classList.remove("hidden"); setMode("notes"); }
    else if (a === "timer") { closeAllPanels(); timerPanel.classList.remove("hidden"); }
    else if (a === "clear") { state.paths = []; state.currentPath = null; state.pins = []; }
    else if (a === "settings") { state.spotlight = !state.spotlight; state.laser = false; setMode(state.spotlight ? "spotlight" : "idle"); }
  };
});

document.querySelectorAll(".swatch").forEach(s => {
  s.onclick = () => {
    document.querySelectorAll(".swatch").forEach(x => x.classList.remove("active"));
    s.classList.add("active");
    state.drawColor = s.dataset.color;
    state.eraser = false;
  };
});

if (brushSelect) {
  brushSelect.onchange = () => {
    state.brush = brushSelect.value;
    state.pinMode = false;
    state.eraser = false;
    document.getElementById("btn-pin")?.classList.remove("active");
  };
}

document.getElementById("btn-pin").onclick = () => {
  state.pinMode = !state.pinMode;
  state.eraser = false;
  document.getElementById("btn-pin").classList.toggle("active", state.pinMode);
};
document.getElementById("btn-eraser").onclick = () => {
  state.eraser = !state.eraser;
  state.pinMode = false;
  document.getElementById("btn-pin")?.classList.remove("active");
};
document.getElementById("btn-undo").onclick = () => {
  if (state.pins.length && !state.paths.length) state.pins.pop();
  else state.paths.pop();
};
document.getElementById("btn-exit-draw").onclick = () => {
  if (state.currentPath) { state.paths.push(state.currentPath); state.currentPath = null; }
  state.pinMode = false;
  setMode("idle");
};

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
    if (btn.dataset.boardAction === "undo") {
      if (state.boardPins.length && !state.boardPaths.length) state.boardPins.pop();
      else state.boardPaths.pop();
    }
    if (btn.dataset.boardAction === "clear") { state.boardPaths = []; state.boardPins = []; }
    redrawBoard();
  };
});

// Board pointer drawing + pins
let boardDrawing = false;
function boardPos(e) {
  const r = boardCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: clientX - r.left, y: clientY - r.top };
}
function startBoardDraw(e) {
  const p = boardPos(e);
  if (state.boardTool === "pin") {
    state.boardPins.push({ x: p.x, y: p.y, color: "#ff4d6d" });
    redrawBoard();
    return;
  }
  boardDrawing = true;
  const baseColor = state.boardMode === "black" ? "#ffffff" : "#111111";
  const brush = BRUSHES[state.boardTool] || BRUSHES.pen;
  state.boardCurrent = {
    points: [p],
    color: state.boardTool === "highlighter" ? "#ffd60a" : baseColor,
    width: state.boardTool === "eraser" ? 22 : brush.width,
    alpha: state.boardTool === "highlighter" ? 0.4 : brush.alpha,
    soft: brush.soft,
    dashed: brush.dashed,
    callig: brush.callig,
    eraser: state.boardTool === "eraser"
  };
}
function moveBoardDraw(e) {
  if (!boardDrawing || !state.boardCurrent) return;
  const p = boardPos(e);
  const last = state.boardCurrent.points[state.boardCurrent.points.length - 1];
  if (Math.hypot(p.x - last.x, p.y - last.y) > 1.5) state.boardCurrent.points.push(p);
  redrawBoard();
  strokePath(boardCtx, state.boardCurrent);
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

// PDF + timer
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

// Init
async function init() {
  hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
  hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.72, minTrackingConfidence: 0.65 });
  hands.onResults(onResults);
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  });
  video.srcObject = stream;
  await video.play();
  camera = new Camera(video, {
    onFrame: async () => { if (hands) await hands.send({ image: video }); },
    width: 1280, height: 720
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
document.addEventListener("touchmove", e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
