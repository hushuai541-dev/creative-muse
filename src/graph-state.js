// --- Graph State Module ---
// Data model, node CRUD, persistence, layout, coordinates

export const STORAGE_KEY = 'creative-muse-graph';

export const ROOT_RADIUS = 140;
export const CHILD_RADIUS = 120;

export const SPRING_STIFFNESS = 0.08;
export const SPRING_DAMPING = 0.75;
export const COLLISION_RADIUS = 58;
export const COLLISION_FORCE = 1.5;

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 5.0;

export const state = {
  nodes: {},
  edges: [],
  rootId: null,
  transform: { x: 0, y: 0, scale: 1 },
  undoStack: [],
  nodeIdCounter: 0,
};

export let canvasContainer, edgesSvg, nodesLayer, welcomeHint, zoomLevelEl;
export let onGraphChange = null;
let _onPopupAction = null;
export let onPopupAction = null; // backward compat, set via setOnPopupAction
export function setOnPopupAction(fn) { _onPopupAction = fn; onPopupAction = fn; }

export function setDomRefs(refs) {
  canvasContainer = refs.canvasContainer;
  edgesSvg = refs.edgesSvg;
  nodesLayer = refs.nodesLayer;
  welcomeHint = refs.welcomeHint;
  zoomLevelEl = refs.zoomLevelEl;
  onGraphChange = refs.onGraphChange || null;
}

// --- Persistence ---

let saveTimeout = null;
export function saveState() {
  if (saveTimeout) return;
  saveTimeout = setTimeout(() => {
    saveTimeout = null;
    const data = {
      nodes: state.nodes,
      edges: state.edges,
      rootId: state.rootId,
      nodeIdCounter: state.nodeIdCounter,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* ignore */ }
  }, 300);
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      applyStateData(JSON.parse(raw));
    }
  } catch { /* ignore */ }
}

export function loadStateFromData(data) {
  if (!data) return;
  applyStateData(data);
}

function applyStateData(data) {
  state.nodes = data.nodes || {};
  state.edges = data.edges || [];
  state.rootId = data.rootId || null;
  state.nodeIdCounter = data.nodeIdCounter || 0;
  for (const id in state.nodes) {
    const n = state.nodes[id];
    if (n.mode === undefined) n.mode = 'associate';
    if (n.painType === undefined) n.painType = null;
    if (n.depth === undefined) {
      let d = 0, cur = n;
      while (cur.parentId && state.nodes[cur.parentId]) { d++; cur = state.nodes[cur.parentId]; }
      n.depth = d;
    }
    n.vx = 0;
    n.vy = 0;
  }
  for (const e of state.edges) {
    if (e.type === undefined) e.type = 'solid';
  }
}

export function exportState() {
  return JSON.parse(JSON.stringify({
    nodes: state.nodes,
    edges: state.edges,
    rootId: state.rootId,
    nodeIdCounter: state.nodeIdCounter,
  }));
}

// --- Node CRUD ---

export function createNode(zh, en, x, y, parentId = null, mode = 'associate', painType = null) {
  const id = `n${++state.nodeIdCounter}`;
  const parent = parentId ? state.nodes[parentId] : null;
  const depth = parent ? ((parent.depth || 0) + 1) : 0;
  return {
    id, zh, en, x, y, parentId,
    children: [], expanded: false, childCount: 0,
    animScale: 0, animOpacity: 0,
    targetScale: 1, targetOpacity: 1,
    vx: 0, vy: 0, targetX: x, targetY: y,
    mode, painType, depth,
  };
}

export function getNode(id) { return state.nodes[id]; }
export function getChildren(nodeId) {
  const node = getNode(nodeId);
  if (!node) return [];
  return node.children.map(id => getNode(id)).filter(Boolean);
}
export function hasNodes() { return Object.keys(state.nodes).length > 0; }
export function getRootWord() {
  const root = getNode(state.rootId);
  return root ? root.zh : '';
}

// --- Layout ---

export function layoutChildren(parentId) {
  const parent = getNode(parentId);
  if (!parent) return;
  const children = getChildren(parentId);
  const count = children.length;
  if (count === 0) return;
  const radius = parent.parentId === null ? ROOT_RADIUS : CHILD_RADIUS;
  const angleStep = (2 * Math.PI) / count;
  const startAngle = (parent.x * 0.1 + parent.y * 0.1) % (2 * Math.PI);
  children.forEach((child, i) => {
    const angle = startAngle + i * angleStep;
    child.targetX = parent.x + Math.cos(angle) * radius;
    child.targetY = parent.y + Math.sin(angle) * radius;
    if (child.x === parent.x && child.y === parent.y) {
      child.x = parent.x;
      child.y = parent.y;
      child.animScale = 0;
      child.animOpacity = 0;
    }
  });
}

// --- Coordinates ---

export function screenToWorld(sx, sy) {
  const rect = canvasContainer.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const { x: tx, y: ty, scale } = state.transform;
  return {
    x: (sx - cx - tx) / scale,
    y: (sy - cy - ty) / scale,
  };
}

export function getNodeScreenPos(node) {
  const rect = canvasContainer.getBoundingClientRect();
  const ox = rect.left + rect.width / 2;
  const oy = rect.top + rect.height / 2;
  const { x: tx, y: ty, scale } = state.transform;
  return { x: ox + node.x * scale + tx, y: oy + node.y * scale + ty };
}

// --- Undo ---

export function pushUndo() {
  const snapshot = {
    nodes: JSON.parse(JSON.stringify(state.nodes)),
    edges: [...state.edges],
  };
  state.undoStack.push(snapshot);
  if (state.undoStack.length > 30) state.undoStack.shift();
}

export function popUndo() {
  if (state.undoStack.length === 0) return null;
  return state.undoStack.pop();
}

// --- Interaction state (shared across modules) ---

export let dragging = null;
export let panning = null;
export let pinching = null;
export let selectedNodeId = null;
export let animFrameId = null;
export let activePopup = null;
export let activePopupNodeId = null;
export let detailPopup = null;
export let detailPopupNodeId = null;

export function setDragging(v) { dragging = v; }
export function setPanning(v) { panning = v; }
export function setPinching(v) { pinching = v; }
export function setSelectedNodeId(v) { selectedNodeId = v; }
export function setAnimFrameId(v) { animFrameId = v; }
export function setActivePopup(v) { activePopup = v; }
export function setActivePopupNodeId(v) { activePopupNodeId = v; }
export function setDetailPopup(v) { detailPopup = v; }
export function setDetailPopupNodeId(v) { detailPopupNodeId = v; }
