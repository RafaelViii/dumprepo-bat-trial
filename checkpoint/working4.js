/* try11.js
   Your provided file with only the trail-related changes merged in.
   I replaced the dot generation and added trail helper functions, and
   hooked trail handling into animateMainStep so dots become visible (trail)
   when the rat passes over them and toggle off when passed again.
   The rest of your original logic (rooms, transitions, hazards, UI) is unchanged.
*/

/* ===========================
   BEGIN: original / existing code (kept as provided)
   =========================== */

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
  Dot creation (main path) - REPLACED WITH TRAIL-AWARE VERSION
  This version creates dots and stores meta (x,y,t,blocked,trail) for each dot.
  Dots are invisible by default; trail toggling uses inline styles so visibility is reliable.
*/
function createDotsForAllSegments(){
  // remove any existing dots
  document.querySelectorAll('.dot').forEach(d => d.remove());
  dotsBySegment.length = 0;

  const container = document.querySelector('.container');

  for (let i = 0; i < path.length; i++) {
    const start = path[i];
    const end = path[(i + 1) % path.length]; // wrap
    const segmentLen = dist(start, end);
    let count = Math.min(
      MAX_LABELS,
      Math.max(2, Math.round(segmentLen / DOT_SPACING) + 1)
    );
    if (count > MAX_LABELS) count = MAX_LABELS;

    const arr = [];
    for (let k = 0; k < count; k++) {
      const t = count === 1 ? 0 : (k / (count - 1));
      const pos = lerp(start, end, t);

      const dot = document.createElement('div');
      dot.className = 'dot';
      // position & sizing
      dot.style.position = 'absolute';
      dot.style.left = pos.left + 'px';
      dot.style.top = pos.top + 'px';
      dot.style.width = '10px';
      dot.style.height = '10px';
      dot.style.transform = 'translate(-50%, -50%)';
      dot.style.borderRadius = '50%';
      dot.style.zIndex = '600';
      // ensure invisible by default using inline styles (prevent CSS specificity issues)
      dot.style.opacity = '0';
      dot.style.background = 'transparent';
      dot.style.boxShadow = 'none';
      dot.style.transition = 'opacity 0.12s linear, transform 0.12s ease, box-shadow 0.12s ease';

      // optional label for debugging
      const label = labels[Math.min(k, labels.length - 1)];
      const labelEl = document.createElement('div');
      labelEl.className = 'label';
      labelEl.textContent = label;
      // keep label hidden by default (optional)
      labelEl.style.display = 'none';
      dot.appendChild(labelEl);

      // dataset metadata for compatibility with other code
      dot.dataset.segment = i;
      dot.dataset.index = k;
      dot.dataset.label = label;
      dot.dataset.blocked = "false";
      dot.dataset.t = t.toString();

      const meta = { el: dot, x: pos.left, y: pos.top, label, blocked: false, t: t, trail: false };

      // legacy click toggles blocked (keeps existing functionality)
      dot.addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleDotBlocked(i, k);
      });

      container.appendChild(dot);
      arr.push(meta);
    }

    dotsBySegment.push(arr);
  }
}

/* Helper: toggle trail state on a single dot meta
   This sets inline styles to ensure visibility changes take effect.
   Trail color is red; blocked (hazard) dots keep their blocked visuals.
*/
function toggleDotTrail(dotMeta){
  if(!dotMeta || !dotMeta.el) return;

  dotMeta.trail = !dotMeta.trail;
  const el = dotMeta.el;

  if(dotMeta.trail){
    // show trail: inline styles override other CSS
    el.classList.add('trail');
    el.style.opacity = '1';
    el.style.background = 'rgba(235,60,60,0.95)'; // red trail
    el.style.boxShadow = '0 2px 6px rgba(180,40,40,0.7)';
    el.style.transform = 'translate(-50%, -50%) scale(1.05)';
  } else {
    el.classList.remove('trail');
    // if it's blocked (hazard), keep blocked visuals
    if(dotMeta.blocked){
      el.style.opacity = '1';
      el.style.background = 'rgba(255,120,20,0.98)';
      el.style.boxShadow = '0 2px 8px rgba(200,100,20,0.8)';
      el.style.transform = 'translate(-50%, -50%) scale(1.15)';
    } else {
      // hide again
      el.style.opacity = '0';
      el.style.background = 'transparent';
      el.style.boxShadow = 'none';
      el.style.transform = 'translate(-50%, -50%)';
    }
  }
}

/* Mark/toggle all dots in segIdx whose t falls in [low, high] (inclusive).
   low/high are in 0..1, may be low > high (we normalize). */
function handleTrailForSegment(segIdx, low, high){
  if(!dotsBySegment || segIdx < 0 || segIdx >= dotsBySegment.length) return;
  const segDots = dotsBySegment[segIdx];
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  for (let i = 0; i < segDots.length; i++){
    const d = segDots[i];
    const t = d.t;
    if (t + 1e-9 >= lo && t - 1e-9 <= hi){
      // toggle trail state for this dot
      toggleDotTrail(d);
    }
  }
}

/* Cross-segment trail handling: takes current step and ratio and the proposed next ratio.
   Handles the common case where proposed ratio only crosses at most one boundary. */
function handleTrailCrossingsAcrossSegments(stepIndex, rCurr, rNext){
  // normalize small floating noise
  if(Math.abs(rCurr - rNext) < 1e-9) return;

  if(rNext >= 0 && rNext <= 1){
    // no boundary crossing
    handleTrailForSegment(stepIndex, rCurr, rNext);
    return;
  }

  // forward crossing (rNext > 1)
  if(rNext > 1){
    // mark from rCurr..1 on current segment
    handleTrailForSegment(stepIndex, rCurr, 1);
    const remaining = rNext - 1;
    const nextSeg = (stepIndex + 1) % path.length;
    handleTrailForSegment(nextSeg, 0, remaining);
    return;
  }

  // backward crossing (rNext < 0)
  if(rNext < 0){
    // we moved backward into previous segment.
    // previous segment t range to mark is rNext+1 .. 1
    const prevSeg = (stepIndex - 1 + path.length) % path.length;
    const rNextMod = rNext + 1; // between 0..1
    handleTrailForSegment(prevSeg, rNextMod, 1);
    // also mark from 0..rCurr on current segment (we passed the start of current going backwards)
    handleTrailForSegment(stepIndex, 0, rCurr);
    return;
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
  Now with trail toggling integrated before blocked-dot detection.
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

  // TRAIL: handle dots crossed between current ratio and proposed ratio
  // This toggles dot.trail (and inline visuals) for dots passed during this frame.
  handleTrailCrossingsAcrossSegments(step, ratioAlongSegment, proposedRatio);

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
      // after clearing block, restore trail visibility or hide based on trail flag
      if(blockedInfo.meta.trail){
        blockedInfo.meta.el.style.opacity = '1';
        blockedInfo.meta.el.style.background = 'rgba(235,60,60,0.95)';
      } else {
        blockedInfo.meta.el.style.opacity = '0';
        blockedInfo.meta.el.style.background = 'transparent';
      }
    }, 1000);
    dirOutput.textContent = moveForward ? "forward" : "back";
    return requestAnimationFrame(animateStep);
  } else {
    nbOutput.textContent = "...";
  }

  // commit movement
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

/* ===========================
   END: original code
   =========================== */


/* ===========================
   BEGIN: ICON / HAZARD HANDLING (REVISED)
   - Marks dots (dotsBySegment) within a 50x50 area
   - Uses existing 'blocked' class so movement logic treats them as blockers
   - ResetHazards clears blocked state from dots and removes placed icons
   =========================== */
(function(){
  // Ensure DOM references exist
  const iconsListEl = document.getElementById('iconsList');
  const mapContainer = document.getElementById('mapContainer') || containerEl;
  const resetHazardsBtn = document.getElementById('resetHazardsBtn');

  if(!iconsListEl || !mapContainer) {
    console.warn('Icons panel or map container missing.');
    return;
  }

  // keep track of placed hazard images and affected dots
  const placedHazardImages = [];
  const hazardDots = new Set(); // set of dot meta objects that were marked by hazards

  // Build icon cards from ICONS[] (from icons.js)
  if(typeof ICONS === 'undefined') {
    console.warn('ICONS array not found (icons.js).');
  } else {
    ICONS.forEach(icon => {
      const card = document.createElement('div');
      card.className = 'icon-card';
      card.setAttribute('draggable', 'true');
      card.dataset.iconId = icon.id;
      card.dataset.iconSrc = icon.src || '';
      // inner content
      const img = document.createElement('img');
      img.className = 'icon-img';
      img.src = icon.src;
      img.alt = icon.label || icon.id;

      const lbl = document.createElement('div');
      lbl.className = 'icon-label';
      lbl.textContent = icon.label || icon.id;

      card.appendChild(img);
      card.appendChild(lbl);
      iconsListEl.appendChild(card);

      // dragstart: pass the src and id
      card.addEventListener('dragstart', (ev) => {
        try {
          ev.dataTransfer.setData('text/plain', icon.src);
          ev.dataTransfer.setData('application/icon-id', icon.id);
          if(img.complete){
            ev.dataTransfer.setDragImage(img, img.width/2, img.height/2);
          }
        } catch(e) {
          // ignore
        }
      });

      // click selects card for click-then-place workflow
      card.addEventListener('click', () => {
        document.querySelectorAll('.icon-card.selected').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });
  }

  // Allow dropping on mapContainer
  mapContainer.addEventListener('dragover', (ev) => {
    ev.preventDefault(); // allow drop
  });

  mapContainer.addEventListener('drop', (ev) => {
    ev.preventDefault();
    const src = ev.dataTransfer.getData('text/plain');
    const iconId = ev.dataTransfer.getData('application/icon-id') || '';
    if(!src) return;

    const containerRect = mapContainer.getBoundingClientRect();
    const dropX = ev.clientX - containerRect.left;
    const dropY = ev.clientY - containerRect.top;

    placeHazardAtPoint({ left: dropX, top: dropY }, src, iconId);
  });

  // Support placing by click: select an icon then click on map
  mapContainer.addEventListener('click', (ev) => {
    const selected = document.querySelector('.icon-card.selected');
    if(!selected) return;
    const src = selected.dataset.iconSrc;
    const id  = selected.dataset.iconId;
    if(!src) return;
    const containerRect = mapContainer.getBoundingClientRect();
    const dropX = ev.clientX - containerRect.left;
    const dropY = ev.clientY - containerRect.top;
    placeHazardAtPoint({ left: dropX, top: dropY }, src, id);
    // keep selection for multiple placements
  });

  // hazard area size (50x50)
  const AREA_SIZE = 50;
  const HSIZE = AREA_SIZE / 2;

  function placeHazardAtPoint(point, iconSrc, iconId = ''){
    // place a small visual icon at the drop point
    const img = document.createElement('img');
    img.src = iconSrc;
    img.className = 'placed-hazard';
    img.style.left = point.left + 'px';
    img.style.top = point.top + 'px';
    img.dataset.iconId = iconId;
    mapContainer.appendChild(img);
    placedHazardImages.push(img);

    // compute square centered at point (container coords)
    const sqLeft = point.left - HSIZE;
    const sqTop = point.top - HSIZE;
    const sqRight = sqLeft + AREA_SIZE;
    const sqBottom = sqTop + AREA_SIZE;

    // If dots haven't been generated yet, create them first
    if(!dotsBySegment || dotsBySegment.length === 0){
      createDotsForAllSegments();
    }

    // iterate all dots in dotsBySegment and mark those that are inside the square
    for(let segIdx = 0; segIdx < dotsBySegment.length; segIdx++){
      const segDots = dotsBySegment[segIdx];
      for(let i=0;i<segDots.length;i++){
        const d = segDots[i];
        const x = d.x;
        const y = d.y;
        // intersects if dot center lies within square
        if(x >= sqLeft && x <= sqRight && y >= sqTop && y <= sqBottom){
          // mark as blocked/hazard (persistent until reset)
          d.blocked = true;
          d.el.dataset.blocked = "true";
          d.el.classList.add('blocked'); // reuse blocked style so it integrates with movement logic
          // record which hazard marked it (optional)
          d.el.dataset.hazardIcon = iconId || '';
          hazardDots.add(d);

          // ensure blocked visuals visible immediately
          d.el.style.opacity = '1';
          d.el.style.background = 'rgba(255,120,20,0.98)';
          d.el.style.boxShadow = '0 2px 8px rgba(200,100,20,0.8)';
          d.el.style.transform = 'translate(-50%,-50%) scale(1.15)';
        }
      }
    }
  }

  // Reset hazards control
  if(resetHazardsBtn){
    resetHazardsBtn.addEventListener('click', () => {
      // Unmark all hazard-marked dots
      hazardDots.forEach(d => {
        d.blocked = false;
        d.el.classList.remove('blocked');
        d.el.dataset.blocked = "false";
        delete d.el.dataset.hazardIcon;
        // restore based on trail flag
        if(d.trail){
          d.el.style.opacity = '1';
          d.el.style.background = 'rgba(235,60,60,0.95)';
          d.el.style.boxShadow = '0 2px 6px rgba(180,40,40,0.7)';
          d.el.style.transform = 'translate(-50%,-50%) scale(1.05)';
        } else {
          d.el.style.opacity = '0';
          d.el.style.background = 'transparent';
          d.el.style.boxShadow = 'none';
          d.el.style.transform = 'translate(-50%,-50%)';
        }
      });
      hazardDots.clear();

      // remove placed images
      placedHazardImages.forEach(img => img.remove());
      placedHazardImages.length = 0;

      // clear any selected icon
      document.querySelectorAll('.icon-card.selected').forEach(c => c.classList.remove('selected'));
    });
  }

  // Expose a small API on window for debugging if needed
  window.__hazardUtils = {
    placeHazardAtPoint,
    resetHazards: () => resetHazardsBtn && resetHazardsBtn.click(),
    getHazardDots: () => Array.from(hazardDots)
  };

})();

/* ===========================
   END: ICON / HAZARD HANDLING
   =========================== */