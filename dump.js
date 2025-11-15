/* try11.js
   Merged full working version with follower-record-and-playback that only replays the final visible red trail:
   - Records person (ratEl) center positions while simulation runs.
   - When the person reaches a finish, recording stops.
   - At finish we construct a playback trail by mapping recorded positions to the current visible trail dots
     (dots whose meta.trail === true) and removing any points that correspond to cleared/hidden dots.
   - Clicking Follow replays the resulting playback trail with assets/user.png (follower).
   - Playback speed and record spacing are configurable via PLAYBACK_INTERVAL_MS and RECORD_SPACING.
   - Keeps all original pathing, room/transition handling, dot marking and hazard logic intact.
*/

/* ===========================
   BEGIN: original / existing code (kept as provided + merged follower code)
   =========================== */

const containerEl = document.querySelector('.container');

/* -------------------------------
  Original main path coordinatesup
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
// Replace this with your server's IP/address, e.g. ws://192.168.1.10:8081
// GAGO KA!
// const POVID_SERVER_URL = 'wss://YOUR_SERVER_NIGADOMAIN_OR_IP:PORT/'; 
// let povWs;
// function connectPovWs() {
//   povWs = new WebSocket(POVID_SERVER_URL);
// }
// connectPovWs();

const DOT_SPACING = 10;
const MAX_LABELS = 26;
const labels = "abcdefghijklmnopqrstuvwxyz".split("");

// main path dots: dotsBySegment[segmentIndex] = [meta,...]
const dotsBySegment = [];

/* -------------------------------
  New: room path dots (one-way)
  - roomDotsByIndex[roomIndex] = [meta,...]
  ------------------------------- */
const roomDotsByIndex = []; // parallel to roomPaths (built after buildRoomPaths)

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

  // Rebuild room dots whenever roomPaths are rebuilt
  createRoomDotsForPaths();
}

/* Find nearest main segment and projection t for a point */
function findNearestMainSegmentAndT(point){
  let best = { segIndex: 0, t: 0, d: Infinity, proj: { left: path[0].left, top: path[0].top } };
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

/* ================================
   DOT GENERATION & TRAIL HELPERS
   - main path dots (dotsBySegment) keep toggle-on/toggle-off behavior
   - room path dots (roomDotsByIndex) are one-way: once set visible they stay
   - transition movement will mark nearby main dots using setDotTrail (no toggle)
   ================================ */

/* Create main path dots and store meta on dotsBySegment */
function createDotsForAllSegments(){
  // remove any existing dots
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
      // make sure default state is invisible (inline styles to avoid CSS specificity issues)
      dot.style.position = 'absolute';
      dot.style.opacity = '0';
      dot.style.background = 'transparent';
      dot.style.width = '10px';
      dot.style.height = '10px';
      dot.style.transform = 'translate(-50%,-50%)';
      dot.style.borderRadius = '50%';
      dot.style.zIndex = '600';
      dot.style.transition = 'opacity 0.12s linear, transform 0.12s ease, box-shadow 0.12s ease';

      const label = labels[Math.min(k, labels.length-1)];
      const labelEl = document.createElement('div');
      labelEl.className = 'label';
      labelEl.textContent = label;
      // hide label by default
      labelEl.style.display = 'none';
      dot.appendChild(labelEl);

      dot.dataset.segment = i;
      dot.dataset.index = k;
      dot.dataset.label = label;
      dot.dataset.blocked = "false";
      dot.dataset.t = t.toString();

      const meta = { el: dot, x: pos.left, y: pos.top, label, blocked: false, t: t, trail: false };

      dot.addEventListener('click', (ev) => { ev.stopPropagation(); toggleDotBlocked(i,k); });

      containerEl.appendChild(dot);
      arr.push(meta);
    }

    dotsBySegment.push(arr);
  }
}

/* Create dots for room paths (one-way). They are stored in roomDotsByIndex in same order as roomPaths. */
function createRoomDotsForPaths(){
  // remove any existing room-dot elements
  document.querySelectorAll('.room-dot').forEach(d=>d.remove());
  roomDotsByIndex.length = 0;

  for(let ri = 0; ri < roomPaths.length; ri++){
    const rp = roomPaths[ri];
    if(!rp) { roomDotsByIndex.push([]); continue; }
    const start = rp.start;
    const end = rp.end;
    const segLen = Math.hypot(end.left - start.left, end.top - start.top) || 1;
    let count = Math.max(2, Math.round(segLen / DOT_SPACING) + 1);
    // cap count modestly to avoid excessive dots on long room paths
    count = Math.min(count, 40);

    const arr = [];
    for(let k=0;k<count;k++){
      const t = (count===1) ? 0 : (k / (count-1));
      const pos = lerp(start, end, t);

      const dot = document.createElement('div');
      dot.className = 'room-dot';
      dot.style.left = pos.left + 'px';
      dot.style.top = pos.top + 'px';
      dot.style.position = 'absolute';
      dot.style.opacity = '0';
      dot.style.background = 'transparent';
      dot.style.width = '9px';
      dot.style.height = '9px';
      dot.style.transform = 'translate(-50%,-50%)';
      dot.style.borderRadius = '50%';
      dot.style.zIndex = '610';
      dot.style.transition = 'opacity 0.12s linear, transform 0.12s ease, box-shadow 0.12s ease';

      const meta = { el: dot, x: pos.left, y: pos.top, t, trail: false, roomIndex: ri };

      containerEl.appendChild(dot);
      arr.push(meta);
    }

    roomDotsByIndex.push(arr);
  }
}

/* Visual helpers: set main dot trail only (no toggle) - used during transitions/room->main moves */
function setDotTrail(dotMeta){
  if(!dotMeta || !dotMeta.el) return;
  if(dotMeta.trail) return; // already set
  dotMeta.trail = true;
  const el = dotMeta.el;
  el.classList.add('trail');
  el.style.opacity = '1';
  el.style.background = 'rgba(235,60,60,0.95)'; // red trail
  el.style.boxShadow = '0 2px 6px rgba(180,40,40,0.7)';
  el.style.transform = 'translate(-50%,-50%) scale(1.05)';
}

/* Toggle main dot (for main-path movement): original toggle behavior */
function toggleDotTrail(dotMeta){
  if(!dotMeta || !dotMeta.el) return;
  dotMeta.trail = !dotMeta.trail;
  const el = dotMeta.el;
  if(dotMeta.trail){
    el.classList.add('trail');
    el.style.opacity = '1';
    el.style.background = 'rgba(235,60,60,0.95)';
    el.style.boxShadow = '0 2px 6px rgba(180,40,40,0.7)';
    el.style.transform = 'translate(-50%,-50%) scale(1.05)';
  } else {
    el.classList.remove('trail');
    if(dotMeta.blocked){
      // keep blocked visual
      el.style.opacity = '1';
      el.style.background = 'rgba(255,120,20,0.98)';
      el.style.boxShadow = '0 2px 8px rgba(200,100,20,0.8)';
      el.style.transform = 'translate(-50%,-50%) scale(1.15)';
    } else {
      el.style.opacity = '0';
      el.style.background = 'transparent';
      el.style.boxShadow = 'none';
      el.style.transform = 'translate(-50%,-50%)';
    }
  }
}

/* Set room-dot trail (one-way: only turn on, never toggle off) */
function setRoomDotTrail(roomDotMeta){
  if(!roomDotMeta || !roomDotMeta.el) return;
  if(roomDotMeta.trail) return;
  roomDotMeta.trail = true;
  const el = roomDotMeta.el;
  el.classList.add('trail');
  el.style.opacity = '1';
  el.style.background = 'rgba(235,60,60,0.95)';
  el.style.boxShadow = '0 2px 6px rgba(180,40,40,0.7)';
  el.style.transform = 'translate(-50%,-50%) scale(1.05)';
}

/* Toggle all main-path dots in segIdx whose t falls in [low, high] (inclusive). */
function handleTrailForSegment(segIdx, low, high){
  if(!dotsBySegment || segIdx < 0 || segIdx >= dotsBySegment.length) return;
  const segDots = dotsBySegment[segIdx];
  const lo = Math.min(low, high);
  const hi = Math.max(low, high);
  for (let i = 0; i < segDots.length; i++){
    const d = segDots[i];
    const t = d.t;
    if (t + 1e-9 >= lo && t - 1e-9 <= hi){
      // main path movement should toggle (first pass on, second pass off)
      toggleDotTrail(d);
    }
  }
}

/* Cross-segment trail handling: handles a single-frame move that may cross one boundary */
function handleTrailCrossingsAcrossSegments(stepIndex, rCurr, rNext){
  if(!dotsBySegment || dotsBySegment.length === 0) return;
  if(Math.abs(rCurr - rNext) < 1e-9) return;

  if(rNext >= 0 && rNext <= 1){
    handleTrailForSegment(stepIndex, rCurr, rNext);
    return;
  }

  if(rNext > 1){
    handleTrailForSegment(stepIndex, rCurr, 1);
    const remaining = rNext - 1;
    const nextSeg = (stepIndex + 1) % path.length;
    handleTrailForSegment(nextSeg, 0, remaining);
    return;
  }

  if(rNext < 0){
    const prevSeg = (stepIndex - 1 + path.length) % path.length;
    const rNextMod = rNext + 1;
    handleTrailForSegment(prevSeg, rNextMod, 1);
    handleTrailForSegment(stepIndex, 0, rCurr);
    return;
  }
}

/* Helper: mark nearby main dots by proximity (used during transition and for out-of-bounds travel)
   This sets dots to trail (not toggle) for any that are within `radius` of `point`.
*/
function markNearbyMainDots(point, radius = 8){
  if(!dotsBySegment || dotsBySegment.length === 0) return;
  const r2 = radius * radius;
  for(let s=0;s<dotsBySegment.length;s++){
    const seg = dotsBySegment[s];
    for(let i=0;i<seg.length;i++){
      const d = seg[i];
      if(d.trail) continue; // already trailed
      const dx = d.x - point.left;
      const dy = d.y - point.top;
      if(dx*dx + dy*dy <= r2){
        setDotTrail(d);
      }
    }
  }
}

/* Helper: mark nearby room dots by proximity (used while moving on a room path or transition)
   Room dots are one-way: set them when encountered.
   FIX: Only mark a room's dots if the given point is actually inside that room's area.
*/
function markNearbyRoomDots(point, radius=8){
  if(!roomDotsByIndex || roomDotsByIndex.length === 0) return;
  const r2 = radius * radius;

  for(let ri=0; ri<roomDotsByIndex.length; ri++){
    const arr = roomDotsByIndex[ri];
    const rp = roomPaths[ri];
    if(!rp || !rp.areaEl) continue; // skip if we don't have area info

    // Only mark this room's dots when the point is inside that room's area
    if(!pointIsInsideArea(rp.areaEl, point)) continue;

    for(let j=0;j<arr.length;j++){
      const d = arr[j];
      if(d.trail) continue;
      const dx = d.x - point.left;
      const dy = d.y - point.top;
      if(dx*dx + dy*dy <= r2){
        setRoomDotTrail(d);
      }
    }
  }
}

/* ================================
   END DOT GENERATION & TRAIL HELPERS
   ================================ */

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
  if(dotMeta.blocked) {
    dotMeta.el.classList.add('blocked');
    // ensure blocked visuals
    dotMeta.el.style.opacity = '1';
    dotMeta.el.style.background = 'rgba(255,120,20,0.98)';
    dotMeta.el.style.boxShadow = '0 2px 8px rgba(200,100,20,0.8)';
    dotMeta.el.style.transform = 'translate(-50%,-50%) scale(1.15)';
  } else {
    dotMeta.el.classList.remove('blocked');
    // restore based on trail flag
    if(dotMeta.trail){
      dotMeta.el.style.opacity = '1';
      dotMeta.el.style.background = 'rgba(235,60,60,0.95)';
    } else {
      dotMeta.el.style.opacity = '0';
      dotMeta.el.style.background = 'transparent';
      dotMeta.el.style.boxShadow = 'none';
      dotMeta.el.style.transform = 'translate(-50%,-50%)';
    }
  }
}

function resetAllBlocks(){
  for(const seg of dotsBySegment){
    for(const d of seg){
      d.blocked = false;
      d.el.classList.remove('blocked');
      d.el.dataset.blocked = "false";
      // hide if no trail
      if(!d.trail){
        d.el.style.opacity = '0';
        d.el.style.background = 'transparent';
        d.el.style.boxShadow = 'none';
        d.el.style.transform = 'translate(-50%,-50%)';
      }
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
const followBtn = document.getElementById('followBtn');
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

/* ========================
   FOLLOWER: recording + playback
   ======================== */
// recording/trail data
let recordedTrail = [];       // array of {left,top} container coordinates (raw record)
let recording = false;        // set true while simulation (moving) is active
let trailComplete = false;    // becomes true once person reaches finish
const RECORD_SPACING = 6;     // minimum distance (px) between recorded points

// playback state
let followActive = false;
let followerEl = null;
let playbackRAF = null;
let playbackIdx = 0;
let playbackLastTime = 0;
const PLAYBACK_INTERVAL_MS = 100; // ms per playback step (~50 FPS)

// computed playback points (built from recordedTrail mapped to visible trail dots at finish)
let playbackTrailPoints = []; // array of {left,top}

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
      // mark nearby room dots at this start position so initial dot lights if within radius
      markNearbyRoomDots(proj, 10);
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
  const prevRatio = roomRatio;
  roomRatio += deltaRatio;

  // mark room dots passed between prevRatio and roomRatio
  // find indices of room dots and set one-way trail for dots whose t in range
  const roomDots = roomDotsByIndex[roomIndex] || [];
  if(roomDots.length){
    const lo = Math.min(prevRatio, roomRatio);
    const hi = Math.max(prevRatio, roomRatio);
    for(const d of roomDots){
      if(!d.trail && d.t + 1e-9 >= lo && d.t - 1e-9 <= hi){
        setRoomDotTrail(d);
      }
    }
  }

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
      // record this final position
      recordCurrentRatPosition();
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
  // record position for trail
  recordCurrentRatPosition();
  // while moving on room path also mark near main dots if any (so room->main connection shows main dots)
  markNearbyMainDots(pos, 8);

  posOutput.textContent = `room:${rp.id} L:${Math.round(pos.left)},T:${Math.round(pos.top)}`;
  stepOutput.textContent = `room`;
  dirOutput.textContent = rp.direction;

  requestAnimationFrame(animateStep);
}

/* -------------------------------
  Transition animation (orthogonal legs)
  - while moving on transition legs mark nearby main dots (setDotTrail) so a circle appears
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
    // record
    recordCurrentRatPosition();
    // mark nearby main dots at leg end
    markNearbyMainDots(pos, 8);
    // also mark nearby room dots (in case landing near a room path)
    markNearbyRoomDots(pos, 8);

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
      // record
      recordCurrentRatPosition();
      // ensure the projection dot is marked as trail
      // find nearest dot on that segment (approx)
      const segDots = dotsBySegment[step] || [];
      if(segDots.length){
        // pick the dot whose t is closest to ratioAlongSegment
        let best = segDots[0]; let bestD = Infinity;
        for(const d of segDots){
          const dd = Math.abs(d.t - ratioAlongSegment);
          if(dd < bestD){ bestD = dd; best = d; }
        }
        if(best) setDotTrail(best);
      }
      // continue the loop on main mode
      requestAnimationFrame(animateStep);
      return;
    } else {
      // start next leg
      requestAnimationFrame(animateStep);
      return;
    }
  } else {
    // interpolate along this segment and mark nearby main/room dots
    const pos = {
      left: seg.start.left + (seg.end.left - seg.start.left) * seg.ratio,
      top: seg.start.top + (seg.end.top - seg.start.top) * seg.ratio
    };
    ratEl.style.left = pos.left + 'px';
    ratEl.style.top = pos.top + 'px';
    // record
    recordCurrentRatPosition();
    // mark main dots near the transition path
    markNearbyMainDots(pos, 8);
    markNearbyRoomDots(pos, 8);
    requestAnimationFrame(animateStep);
    return;
  }
}

/* -------------------------------
  Main path animation (kept original behavior, adapted)
  - Trail handling remains as toggle (pass twice clears) for main path
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
  let reachedFinish = false;
  finishLines.forEach(f => {
    const distToFinish = Math.hypot(ratX - f.pos.left, ratY - f.pos.top);
    if(distToFinish < 12){
      reachedFinish = true;
    }
  });
  if(reachedFinish){
    // stop simulation and finalize recording
    moving = false;
    recording = false;
    trailComplete = true;

    const person = document.getElementById("hide");
    person.style.transition = `opacity ${fadeSpeed} ease`; // use same fade speed
    person.style.opacity = "1"; // fade person back in
    // Build playback trail now from recordedTrail but filter to visible dot trail
    buildPlaybackTrailFromRecorded();
    if(followBtn) followBtn.disabled = false;
    toggleBtn.textContent = "Done";
    console.log(`You've reached the exit safely`);
    // ensure final position recorded (rat center)
    recordCurrentRatPosition();
    return;
  }





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

  // record this position for trail recording
  recordCurrentRatPosition();

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

/* ===========================
   FOLLOWER: helpers for recording + playback
   =========================== */

// helper: rat center in container coords
function getRatCenterPoint(){
  const rect = ratEl.getBoundingClientRect();
  const containerRect = containerEl.getBoundingClientRect();
  return {
    left: rect.left + rect.width/2 - containerRect.left,
    top:  rect.top  + rect.height/2 - containerRect.top
  };
}

/* ---------- Helper: distance ---------- */
function pointDist(a,b){
  return Math.hypot(a.left - b.left, a.top - b.top);
}

/* ---------- Helper: push record if far enough ---------- */
function recordTrailPoint(pt){
  if(!recording) return;
  if(recordedTrail.length === 0){
    recordedTrail.push({ left: pt.left, top: pt.top });
    return;
  }
  const last = recordedTrail[recordedTrail.length - 1];
  if(pointDist(last, pt) >= RECORD_SPACING){
    recordedTrail.push({ left: pt.left, top: pt.top });
  }
}

/* ---------- Combined helper used by animation frames ---------- */
function recordCurrentRatPosition(){
  if(!recording) return;
  const p = getRatCenterPoint();
  recordTrailPoint(p);
}

/* ---------- Create or refresh follower image ---------- */
function createFollowerIfNeeded(){
  if(!followerEl){
    // Create new follower if it doesn't exist
    followerEl = document.createElement('img');
    followerEl.className = 'follower';
    followerEl.style.position = 'absolute';
    followerEl.style.transform = 'translate(-50%,-50%)';
    followerEl.style.pointerEvents = 'none';
    followerEl.style.zIndex = '900';
    followerEl.style.width = '20px';
    followerEl.style.height = '20px';
    containerEl.appendChild(followerEl);
  }

  // Randomly pick boy or girl every time
  const images = ['assets/boy.png', 'assets/girl.png'];
  const randomIndex = Math.floor(Math.random() * images.length);
  followerEl.src = images[randomIndex];
}


/* ---------- Playback loop: step through playbackTrailPoints[] ---------- */
function playbackStep(timestamp){
  if(!followActive) return; // stopped externally
  if(!playbackLastTime) playbackLastTime = timestamp;
  const elapsed = timestamp - playbackLastTime;

  if(elapsed >= PLAYBACK_INTERVAL_MS){
    playbackLastTime = timestamp;
    // place follower at current index
    if(playbackIdx >= playbackTrailPoints.length){
      // finished playback
      followActive = false;
      if(followBtn) followBtn.textContent = 'Follow Path';
      playbackIdx = 0;
      playbackLastTime = 0;
      return;
    }
    const pos = playbackTrailPoints[playbackIdx];
    if(pos && followerEl){
      followerEl.style.left = pos.left + 'px';
      followerEl.style.top  = pos.top  + 'px';
      broadcastFollowerPosition(pos); // <==========  THIS LINE!
    }
    playbackIdx++;
  }

  playbackRAF = requestAnimationFrame(playbackStep);
}

/* ---------- Helper: find nearest dot meta (main or room) to a point ----------
   Returns {meta, distance} or null if none found within maxDist
*/
function findNearestDotMeta(point, maxDist = 14){
  let best = null;
  let bestD = Infinity;

  // search main dots
  for(let s=0;s<dotsBySegment.length;s++){
    const seg = dotsBySegment[s];
    for(let i=0;i<seg.length;i++){
      const d = seg[i];
      const dx = d.x - point.left;
      const dy = d.y - point.top;
      const dd = dx*dx + dy*dy;
      if(dd < bestD && dd <= maxDist*maxDist){
        bestD = dd;
        best = d;
      }
    }
  }

  // search room dots
  for(let ri=0; ri<roomDotsByIndex.length; ri++){
    const arr = roomDotsByIndex[ri] || [];
    for(let j=0;j<arr.length;j++){
      const d = arr[j];
      const dx = d.x - point.left;
      const dy = d.y - point.top;
      const dd = dx*dx + dy*dy;
      if(dd < bestD && dd <= maxDist*maxDist){
        bestD = dd;
        best = d;
      }
    }
  }

  if(!best) return null;
  return { meta: best, distance: Math.sqrt(bestD) };
}

/* ---------- Build playbackTrailPoints from recordedTrail mapping only to visible trail dots ----------
   Idea:
   - Walk recordedTrail in order (chronological).
   - For each recorded point, find nearest dot meta (main or room) within threshold.
   - If that dot.meta.trail === true (i.e., visible final red trail), include that dot (by its coordinates)
     in playback list, but avoid duplicates (same dot repeated).
   - This yields playbackTrailPoints in the same chronological order as the person originally traveled,
     but filtered to only include dots that are currently visible as trail (opacity 1).
*/
function buildPlaybackTrailFromRecorded(){
  playbackTrailPoints = [];
  const includedSet = new Set(); // use object identity via meta.el to dedupe

  if(!recordedTrail || recordedTrail.length === 0){
    console.log('No recordedTrail to build playback from.');
    return;
  }

  for(const p of recordedTrail){
    const nearest = findNearestDotMeta(p, 14);
    if(!nearest) continue;
    const meta = nearest.meta;
    if(!meta || !meta.trail) continue; // only include visible trail dots

    const key = meta.el; // DOM element used as unique key
    if(includedSet.has(key)) continue;
    includedSet.add(key);
    playbackTrailPoints.push({ left: meta.x, top: meta.y });
  }

  // As a fallback, if playbackTrailPoints is empty but there are visible dots,
  // build playbackTrailPoints by scanning dots in path order:
  if(playbackTrailPoints.length === 0){
    // scan room dots first (in index order), then main path segments in order
    for(let ri=0; ri<roomDotsByIndex.length; ri++){
      const arr = roomDotsByIndex[ri] || [];
      for(const d of arr){
        if(d.trail){
          playbackTrailPoints.push({ left: d.x, top: d.y });
        }
      }
    }
    for(let s=0; s<dotsBySegment.length; s++){
      const arr = dotsBySegment[s];
      for(const d of arr){
        if(d.trail){
          playbackTrailPoints.push({ left: d.x, top: d.y });
        }
      }
    }
  }

  // Remove any consecutive duplicates
  const compact = [];
  let prev = null;
  for(const pt of playbackTrailPoints){
    if(!prev || Math.abs(prev.left - pt.left) > 1e-6 || Math.abs(prev.top - pt.top) > 1e-6){
      compact.push(pt);
      prev = pt;
    }
  }
  playbackTrailPoints = compact;
  console.log('Built playback trail points:', playbackTrailPoints.length);
}

/* -------------------------------
  Follow button handler
  - follow is disabled until a trail is complete
  ------------------------------- */
if(followBtn){
  // initially disable follow until a trail is complete
  followBtn.disabled = true;

  followBtn.addEventListener('click', () => {
    // If there is no finished trail, disallow
    if(!trailComplete){
      console.log('No completed trail yet. Let the person reach the finish before following.');
      return;
    }

    // Toggle follow mode
    followActive = !followActive;
    followBtn.textContent = followActive ? 'Stop Follow' : 'Follow Path';

    if(followActive){
      // start playback from the beginning
      if(!playbackTrailPoints || playbackTrailPoints.length === 0){
        console.log('Playback trail empty — nothing to follow.');
        followActive = false;
        followBtn.textContent = 'Follow Path';
        return;
      }

      createFollowerIfNeeded();

      // place follower at the very beginning of the playback trail (exact start)
      const start = playbackTrailPoints[0];
      followerEl.style.left = start.left + 'px';
      followerEl.style.top  = start.top  + 'px';

      // init playback state and begin RAF loop
      playbackIdx = 0;
      playbackLastTime = 0;
      playbackRAF = requestAnimationFrame(playbackStep);
    } else {
      // stop playback
      if(playbackRAF) cancelAnimationFrame(playbackRAF);
      playbackRAF = null;
    }
  });
}

/* start/stop handlers */
  toggleBtn.addEventListener('click', () => {
  // Toggle moving and init recording states
  moving = !moving;
  toggleBtn.textContent = moving ? "Stop" : "Start";

  if(moving){
    // When starting a new simulation run, clear previous trail and prepare recording
    recordedTrail = [];
    recording = true;
    trailComplete = false;
    playbackTrailPoints = [];
    if(followBtn) followBtn.disabled = true;

    buildRoomPaths();
    // if main dots haven't been created yet, create them
    if(dotsBySegment.length === 0) createDotsForAllSegments();
    // create room dots if not present (buildRoomPaths already calls createRoomDotsForPaths)
    if(roomDotsByIndex.length === 0) createRoomDotsForPaths();
    // if rat is off-path, placeRatAtNearest will create transitions if necessary
    placeRatAtNearest();
    if(step < 0) step = 0;
    if(step >= path.length) step = step % path.length;
    requestAnimationFrame(animateStep);
  } else {
    // If user manually stops simulation mid-way, stop recording but do not mark trailComplete
    recording = false;
    // leave recordedTrail as-is (user may resume or restart)
  }
});

resetBtn.addEventListener('click', () => {
  resetAllBlocks();
  // Also clear any previous recordings and follower
  recordedTrail = [];
  recording = false;
  trailComplete = false;
  playbackTrailPoints = [];
  if(followBtn) followBtn.disabled = true;
  if(followerEl){
    followerEl.remove();
    followerEl = null;
  }
  if(playbackRAF) { cancelAnimationFrame(playbackRAF); playbackRAF = null; }
  followActive = false;
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
createRoomDotsForPaths();
createFinishMarkers();
ratEl.style.left = path[0].left + 'px';
ratEl.style.top = path[0].top + 'px';

/* ===========================
   END: original + merged changes
   =========================== */

/* ===========================
   ICON / HAZARD IIFE (unchanged)
   - Top-level: builds icon panel, creates cards, supports click-to-place and drag/drop
   - Places visible hazard image on map and marks nearby main-path dots as blocked
   - Defensive: waits for DOMContentLoaded and for ICONS to exist
   =========================== */
function broadcastFollowerPosition(pos) {
  if (povWs && povWs.readyState === 1) {
    povWs.send(JSON.stringify({ type: "pov-update", pos }));
    console.log("Sent position update:", pos); // <--- add this line!
  } else {
    // Optional debug
    console.log("WebSocket not ready:", povWs.readyState);
  }
}
if(pos && followerEl) {
  followerEl.style.left = pos.left + 'px';
  followerEl.style.top  = pos.top  + 'px';
  // SEND TO SERVER
  broadcastFollowerPosition(pos);
}

(function initIconsAndHazards(){
  function setup(){
    const mapContainer = document.getElementById('mapContainer') || containerEl;
    if(!mapContainer){
      console.warn('initIconsAndHazards: map container not found; aborting icons/hazard setup.');
      return;
    }

    if(typeof ICONS === 'undefined'){
      console.warn('initIconsAndHazards: ICONS is undefined. No icons will be shown.');
      window.ICONS = [];
    }
    const ICONS_LOCAL = window.ICONS || [];

    // find .areafull element (area where icons are allowed). If missing, fallback to whole container.
    const areaFullEl = document.querySelector('.areafull');

    // Helper: returns area bounds relative to container (left, top, right, bottom)
    function getAreaBounds(){
      const containerRect = mapContainer.getBoundingClientRect();
      if(areaFullEl){
        const a = areaFullEl.getBoundingClientRect();
        const left = a.left - containerRect.left;
        const top = a.top - containerRect.top;
        return {
          left,
          top,
          right: left + a.width,
          bottom: top + a.height,
          width: a.width,
          height: a.height
        };
      } else {
        // fallback: full container
        return { left: 0, top: 0, right: containerRect.width, bottom: containerRect.height, width: containerRect.width, height: containerRect.height };
      }
    }

    // Helper: clamp a point (in container coords) to the area bounds
    function clampToArea(point){
      const b = getAreaBounds();
      const x = Math.max(b.left, Math.min(point.left, b.right));
      const y = Math.max(b.top, Math.min(point.top, b.bottom));
      return { left: x, top: y };
    }

    // Ensure icons panel exists (create if missing)
    let iconsListEl = document.getElementById('iconsList');
    if(!iconsListEl){
      const panel = document.createElement('aside');
      panel.className = 'icons-panel';
      panel.id = 'iconsPanel';
      panel.innerHTML = `
        <h2 class="icons-title">Hazard Icons</h2>
        <div class="icons-list" id="iconsList"></div>
        <div class="icons-actions">
          <button id="resetHazardsBtn" class="btn secondary">Reset Hazards</button>
        </div>
      `;
      document.body.appendChild(panel);
      iconsListEl = document.getElementById('iconsList');
    }

    // Clear previous content
    iconsListEl.innerHTML = '';

    // Data structures to track placed visuals and affected dot metas
    const placedHazardImages = [];
    const hazardDots = new Set();
    const AREA = 50;
    const HALF = AREA / 2;

    // Build icon cards
    ICONS_LOCAL.forEach(icon => {
      const card = document.createElement('div');
      card.className = 'icon-card';
      card.setAttribute('draggable','true');
      card.dataset.iconId = icon.id || '';
      card.dataset.iconSrc = icon.src || '';

      const img = document.createElement('img');
      img.className = 'icon-img';
      img.src = icon.src || '';
      img.alt = icon.label || icon.id || '';

      const lbl = document.createElement('div');
      lbl.className = 'icon-label';
      lbl.textContent = icon.label || icon.id || '';

      card.appendChild(img);
      card.appendChild(lbl);
      iconsListEl.appendChild(card);

      // dragstart: pass src and id; use drag image when available
      card.addEventListener('dragstart', ev => {
        try{
          ev.dataTransfer.setData('text/plain', icon.src || '');
          ev.dataTransfer.setData('application/icon-id', icon.id || '');
          if(img.complete) ev.dataTransfer.setDragImage(img, img.width/2, img.height/2);
        }catch(e){}
      });

      // click to select for click-to-place
      card.addEventListener('click', () => {
        document.querySelectorAll('.icon-card.selected').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });

    // Handler that places the hazard image and marks dots
    function placeHazardAtPoint(point, iconSrc, iconId=''){
      // clamp to area (safety)
      const pt = clampToArea(point);

      // add visual icon
      const ph = document.createElement('img');
      ph.src = iconSrc;
      ph.className = 'placed-hazard';
      ph.style.position = 'absolute';
      ph.style.left = pt.left + 'px';
      ph.style.top = pt.top + 'px';
      ph.style.transform = 'translate(-50%,-50%)';
      ph.style.zIndex = '800';
      // prevent placed element from intercepting map clicks (so it does not trigger re-placement)
      ph.style.pointerEvents = 'none';
      ph.dataset.iconId = iconId;
      mapContainer.appendChild(ph);
      placedHazardImages.push(ph);

      // compute square and mark dots
      const left = pt.left - HALF;
      const top = pt.top - HALF;
      const right = left + AREA;
      const bottom = top + AREA;

      // ensure dots exist
      if(!dotsBySegment || dotsBySegment.length === 0) createDotsForAllSegments();

      for(let s=0;s<dotsBySegment.length;s++){
        const arr = dotsBySegment[s];
        for(let i=0;i<arr.length;i++){
          const d = arr[i];
          if(d.x >= left && d.x <= right && d.y >= top && d.y <= bottom){
            d.blocked = true;
            d.el.dataset.blocked = "true";
            d.el.classList.add('blocked');
            d.el.dataset.hazardIcon = iconId || '';
            // ensure blocked visuals inline
            d.el.style.opacity = '1';
            d.el.style.background = 'rgba(255,120,20,0.98)';
            d.el.style.boxShadow = '0 2px 8px rgba(200,100,20,0.8)';
            d.el.style.transform = 'translate(-50%,-50%) scale(1.15)';
            hazardDots.add(d);
          }
        }
      }
    }

    // wire drop & click handlers on mapContainer
    mapContainer.addEventListener('dragover', e => e.preventDefault());
    mapContainer.addEventListener('drop', e => {
      e.preventDefault();
      // ignore drops coming from icons panel (safety)
      if(e.target.closest && e.target.closest('.icons-panel')) return;

      const src = e.dataTransfer.getData('text/plain');
      const iconId = e.dataTransfer.getData('application/icon-id') || '';
      if(!src) return;
      const rect = mapContainer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // clamp drop point inside areafull
      const clamped = clampToArea({ left: x, top: y });
      placeHazardAtPoint(clamped, src, iconId);
    });

    // click-to-place selected icon (ignore clicks from placed-hazard or icons-panel)
    mapContainer.addEventListener('click', e => {
      if(e.target.closest && e.target.closest('.placed-hazard')) return;
      if(e.target.closest && e.target.closest('.icons-panel')) return;

      const selected = document.querySelector('.icon-card.selected');
      if(!selected) return;
      const src = selected.dataset.iconSrc;
      const id = selected.dataset.iconId;
      if(!src) return;
      const rect = mapContainer.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const clamped = clampToArea({ left: x, top: y });
      placeHazardAtPoint(clamped, src, id);
    });

    // reset hazards button
    function resetHandler(){
      hazardDots.forEach(d => {
        d.blocked = false;
        delete d.el.dataset.hazardIcon;
        d.el.classList.remove('blocked');
        d.el.dataset.blocked = "false";
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
      placedHazardImages.forEach(img => img.remove());
      placedHazardImages.length = 0;
      document.querySelectorAll('.icon-card.selected').forEach(c => c.classList.remove('selected'));
    }
    const resetBtn = document.getElementById('resetBtn');
    if(resetBtn) resetBtn.addEventListener('click', resetHandler);

    // expose API
    window.__hazardUtils = {
      placeHazardAtPoint,
      resetHazards: resetHandler,
      hazardDots,
      placedHazardImages
    };

    console.log('initIconsAndHazards: initialized, icons:', ICONS_LOCAL.length);
  } // end setup

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setTimeout(setup, 0);
  }
})();

/* Expose debug helpers for convenience */
window.__debugTrail = {
  dotsBySegment,
  roomDotsByIndex,
  setDotTrail,
  setRoomDotTrail,
  markNearbyMainDots,
  markNearbyRoomDots
};