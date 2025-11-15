/* Updated try11.js — small, focused fixes to ensure continuous movement
   - Ensures animation loop keeps running after mode switches (room -> transition -> main)
   - Calls requestAnimationFrame(animateStep) whenever a handler decides the next mode
   - Minimal changes only in animateRoomStep, animateTransitionStep and a couple of early-return branches
   Keep the rest of your file unchanged so you can locate edits easily.
*/

const containerEl = document.querySelector('.container');

/* -------------------------------
  Original main path coordinates
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

const DOT_SPACING = 10;
const MAX_LABELS = 26;
const labels = "abcdefghijklmnopqrstuvwxyz".split("");

const dotsBySegment = [];

function dist(a, b) { return Math.hypot(a.left - b.left, a.top - b.top); }
function lerp(a, b, t) { return { left: a.left + (b.left - a.left) * t, top: a.top + (b.top - a.top) * t }; }

/* -------------------------------
  Room path configuration (reads DOM, uses container coords)
  ------------------------------- */
const roomConfig = [
  { id: 'room1pathA', selector: '.room1pathA', area: '.arearoom1A', direction: 'top-to-bottom' },
  { id: 'room1pathB', selector: '.room1pathB', area: '.arearoom1B', direction: 'left-to-right' },
  { id: 'room2pathA', selector: '.room2pathA', area: '.arearoom2A', direction: 'bottom-to-top' },
  { id: 'room3pathA', selector: '.room3pathA', area: '.arearoom3A', direction: 'left-to-right' },
  { id: 'room4pathA', selector: '.room4pathA', area: '.arearoom4A', direction: 'right-to-left' },
  { id: 'room5pathA', selector: '.room5pathA', area: '.arearoom5A', direction: 'right-to-left' },
  { id: 'roomoutpathA', selector: '.roomoutpathA', area: '.arearoomoutA', direction: 'top-to-bottom' },
  { id: 'roomoutpathA', selector: '.roomoutpathA', area: '.arearoomoutB', direction: 'top-to-bottom' },
];

const roomPaths = []; // built from DOM

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
    const left = r.left - containerRect.left;
    const top = r.top - containerRect.top;
    const right = left + r.width;
    const bottom = top + r.height;

    let start, end;
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

/* Find nearest main segment and projection t for a point */
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
      best = { segIndex: i, t, d, proj: { left: px, top: py } };
    }
  }
  return best;
}

/* Does point reside inside areaEl? */
function pointIsInsideArea(areaEl, point){
  const containerRect = containerEl.getBoundingClientRect();
  const r = areaEl.getBoundingClientRect();
  const left = r.left - containerRect.left;
  const top = r.top - containerRect.top;
  return (point.left >= left && point.left <= left + r.width && point.top >= top && point.top <= top + r.height);
}

/* -------------------------------
  Dot creation (main path)
  ------------------------------- */
function createDotsForAllSegments(){
  document.querySelectorAll('.dot').forEach(d=>d.remove());
  dotsBySegment.length = 0;

  for(let i=0;i<path.length;i++){
    const start = path[i];
    const end   = path[(i+1) % path.length];
    const segmentLen = dist(start, end);
    let count = Math.min(MAX_LABELS, Math.max(2, Math.round(segmentLen / DOT_SPACING) + 1));
    if(count > MAX_LABELS) count = MAX_LABELS;

    const arr = [];
    for(let k=0;k<count;k++){
      const t = (count===1) ? 0 : (k / (count - 1));
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
  Finish markers
  ------------------------------- */
const finishLines = [
  { stepIndex: 2, pos: { left: 325, top: 570 } },
  { stepIndex: 0, pos: { left: 230, top: 70 } }
];

function createFinishMarkers() {
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
let step = 0;
let ratioAlongSegment = 0;
let moveForward = true;
const speed = 1.8;

/* room-mode */
let currentMode = 'main'; // 'main' | 'room' | 'transition'
let roomIndex = -1;
let roomRatio = 0;

/* transition mode (orthogonal legs) */
let transitionSegments = []; // [{start,end,length,ratio,meta}] meta may hold finalMainTarget
let transitionIndex = 0;

/* Helper: project point onto segment a->b (returns t, px,py) */
function projectPointOnSegment(a,b,point){
  const vx = b.left - a.left;
  const vy = b.top - a.top;
  const len2 = vx*vx + vy*vy;
  if(len2 === 0) return { t: 0, px: a.left, py: a.top };
  let t = ((point.left - a.left) * vx + (point.top - a.top) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a.left + t * vx;
  const py = a.top + t * vy;
  return { t, px, py };
}

/* Create axis-aligned legs between two container points (no diagonal)
   returns array of segments [{start,end,length,ratio,meta}]
   order: horizontal first (to target.x), then vertical to target.y
*/
function createOrthogonalLegs(fromPt, toPt, meta = null){
  const segs = [];
  // if already close, return empty
  const d = Math.hypot(toPt.left - fromPt.left, toPt.top - fromPt.top);
  if(d < 0.5) return segs;

  // intermediate point: (toPt.left, fromPt.top)
  const mid = { left: toPt.left, top: fromPt.top };
  // If either horizontal or vertical only, produce a single leg
  if(Math.abs(fromPt.top - toPt.top) < 0.5){
    const length = Math.hypot(toPt.left - fromPt.left, toPt.top - fromPt.top);
    segs.push({ start: { ...fromPt }, end: { ...toPt }, length, ratio: 0, meta });
  } else if(Math.abs(fromPt.left - toPt.left) < 0.5){
    const length = Math.hypot(toPt.left - fromPt.left, toPt.top - fromPt.top);
    segs.push({ start: { ...fromPt }, end: { ...toPt }, length, ratio: 0, meta });
  } else {
    // horizontal then vertical
    const l1 = Math.hypot(mid.left - fromPt.left, mid.top - fromPt.top);
    const l2 = Math.hypot(toPt.left - mid.left, toPt.top - mid.top);
    segs.push({ start: { ...fromPt }, end: mid, length: l1, ratio: 0, meta: null });
    segs.push({ start: mid, end: { ...toPt }, length: l2, ratio: 0, meta });
  }
  return segs;
}

/* place rat on nearest path or area; if off any path create transition to nearest main path */
function placeRatAtNearest() {
  const rect = ratEl.getBoundingClientRect();
  const containerRect = containerEl.getBoundingClientRect();
  const ratX = rect.left + rect.width/2 - containerRect.left;
  const ratY = rect.top + rect.height/2 - containerRect.top;
  const ratPoint = { left: ratX, top: ratY };

  // 1) Check arearooms: if inside, snap to nearest point on that room path (no transition)
  for(let i=0;i<roomPaths.length;i++){
    const rp = roomPaths[i];
    if(pointIsInsideArea(rp.areaEl, ratPoint)){
      // project to the room segment
      const proj = projectPointOnSegment(rp.start, rp.end, ratPoint);
      roomIndex = i;
      roomRatio = proj.t;
      currentMode = 'room';
      // set rat position at projected point
      ratEl.style.left = proj.px + 'px';
      ratEl.style.top = proj.py + 'px';
      posOutput.textContent = `room:${rp.id}`;
      return;
    }
  }

  // 2) Otherwise project to main path. If the rat is not already on that projection, create orthogonal transition
  const nearest = findNearestMainSegmentAndT(ratPoint);
  const projPoint = nearest.proj;

  const dToProj = Math.hypot(projPoint.left - ratPoint.left, projPoint.top - ratPoint.top);
  if(dToProj < 1){
    // close enough: snap directly to main
    currentMode = 'main';
    roomIndex = -1;
    step = nearest.segIndex;
    ratioAlongSegment = nearest.t;
    const p = lerp(path[step], path[(step+1) % path.length], ratioAlongSegment);
    ratEl.style.left = p.left + 'px';
    ratEl.style.top = p.top + 'px';
    return;
  }

  // create transition legs from current rat point to projPoint, and attach finalMain target as meta on final leg
  transitionSegments = createOrthogonalLegs(ratPoint, projPoint, { finalMain: { step: nearest.segIndex, t: nearest.t } });
  transitionIndex = 0;
  // mark each segment's ratio = 0
  transitionSegments.forEach(s => s.ratio = 0);
  currentMode = 'transition';
}

/* -------------------------------
  Room animation
  ------------------------------- */
function animateRoomStep(){
  if(!moving) return;

  const rp = roomPaths[roomIndex];
  if(!rp){
    // fallback to main mode and continue animation
    currentMode = 'main';
    requestAnimationFrame(animateStep);
    return;
  }
  const segLen = rp.length || 1;
  const deltaRatio = (speed / segLen); // same speed
  roomRatio += deltaRatio;

  if(roomRatio >= 1){
    // reached end -> transition to nearest main path smoothly using orthogonal legs
    const endPoint = rp.end;
    const nearest = findNearestMainSegmentAndT(endPoint);
    const projPoint = nearest.proj;
    transitionSegments = createOrthogonalLegs(endPoint, projPoint, { finalMain: { step: nearest.segIndex, t: nearest.t } });
    transitionIndex = 0;
    transitionSegments.forEach(s => s.ratio = 0);
    currentMode = transitionSegments.length ? 'transition' : 'main';
    roomIndex = -1;
    // If no transition segments (very close), jump to main immediately
    if(currentMode === 'main'){
      step = nearest.segIndex;
      ratioAlongSegment = nearest.t;
      const p = lerp(path[step], path[(step+1) % path.length], ratioAlongSegment);
      ratEl.style.left = p.left + 'px';
      ratEl.style.top = p.top + 'px';
      // continue the loop
      requestAnimationFrame(animateStep);
      return;
    } else {
      // we have transition legs; continue the loop
      requestAnimationFrame(animateStep);
      return;
    }
  }

  // still on room path
  const pos = lerp(rp.start, rp.end, roomRatio);
  ratEl.style.left = pos.left + 'px';
  ratEl.style.top = pos.top + 'px';
  posOutput.textContent = `room:${rp.id} L:${Math.round(pos.left)},T:${Math.round(pos.top)}`;
  stepOutput.textContent = `room`;
  dirOutput.textContent = rp.direction;

  requestAnimationFrame(animateStep);
}

/* -------------------------------
  Transition animation (orthogonal legs)
  ------------------------------- */
function animateTransitionStep(){
  if(!moving) return;
  if(transitionIndex < 0 || transitionIndex >= transitionSegments.length){
    // nothing to do -> go to main and continue animation
    currentMode = 'main';
    requestAnimationFrame(animateStep);
    return;
  }
  const seg = transitionSegments[transitionIndex];
  const segLen = seg.length || 1;
  const deltaRatio = (speed / segLen);
  seg.ratio += deltaRatio;

  if(seg.ratio >= 1){
    // clamp and move to end of this leg
    const pos = seg.end;
    ratEl.style.left = pos.left + 'px';
    ratEl.style.top = pos.top + 'px';
    transitionIndex++;
    if(transitionIndex >= transitionSegments.length){
      // finished transition: if finalMain target exists in meta, set main step/t
      const finalMeta = seg.meta || (seg.meta && seg.meta.finalMain) || (transitionSegments.length && transitionSegments[transitionSegments.length-1].meta);
      const finalMain = finalMeta ? finalMeta.finalMain || finalMeta : null;
      if(finalMain){
        step = finalMain.step;
        ratioAlongSegment = finalMain.t;
      }
      currentMode = 'main';
      // place rat exactly at main projected position
      const p = lerp(path[step], path[(step+1) % path.length], ratioAlongSegment);
      ratEl.style.left = p.left + 'px';
      ratEl.style.top = p.top + 'px';
      // continue the loop on main mode
      requestAnimationFrame(animateStep);
      return;
    } else {
      // start next leg
      requestAnimationFrame(animateStep);
      return;
    }
  } else {
    // interpolate along this segment
    const pos = {
      left: seg.start.left + (seg.end.left - seg.start.left) * seg.ratio,
      top: seg.start.top + (seg.end.top - seg.start.top) * seg.ratio
    };
    ratEl.style.left = pos.left + 'px';
    ratEl.style.top = pos.top + 'px';
    requestAnimationFrame(animateStep);
    return;
  }
}

/* -------------------------------
  Main path animation (kept original behavior, adapted)
  ------------------------------- */
function animateMainStep(){
  const start = path[step];
  const endIdx = moveForward ? ((step + 1) % path.length) : ((step - 1 + path.length) % path.length);
  const end = path[endIdx];

  const dx = end.left - start.left;
  const dy = end.top - start.top;
  const segLen = Math.hypot(dx, dy) || 1;

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

  // blocking detection
  const checkSegment = step;
  const blockedInfo = blockedDotBetween(checkSegment, ratioAlongSegment, proposedRatio);
  if(blockedInfo){
    nbOutput.textContent = `Seg ${blockedInfo.segmentIndex} dot ${blockedInfo.meta.label} blocked`;
    moveForward = !moveForward;
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

  ratioAlongSegment = proposedRatio;

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

  const pos = lerp(path[step], path[(step+1) % path.length], ratioAlongSegment);
  ratEl.style.left = pos.left + 'px';
  ratEl.style.top = pos.top + 'px';

  posOutput.textContent = `L:${Math.round(pos.left)}, T:${Math.round(pos.top)}`;
  stepOutput.textContent = `${step}`;
  dirOutput.textContent = moveForward ? "forward" : "back";

  requestAnimationFrame(animateStep);
}

/* dispatcher */
function animateStep(){
  if(!moving) return;
  if(currentMode === 'room'){
    animateRoomStep();
  } else if(currentMode === 'transition'){
    animateTransitionStep();
  } else {
    animateMainStep();
  }
}

/* start/stop handlers */
toggleBtn.addEventListener('click', () => {
  moving = !moving;
  toggleBtn.textContent = moving ? "Stop" : "Start";
  if(moving){
    buildRoomPaths();
    // if rat is off-path, placeRatAtNearest will create transitions if necessary
    placeRatAtNearest();
    if(step < 0) step = 0;
    if(step >= path.length) step = step % path.length;
    requestAnimationFrame(animateStep);
  }
});

resetBtn.addEventListener('click', () => {
  resetAllBlocks();
});

/* drag logic */
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
ratEl.style.left = path[0].left + 'px';
ratEl.style.top = path[0].top + 'px';