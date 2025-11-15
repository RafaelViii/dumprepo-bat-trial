/* Updated movement logic with room-path / arearoom handling
   - Build roomPaths from DOM using CSS positions
   - If rat is placed inside an arearoom, traverse its room path one-way
   - When room path ends, snap to nearest main path segment and continue
   - Main-path movement, dots, and blocked-dot behavior preserved
*/

const containerEl = document.querySelector('.container');

/* -------------------------------
  Original path coordinates (main path)
  ------------------------------- */
const path = [
  { left: 235, top: 75 },
  { left: 720, top: 75 },
  { left: 720, top: 258 },
  { left: 598, top: 258 },
  { left: 598, top: 458 },
  { left: 327, top: 458 },
  { left: 327, top: 565 },
  { left: 327, top: 428 },
  { left: 215, top: 428 },
  { left: 215, top: 205 },
  { left: 165, top: 205 },
  { left: 165, top: 130 },
  { left: 285, top: 130 }, 
  { left: 285, top: 75 }
];

// Keep the rest of your original constants
const DOT_SPACING = 10; // px, desired spacing
const MAX_LABELS = 26; // a..z
const labels = "abcdefghijklmnopqrstuvwxyz".split("");

// dots per main path segment
const dotsBySegment = [];

/* helpers */
function dist(a,b) { return Math.hypot(a.left-b.left, a.top-b.top); }
function lerp(a,b,t){
  return { left: a.left + (b.left - a.left) * t, top: a.top + (b.top - a.top) * t };
}

/* -------------------------------
  Room path configuration (class → behavior)
  - uses DOM to read positions so CSS-driven layout stays authoritative
  ------------------------------- */
const roomConfig = [
  { id: 'room1pathA', selector: '.room1pathA', area: '.arearoom1A', direction: 'top-to-bottom' },
  { id: 'room1pathB', selector: '.room1pathB', area: '.arearoom1B', direction: 'left-to-right' },
  { id: 'room2pathA', selector: '.room2pathA', area: '.arearoom2A', direction: 'bottom-to-top' },
  { id: 'room3pathA', selector: '.room3pathA', area: '.arearoom3A', direction: 'left-to-right' },
  { id: 'room4pathA', selector: '.room4pathA', area: '.arearoom4A', direction: 'right-to-left' },
  { id: 'room5pathA', selector: '.room5pathA', area: '.arearoom5A', direction: 'right-to-left' }
];

const roomPaths = []; // filled by buildRoomPaths()

function buildRoomPaths(){
  roomPaths.length = 0;
  const containerRect = containerEl.getBoundingClientRect();

  for(const cfg of roomConfig){
    const el = document.querySelector(cfg.selector);
    const areaEl = document.querySelector(cfg.area);
    if(!el || !areaEl){
      console.warn('Missing element for', cfg.selector, 'or', cfg.area);
      continue;
    }
    const r = el.getBoundingClientRect();
    // convert to container coordinates (top-left)
    const left = r.left - containerRect.left;
    const top = r.top - containerRect.top;
    const right = left + r.width;
    const bottom = top + r.height;

    // detect orientation and derive start/end according to specified direction
    let start, end;
    const horizontal = r.width >= r.height;

    switch(cfg.direction){
      case 'top-to-bottom':
        start = { left: left + r.width/2, top: top };
        end   = { left: left + r.width/2, top: bottom };
        break;
      case 'bottom-to-top':
        start = { left: left + r.width/2, top: bottom };
        end   = { left: left + r.width/2, top: top };
        break;
      case 'left-to-right':
        start = { left: left, top: top + r.height/2 };
        end   = { left: right, top: top + r.height/2 };
        break;
      case 'right-to-left':
        start = { left: right, top: top + r.height/2 };
        end   = { left: left, top: top + r.height/2 };
        break;
      default:
        // fallback: left->right
        start = { left: left, top: top };
        end   = { left: right, top: top };
    }

    roomPaths.push({
      id: cfg.id,
      selector: cfg.selector,
      areaSelector: cfg.area,
      el,
      areaEl,
      direction: cfg.direction,
      start,
      end,
      length: Math.hypot(end.left - start.left, end.top - start.top)
    });
  }
}

/* Find nearest main-path segment and projection t for a point (container coords) */
function findNearestMainSegmentAndT(point){
  let best = { segIndex: 0, t: 0, d: Infinity };
  for(let i=0;i<path.length;i++){
    const a = path[i];
    const b = path[(i+1) % path.length];
    const vx = b.left - a.left;
    const vy = b.top - a.top;
    const len2 = vx*vx + vy*vy;
    if(len2 === 0) continue;
    let t = ((point.left - a.left) * vx + (point.top - a.top) * vy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.left + t*vx;
    const py = a.top + t*vy;
    const d = Math.hypot(px - point.left, py - point.top);
    if(d < best.d){
      best = { segIndex: i, t, d };
    }
  }
  return best;
}

/* See if a container-relative point is inside an arearoom element */
function pointIsInsideArea(areaEl, point){
  const containerRect = containerEl.getBoundingClientRect();
  const r = areaEl.getBoundingClientRect();
  const left = r.left - containerRect.left;
  const top = r.top - containerRect.top;
  return (point.left >= left && point.left <= left + r.width && point.top >= top && point.top <= top + r.height);
}

/* -------------------------------
  Dot creation (main path only)
  ------------------------------- */
function createDotsForAllSegments(){
  // clear any existing dots first
  document.querySelectorAll('.dot').forEach(d=>d.remove());
  dotsBySegment.length = 0;

  for(let i=0;i<path.length;i++){
    const start = path[i];
    const end   = path[(i+1) % path.length]; // wrap
    const segmentLen = dist(start, end);
    let count = Math.min(MAX_LABELS, Math.max(2, Math.round(segmentLen / DOT_SPACING) + 1));
    if(count > MAX_LABELS) count = MAX_LABELS;

    const arr = [];
    for(let k=0;k<count;k++){
      const t = (count===1) ? 0 : (k / (count - 1));
      // For main path we want H/V snapping behaviour preserved, but for simplicity reuse prior lerp
      const pos = lerp(start, end, t);
      const dot = document.createElement('div');
      dot.className = 'dot';
      dot.style.left = pos.left + 'px';
      dot.style.top = pos.top + 'px';
      const label = labels[Math.min(k, labels.length-1)];
      const labelEl = document.createElement('div');
      labelEl.className = 'label';
      labelEl.textContent = label;
      dot.appendChild(labelEl);

      dot.dataset.segment = i;
      dot.dataset.index = k;
      dot.dataset.label = label;
      dot.dataset.blocked = "false";

      dot.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleDotBlocked(i,k);
      });

      containerEl.appendChild(dot);
      arr.push({ el: dot, x: pos.left, y: pos.top, label, blocked: false });
    }
    dotsBySegment.push(arr);
  }
}

/* -------------------------------
  Finish markers (kept)
  ------------------------------- */
const finishLines = [
  { stepIndex: 2, pos: { left: 325, top: 567 } },
  { stepIndex: 0, pos: { left: 230, top: 70 } }
];

function createFinishMarkers() {
  // remove previous if any
  document.querySelectorAll('.finish').forEach(el => el.remove());
  finishLines.forEach((f, idx) => {
    const div = document.createElement('div');
    div.className = 'finish';
    div.style.left = f.pos.left + 'px';
    div.style.top = f.pos.top + 'px';
    div.dataset.finishIndex = idx;
    containerEl.appendChild(div);
  });
}

/* -------------------------------
  Blocking helpers (main path)
  ------------------------------- */
function toggleDotBlocked(segmentIndex, dotIndex) {
  const dotMeta = dotsBySegment[segmentIndex] && dotsBySegment[segmentIndex][dotIndex];
  if(!dotMeta) return;
  dotMeta.blocked = !dotMeta.blocked;
  dotMeta.el.dataset.blocked = dotMeta.blocked ? "true" : "false";
  if(dotMeta.blocked) dotMeta.el.classList.add('blocked');
  else dotMeta.el.classList.remove('blocked');
}

function resetAllBlocks(){
  for(const seg of dotsBySegment){
    for(const d of seg){
      d.blocked = false;
      d.el.classList.remove('blocked');
      d.el.dataset.blocked = "false";
    }
  }
}

function blockedDotBetween(segmentIndex, rCurr, rNext){
  if(segmentIndex < 0 || segmentIndex >= dotsBySegment.length) return null;
  const segDots = dotsBySegment[segmentIndex];
  const low = Math.min(rCurr, rNext);
  const high = Math.max(rCurr, rNext);
  for(let i=0;i<segDots.length;i++){
    const t = (segDots.length===1) ? 0 : (i / (segDots.length - 1));
    if(t + 1e-9 >= low && t - 1e-9 <= high && segDots[i].blocked){
      return { segmentIndex, dotIndex: i, meta: segDots[i] };
    }
  }
  return null;
}

/* -------------------------------
  Rat movement variables
  ------------------------------- */
const ratEl = document.getElementById('rat');
const toggleBtn = document.getElementById('toggleBtn');
const resetBtn = document.getElementById('resetBtn');
const posOutput = document.getElementById('pos');
const stepOutput = document.getElementById('step');
const dirOutput = document.getElementById('dir');
const nbOutput = document.getElementById('nb');

let moving = false;
// For main path movement:
let step = 0;                  // current main segment index
let ratioAlongSegment = 0;     // 0..1 along main segment
let moveForward = true;        // direction along main path
const speed = 1.8;             // pixels per frame approx

// For room-mode movement:
let currentMode = 'main'; // 'main' or 'room'
let roomIndex = -1;
let roomRatio = 0; // 0..1 along the current room path

/* place rat on nearest path or inside room area */
function placeRatAtNearest() {
  // Get rat center relative to container
  const rect = ratEl.getBoundingClientRect();
  const containerRect = containerEl.getBoundingClientRect();
  const ratX = rect.left + rect.width/2 - containerRect.left;
  const ratY = rect.top + rect.height/2 - containerRect.top;
  const ratPoint = { left: ratX, top: ratY };

  // 1) Check arearooms first: if inside area, enter its room path
  for(let i=0;i<roomPaths.length;i++){
    const rp = roomPaths[i];
    if(pointIsInsideArea(rp.areaEl, ratPoint)){
      // Enter this room path at its start
      currentMode = 'room';
      roomIndex = i;
      roomRatio = 0;
      ratEl.style.left = rp.start.left + 'px';
      ratEl.style.top = rp.start.top + 'px';
      // ensure direction is forward along the room path
      moveForward = true;
      posOutput.textContent = `room:${rp.id}`;
      return;
    }
  }

  // 2) Otherwise snap to nearest main path segment
  let bestSegment = 0;
  let bestT = 0;
  let bestDist = Infinity;

  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i+1) % path.length];
    const vx = b.left - a.left;
    const vy = b.top - a.top;
    const len2 = vx*vx + vy*vy;
    if(len2 === 0) continue;
    let t = ((ratX - a.left) * vx + (ratY - a.top) * vy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.left + t*vx;
    const py = a.top + t*vy;
    const d = Math.hypot(px - ratX, py - ratY);

    if(d < bestDist) {
      bestDist = d;
      bestSegment = i;
      bestT = t;
    }
  }

  // 3) Also check finish markers as alternative
  let onFinish = false;
  finishLines.forEach(f => {
    const d = Math.hypot(ratX - f.pos.left, ratY - f.pos.top);
    if(d < bestDist){
      // snap to finish icon if closer
      onFinish = true;
      bestDist = d;
      bestSegment = null;
      bestT = null;
      ratEl.style.left = f.pos.left + 'px';
      ratEl.style.top = f.pos.top + 'px';
    }
  });

  if(!onFinish){
    currentMode = 'main';
    roomIndex = -1;
    step = bestSegment;
    ratioAlongSegment = bestT;
    const p = lerp(path[step], path[(step+1) % path.length], ratioAlongSegment);
    ratEl.style.left = p.left + 'px';
    ratEl.style.top = p.top + 'px';
  }
}

/* Move one frame for room path */
function animateRoomStep(){
  if(!moving) return;

  const rp = roomPaths[roomIndex];
  if(!rp) {
    // No room, fallback to main
    currentMode = 'main';
    return;
  }

  const segLen = rp.length || 1;
  const deltaRatio = (speed / segLen); // always forward along room
  roomRatio += deltaRatio;

  if(roomRatio >= 1){
    // reached end of room path -> connect to nearest main path and switch to main mode
    const endPoint = rp.end;
    const nearest = findNearestMainSegmentAndT(endPoint);
    step = nearest.segIndex;
    ratioAlongSegment = nearest.t;
    currentMode = 'main';
    roomIndex = -1;
    // place rat exactly at the projected main-path position
    const p = lerp(path[step], path[(step+1) % path.length], ratioAlongSegment);
    ratEl.style.left = p.left + 'px';
    ratEl.style.top = p.top + 'px';
    // keep moving (direction chosen so we go along the path away from where we joined)
    // choose moveForward such that we proceed "forward" along the natural increment from step->step+1
    moveForward = true;
    return;
  }

  // still on room, set position
  const pos = lerp(rp.start, rp.end, roomRatio);
  ratEl.style.left = pos.left + 'px';
  ratEl.style.top = pos.top + 'px';

  // update debug
  posOutput.textContent = `room:${roomPaths[roomIndex].id} L:${Math.round(pos.left)},T:${Math.round(pos.top)}`;
  stepOutput.textContent = `room`;
  dirOutput.textContent = roomPaths[roomIndex].direction;

  requestAnimationFrame(animateStep);
}

/* Move one frame for main path (original logic adapted) */
function animateMainStep(){
  // compute current segment start/end (circular path)
  const start = path[step];
  const endIdx = moveForward ? ((step + 1) % path.length) : ((step - 1 + path.length) % path.length);
  const end = path[endIdx];

  const dx = end.left - start.left;
  const dy = end.top - start.top;
  const segLen = Math.hypot(dx, dy) || 1;

  // propose next ratio
  const deltaRatio = (speed / segLen) * (moveForward ? 1 : -1);
  const proposedRatio = ratioAlongSegment + deltaRatio;

  // check finish
  const posRect = ratEl.getBoundingClientRect();
  const containerRect = containerEl.getBoundingClientRect();
  const ratX = posRect.left + posRect.width/2 - containerRect.left;
  const ratY = posRect.top + posRect.height/2 - containerRect.top;
  finishLines.forEach(f => {
    const distToFinish = Math.hypot(ratX - f.pos.left, ratY - f.pos.top);
    if(distToFinish < 12){
      moving = false;
      toggleBtn.textContent = "Finished!";
      console.log(`Rat reached finish line ${f.stepIndex}`);
    }
  });

  // check blocked dots on this main segment
  const checkSegment = step;
  const blockedInfo = blockedDotBetween(checkSegment, ratioAlongSegment, proposedRatio);
  if(blockedInfo){
    nbOutput.textContent = `Seg ${blockedInfo.segmentIndex} dot ${blockedInfo.meta.label} blocked`;
    // Reverse direction when encounter block on main path
    moveForward = !moveForward;
    // clear block visually after short delay
    setTimeout(() => {
      blockedInfo.meta.blocked = false;
      blockedInfo.meta.el.classList.remove('blocked');
      blockedInfo.meta.el.dataset.blocked = "false";
    }, 1000);
    dirOutput.textContent = moveForward ? "forward" : "back";
    return requestAnimationFrame(animateStep);
  } else {
    nbOutput.textContent = "...";
  }

  // commit movement
  ratioAlongSegment = proposedRatio;

  // handle boundaries (crossing segment ends)
  if(ratioAlongSegment >= 1 || ratioAlongSegment <= 0){
    if(moveForward){
      ratioAlongSegment = ratioAlongSegment - 1;
      step = (step + 1) % path.length;
    } else {
      ratioAlongSegment = ratioAlongSegment + 1;
      step = (step - 1 + path.length) % path.length;
    }
    ratioAlongSegment = Math.max(0, Math.min(1, ratioAlongSegment));
  }

  // set rat position
  const pos = lerp(path[step], path[(step+1) % path.length], ratioAlongSegment);
  ratEl.style.left = pos.left + 'px';
  ratEl.style.top = pos.top + 'px';

  // update debug
  posOutput.textContent = `L:${Math.round(pos.left)}, T:${Math.round(pos.top)}`;
  stepOutput.textContent = `${step}`;
  dirOutput.textContent = moveForward ? "forward" : "back";

  requestAnimationFrame(animateStep);
}

/* Single dispatcher for animation frames */
function animateStep(){
  if(!moving) return;
  if(currentMode === 'room'){
    animateRoomStep();
  } else {
    animateMainStep();
  }
}

/* Start / stop handlers */
toggleBtn.addEventListener('click', () => {
  moving = !moving;
  toggleBtn.textContent = moving ? "Stop" : "Start";
  if(moving){
    // ensure roomPaths built in case layout changed
    buildRoomPaths();
    // find nearest path or room and place rat
    placeRatAtNearest();
    // validate step in range for main mode
    if(step < 0) step = 0;
    if(step >= path.length) step = step % path.length;
    requestAnimationFrame(animateStep);
  }
});
resetBtn.addEventListener('click', () => {
  resetAllBlocks();
});

/* Drag rat with mouse while not moving */
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

ratEl.addEventListener('mousedown', (e) => {
  if(moving) return;
  isDragging = true;
  ratEl.style.cursor = 'grabbing';
  const rect = ratEl.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if(!isDragging) return;
  const containerRect = containerEl.getBoundingClientRect();
  let x = e.clientX - containerRect.left - dragOffsetX;
  let y = e.clientY - containerRect.top - dragOffsetY;
  ratEl.style.left = x + 'px';
  ratEl.style.top = y + 'px';
});

document.addEventListener('mouseup', () => {
  if(!isDragging) return;
  isDragging = false;
  ratEl.style.cursor = 'grab';
});

/* init */
buildRoomPaths();
createDotsForAllSegments();
createFinishMarkers();
// initial placement: put rat at first main path start by default
ratEl.style.left = path[0].left + 'px';
ratEl.style.top = path[0].top + 'px';