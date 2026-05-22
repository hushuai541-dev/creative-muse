// --- Graph Engine ---
// Manages nodes, edges, pan/zoom, drag, spring physics, undo, popup menu

const STORAGE_KEY = 'creative-muse-graph';

// Layout constants
const ROOT_RADIUS = 140;
const CHILD_RADIUS = 120;

// Spring physics
const SPRING_STIFFNESS = 0.08;
const SPRING_DAMPING = 0.75;
const COLLISION_RADIUS = 58;
const COLLISION_FORCE = 1.5;

// Zoom
const MIN_SCALE = 0.2;
const MAX_SCALE = 5.0;

let state = {
  nodes: {},       // id -> node
  edges: [],       // { from, to, type? }
  rootId: null,
  transform: { x: 0, y: 0, scale: 1 },
  undoStack: [],
  nodeIdCounter: 0,
};

// DOM refs (set by init)
let canvasContainer, edgesSvg, nodesLayer, welcomeHint, zoomLevelEl;
let onGraphChange = null;

// Interaction state
let dragging = null;
let panning = null;
let pinching = null;
let selectedNodeId = null;
let animFrameId = null;

// Popup state
let activePopup = null;
let activePopupNodeId = null;
let onPopupAction = null;

// Detail popup state
let detailPopup = null;
let detailPopupNodeId = null;

export function init(options) {
  canvasContainer = options.canvasContainer;
  edgesSvg = options.edgesSvg;
  nodesLayer = options.nodesLayer;
  welcomeHint = options.welcomeHint;
  zoomLevelEl = options.zoomLevelEl;
  onGraphChange = options.onGraphChange || null;

  loadState();
  bindEvents();
  startPhysicsLoop();
  updateWelcomeHint();
  renderAll();
}

// --- Persistence ---

let saveTimeout = null;
function saveState() {
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

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      state.nodes = data.nodes || {};
      state.edges = data.edges || [];
      state.rootId = data.rootId || null;
      state.nodeIdCounter = data.nodeIdCounter || 0;
      // Migrate old data
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
  } catch { /* ignore */ }
}

// --- Node helpers ---

function createNode(zh, en, x, y, parentId = null, mode = 'associate', painType = null) {
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

function getNode(id) {
  return state.nodes[id];
}

function getChildren(nodeId) {
  const node = getNode(nodeId);
  if (!node) return [];
  return node.children.map(id => getNode(id)).filter(Boolean);
}

// --- Layout ---

function layoutChildren(parentId) {
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

// --- Coordinate conversion ---

export function screenToWorld(sx, sy) {
  const rect = canvasContainer.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const { x: tx, y: ty, scale } = state.transform;
  const dx = sx - cx;
  const dy = sy - cy;
  const wx = (dx - tx) / scale;
  const wy = (dy - ty) / scale;
  return { x: wx, y: wy };
}

function worldToScreen(wx, wy) {
  const rect = canvasContainer.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const { scale } = state.transform;
  return {
    x: wx * scale + cx + state.transform.x,
    y: wy * scale + cy + state.transform.y,
  };
}

// --- Rendering ---

function applyTransform() {
  const { x, y, scale } = state.transform;
  nodesLayer.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

function renderAll() {
  applyTransform();
  renderNodes();
  renderEdges();
  updateZoomDisplay();
  updateWelcomeHint();
  renderMinimap();
  saveState();
}

function painTagLabel(type) {
  if (type === 'pain') return '痛';
  if (type === 'pleasure') return '爽';
  if (type === 'scenario') return '场';
  if (type === 'solution') return '解';
  return '';
}

function renderNodes() {
  nodesLayer.innerHTML = '';

  // Collect visible nodes via tree walk from root
  const visibleNodes = [];
  function walk(nid) {
    const node = getNode(nid);
    if (!node) return;
    visibleNodes.push(node);
    if (node.expanded && node.children.length > 0) {
      for (const cid of node.children) walk(cid);
    }
  }
  if (state.rootId) walk(state.rootId);

  for (const node of visibleNodes) {
    const id = node.id;
    const el = document.createElement('div');

    let classList = 'graph-node';
    if (node.parentId === null) classList += ' root-node';
    if (node.expanded && node.parentId !== null) classList += ' expanded-node';
    if (node.painType) classList += ` pain-type-${node.painType}`;
    if (selectedNodeId === id) classList += ' selected';
    el.className = classList;
    el.dataset.nodeId = id;

    const sizeMap = { 0: 96, 1: 76, 2: 66, 3: 58 };
    const fontSizeMap = { 0: 17, 1: 13, 2: 12, 3: 11 };
    const size = sizeMap[node.depth] || 52;
    const fontSize = fontSizeMap[node.depth] || 10;

    const isRoot = node.parentId === null;
    const showExpandBtn = !isRoot;
    const btnSymbol = node.expanded ? '−' : '+';

    el.innerHTML = `
      <div class="node-glass">
        <span class="node-zh">${escapeHtml(node.zh)}</span>
        ${isRoot ? `<span class="node-en">${escapeHtml(node.en)}</span>` : ''}
      </div>
      ${showExpandBtn ? `<button class="node-expand-btn" data-node-id="${id}">${btnSymbol}</button>` : ''}
      ${node.painType ? `<span class="pain-type-tag ${node.painType}">${painTagLabel(node.painType)}</span>` : ''}
      ${node.expanded && node.childCount > 0 ? `<span class="node-child-badge">${node.childCount}</span>` : ''}
    `;

    // Size via CSS variables
    el.style.setProperty('--node-size', size + 'px');
    el.style.setProperty('--font-size-zh', fontSize + 'px');

    const animS = node.animScale;
    const opacity = node.animOpacity;
    const tx = node.x - size / 2;
    const ty = node.y - size / 2;
    el.style.transform = `translate(${tx}px, ${ty}px) scale(${animS})`;
    el.style.opacity = opacity;
    el.style.zIndex = isRoot ? 10 : 5;

    // Click on node body
    el.addEventListener('click', (e) => {
      if (e.target.closest('.node-expand-btn') || e.target.closest('.node-child-badge')) return;
      e.stopPropagation();
      onNodeClick(node);
    });

    // Double-click to show full text
    el.addEventListener('dblclick', (e) => {
      if (e.target.closest('.node-expand-btn') || e.target.closest('.node-child-badge')) return;
      e.stopPropagation();
      if (detailPopupNodeId === node.id) {
        hideDetailPopup();
      } else {
        showDetailPopup(node, el);
      }
    });

    // Drag start
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.node-expand-btn') || e.target.closest('.node-child-badge')) return;
      e.stopPropagation();
      startNodeDrag(node, e.clientX, e.clientY);
    });

    // Touch drag
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        if (e.target.closest('.node-expand-btn') || e.target.closest('.node-child-badge')) return;
        e.stopPropagation();
        startNodeDrag(node, e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    nodesLayer.appendChild(el);
  }

  // Attach expand button listeners
  nodesLayer.querySelectorAll('.node-expand-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nodeId = btn.dataset.nodeId;
      const node = getNode(nodeId);
      if (!node) return;
      if (node.expanded) {
        collapseNode(node);
      } else if (node.children.length > 0) {
        // Re-expand previously collapsed node
        node.expanded = true;
        layoutChildren(nodeId);
        renderAll();
        notifyChange();
      } else {
        if (activePopup && activePopupNodeId === nodeId) {
          hidePopupMenu();
        } else {
          showPopupMenu(nodeId, btn);
        }
      }
    });
  });
}

function getNodeScreenPos(node) {
  const rect = canvasContainer.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;
  const { x: tx, y: ty, scale } = state.transform;
  return {
    x: originX + node.x * scale + tx,
    y: originY + node.y * scale + ty,
  };
}

function renderEdges() {
  // Build visible set from renderNodes walk
  const visibleIds = new Set();
  function walk(nid) {
    const node = getNode(nid);
    if (!node) return;
    visibleIds.add(nid);
    if (node.expanded && node.children.length > 0) {
      for (const cid of node.children) walk(cid);
    }
  }
  if (state.rootId) walk(state.rootId);

  let svgContent = '';
  for (const edge of state.edges) {
    if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) continue;
    const from = getNode(edge.from);
    const to = getNode(edge.to);
    if (!from || !to) continue;

    const fp = getNodeScreenPos(from);
    const tp = getNodeScreenPos(to);

    const rect = canvasContainer.getBoundingClientRect();
    const fx = fp.x - rect.left;
    const fy = fp.y - rect.top;
    const tx_ = tp.x - rect.left;
    const ty_ = tp.y - rect.top;

    const mx = (fx + tx_) / 2;
    const my = (fy + ty_) / 2;
    const dx = tx_ - fx;
    const dy = ty_ - fy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / len * (len * 0.18);
    const perpY = dx / len * (len * 0.18);
    const cpx = mx + perpX;
    const cpy = my + perpY;

    const opacity = Math.min(from.animOpacity, to.animOpacity);
    const type = edge.type || 'solid';
    const className = type === 'dashed' ? 'graph-edge dashed' : 'graph-edge';
    svgContent += `<path d="M${fx},${fy} Q${cpx},${cpy} ${tx_},${ty_}" class="${className}" style="opacity:${opacity}" />`;
  }
  edgesSvg.innerHTML = svgContent;
}

function updateZoomDisplay() {
  if (zoomLevelEl) {
    zoomLevelEl.textContent = Math.round(state.transform.scale * 100) + '%';
  }
}

function updateWelcomeHint() {
  const hasNodes = Object.keys(state.nodes).length > 0;
  if (welcomeHint) welcomeHint.classList.toggle('hidden', hasNodes);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Node interactions ---

function onNodeClick(node) {
  if (dragging) return;

  if (selectedNodeId === node.id) {
    selectedNodeId = null;
  } else {
    if (selectedNodeId) {
      const prev = nodesLayer.querySelector(`.graph-node[data-node-id="${selectedNodeId}"]`);
      if (prev) prev.classList.remove('selected');
    }
    selectedNodeId = node.id;
  }

  nodesLayer.querySelectorAll('.graph-node.selected').forEach(el => {
    if (el.dataset.nodeId !== selectedNodeId) el.classList.remove('selected');
  });
  if (selectedNodeId) {
    const el = nodesLayer.querySelector(`.graph-node[data-node-id="${selectedNodeId}"]`);
    if (el) el.classList.add('selected');
  }
}

// --- Popup Menu ---

function showPopupMenu(nodeId, buttonEl) {
  hidePopupMenu();

  const node = getNode(nodeId);
  const isPainNode = node && node.painType === 'pain';

  const menu = document.createElement('div');
  menu.className = 'popup-menu';
  menu.dataset.nodeId = nodeId;
  menu.innerHTML = `
    <button class="popup-item" data-mode="associate">
      <span class="popup-icon">\u{1F9E0}</span>
      <span>继续发散</span>
    </button>
    <button class="popup-item" data-mode="pain">
      <span class="popup-icon">\u{1F9E8}</span>
      <span>痛点发散</span>
    </button>
    <button class="popup-item" data-mode="scenario">
      <span class="popup-icon">\u{1F3EC}</span>
      <span>场景发散</span>
    </button>
    ${isPainNode ? `
    <button class="popup-item" data-mode="solution">
      <span class="popup-icon">\u{1F4A1}</span>
      <span>解决方案</span>
    </button>
    ` : ''}
  `;

  // Position to the right of the button
  const btnRect = buttonEl.getBoundingClientRect();
  const menuWidth = 178;
  let left = btnRect.right + 8;
  if (left + menuWidth > window.innerWidth - 8) {
    left = btnRect.left - menuWidth - 8;
  }
  let top = btnRect.top - 4;
  if (top + 150 > window.innerHeight) {
    top = window.innerHeight - 160;
  }

  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  document.body.appendChild(menu);

  // Attach item click handlers
  menu.querySelectorAll('.popup-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = item.dataset.mode;
      hidePopupMenu();
      const node = getNode(nodeId);
      if (onPopupAction) onPopupAction(nodeId, node ? node.zh : '', mode);
    });
  });

  requestAnimationFrame(() => {
    menu.classList.add('open');
  });

  activePopup = menu;
  activePopupNodeId = nodeId;
}

function hidePopupMenu() {
  if (!activePopup) return;
  const menu = activePopup;
  activePopup = null;
  activePopupNodeId = null;
  menu.classList.remove('open');
  setTimeout(() => {
    if (menu.parentNode) menu.parentNode.removeChild(menu);
  }, 200);
}

export function setOnPopupAction(fn) {
  onPopupAction = fn;
}

// --- Detail Popup ---

function showDetailPopup(node, nodeEl) {
  hideDetailPopup();

  const detail = document.createElement('div');
  detail.className = 'detail-popup';
  detail.innerHTML = `<span>${escapeHtml(node.zh)}</span>`;

  // Position near the node
  const nodeRect = nodeEl.getBoundingClientRect();
  let left = nodeRect.right + 12;
  let top = nodeRect.top;
  // Flip to left if near right edge
  if (left + 220 > window.innerWidth - 8) {
    left = nodeRect.left - 232;
  }
  if (top + 20 > window.innerHeight) {
    top = window.innerHeight - 30;
  }

  detail.style.left = left + 'px';
  detail.style.top = top + 'px';
  document.body.appendChild(detail);

  requestAnimationFrame(() => {
    detail.classList.add('open');
  });

  detailPopup = detail;
  detailPopupNodeId = node.id;
}

function hideDetailPopup() {
  if (!detailPopup) return;
  const d = detailPopup;
  detailPopup = null;
  detailPopupNodeId = null;
  d.classList.remove('open');
  setTimeout(() => {
    if (d.parentNode) d.parentNode.removeChild(d);
  }, 200);
}

// --- Collapse ---

function collapseNode(node) {
  node.expanded = false;
  renderAll();
  notifyChange();
}

function deleteSelectedNode() {
  if (!selectedNodeId || selectedNodeId === state.rootId) return;
  const node = getNode(selectedNodeId);
  if (!node) return;

  pushUndo();

  const toRemove = new Set();
  function collect(nid) {
    const n = getNode(nid);
    if (!n) return;
    toRemove.add(nid);
    for (const cid of n.children) {
      collect(cid);
    }
  }
  collect(selectedNodeId);

  if (node.parentId) {
    const parent = getNode(node.parentId);
    if (parent) {
      parent.children = parent.children.filter(id => id !== selectedNodeId);
      parent.childCount = parent.children.length;
      if (parent.childCount === 0) {
        parent.expanded = false;
      }
    }
  }

  state.edges = state.edges.filter(e => !toRemove.has(e.from) && !toRemove.has(e.to));
  for (const id of toRemove) {
    delete state.nodes[id];
  }

  selectedNodeId = null;
  renderAll();
  notifyChange();
}

// --- Node dragging ---

function startNodeDrag(node, clientX, clientY) {
  const world = screenToWorld(clientX, clientY);
  pushUndo();
  dragging = {
    nodeId: node.id,
    offsetWorldX: node.x - world.x,
    offsetWorldY: node.y - world.y,
    startX: node.x,
    startY: node.y,
  };
}

function moveNodeDrag(clientX, clientY) {
  if (!dragging) return;
  const node = getNode(dragging.nodeId);
  if (!node) return;
  const world = screenToWorld(clientX, clientY);
  node.x = world.x + dragging.offsetWorldX;
  node.y = world.y + dragging.offsetWorldY;
  node.targetX = node.x;
  node.targetY = node.y;
  updateChildTargets(node);
  renderAll();
}

function endNodeDrag() {
  if (!dragging) return;
  const node = getNode(dragging.nodeId);
  if (node) {
    const dx = node.x - dragging.startX;
    const dy = node.y - dragging.startY;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
      state.undoStack.pop();
    } else {
      notifyChange();
    }
  }
  dragging = null;
}

function updateChildTargets(parent) {
  if (!parent.children.length) return;
  layoutChildren(parent.id);
}

// --- Pan ---

function startPan(clientX, clientY) {
  panning = {
    startX: clientX,
    startY: clientY,
    startTX: state.transform.x,
    startTY: state.transform.y,
  };
}

function movePan(clientX, clientY) {
  if (!panning) return;
  const dx = clientX - panning.startX;
  const dy = clientY - panning.startY;
  state.transform.x = panning.startTX + dx;
  state.transform.y = panning.startTY + dy;
  renderAll();
}

function endPan() {
  panning = null;
}

// --- Zoom ---

export function zoomAt(factor, cx, cy) {
  const oldScale = state.transform.scale;
  const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * factor));
  if (newScale === oldScale) return;

  const rect = canvasContainer.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  const wx = (cx - originX - state.transform.x) / oldScale;
  const wy = (cy - originY - state.transform.y) / oldScale;

  state.transform.scale = newScale;
  state.transform.x = cx - originX - wx * newScale;
  state.transform.y = cy - originY - wy * newScale;

  renderAll();
}

export function fitView() {
  const nodeIds = Object.keys(state.nodes);
  if (nodeIds.length === 0) {
    state.transform = { x: 0, y: 0, scale: 1 };
    renderAll();
    return;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of nodeIds) {
    const n = state.nodes[id];
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }

  const rect = canvasContainer.getBoundingClientRect();
  const padding = 80;
  const worldW = maxX - minX + padding * 2;
  const worldH = maxY - minY + padding * 2;

  const scaleX = rect.width / worldW;
  const scaleY = rect.height / worldH;
  const scale = Math.min(scaleX, scaleY, 2);

  state.transform.scale = scale;
  state.transform.x = 0;
  state.transform.y = 0;

  renderAll();
}

export function clearCanvas() {
  pushUndo();
  state.nodes = {};
  state.edges = [];
  state.rootId = null;
  state.transform = { x: 0, y: 0, scale: 1 };
  state.undoStack = [];
  renderAll();
  notifyChange();
}

// --- Undo ---

function pushUndo() {
  const snapshot = {
    nodes: JSON.parse(JSON.stringify(state.nodes)),
    edges: [...state.edges],
  };
  state.undoStack.push(snapshot);
  if (state.undoStack.length > 30) state.undoStack.shift();
}

export function undo() {
  if (state.undoStack.length === 0) return false;
  const snapshot = state.undoStack.pop();
  state.nodes = snapshot.nodes;
  state.edges = snapshot.edges;
  renderAll();
  notifyChange();
  showUndoToast();
  return true;
}

function showUndoToast() {
  const toast = document.getElementById('undo-toast');
  if (!toast) return;
  toast.classList.remove('hidden');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.add('hidden'), 1500);
}

function notifyChange() {
  if (onGraphChange) onGraphChange();
}

// --- Physics loop ---

function startPhysicsLoop() {
  function tick() {
    let needsUpdate = false;

    for (const id in state.nodes) {
      const node = state.nodes[id];

      if (node.animScale !== node.targetScale) {
        node.animScale += (node.targetScale - node.animScale) * 0.15;
        if (Math.abs(node.targetScale - node.animScale) < 0.002) node.animScale = node.targetScale;
        needsUpdate = true;
      }
      if (node.animOpacity !== node.targetOpacity) {
        node.animOpacity += (node.targetOpacity - node.animOpacity) * 0.15;
        if (Math.abs(node.targetOpacity - node.animOpacity) < 0.002) node.animOpacity = node.targetOpacity;
        needsUpdate = true;
      }

      if (node.parentId === null) continue;
      if (dragging && dragging.nodeId === id) continue;

      const dx = node.targetX - node.x;
      const dy = node.targetY - node.y;
      node.vx += dx * SPRING_STIFFNESS;
      node.vy += dy * SPRING_STIFFNESS;
      node.vx *= SPRING_DAMPING;
      node.vy *= SPRING_DAMPING;
      node.x += node.vx;
      node.y += node.vy;

      if (Math.abs(node.vx) > 0.01 || Math.abs(node.vy) > 0.01) {
        needsUpdate = true;
      }
    }

    // Collision avoidance
    for (const id in state.nodes) {
      const node = state.nodes[id];
      if (!node.parentId) continue;
      const siblings = getChildren(node.parentId);
      for (const sib of siblings) {
        if (sib.id === id) continue;
        const dx = node.x - sib.x;
        const dy = node.y - sib.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = COLLISION_RADIUS;
        if (dist < minDist && dist > 0.001) {
          const force = (minDist - dist) * COLLISION_FORCE * 0.02;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          if (!dragging || dragging.nodeId !== node.id) {
            node.x += fx;
            node.y += fy;
            node.vx += fx * 0.3;
            node.vy += fy * 0.3;
          }
          if (!dragging || dragging.nodeId !== sib.id) {
            sib.x -= fx;
            sib.y -= fy;
            sib.vx -= fx * 0.3;
            sib.vy -= fy * 0.3;
          }
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) {
      renderAll();
    }

    animFrameId = requestAnimationFrame(tick);
  }
  animFrameId = requestAnimationFrame(tick);
}

// --- Events ---

function bindEvents() {
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (isUIClick(e.target)) return;
    if (e.target.closest('.graph-node')) return;
    // Close popup and detail when clicking canvas
    if (activePopup) {
      const isPopup = e.target.closest('.popup-menu');
      if (!isPopup) hidePopupMenu();
    }
    if (detailPopup) {
      const isDetail = e.target.closest('.detail-popup') || e.target.closest('.graph-node');
      if (!isDetail) hideDetailPopup();
    }
    if (selectedNodeId) {
      const prev = nodesLayer.querySelector(`.graph-node[data-node-id="${selectedNodeId}"]`);
      if (prev) prev.classList.remove('selected');
      selectedNodeId = null;
    }
    startPan(e.clientX, e.clientY);
  });

  document.addEventListener('mousemove', (e) => {
    if (dragging) {
      moveNodeDrag(e.clientX, e.clientY);
    } else if (panning) {
      movePan(e.clientX, e.clientY);
    }
  });

  document.addEventListener('mouseup', () => {
    if (dragging) endNodeDrag();
    if (panning) endPan();
  });

  document.addEventListener('wheel', (e) => {
    if (isUIClick(e.target)) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.93;
    zoomAt(factor, e.clientX, e.clientY);
  }, { passive: false });

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
    }
    if (e.touches.length === 1) {
      const target = e.target;
      if (isUIClick(target)) return;
      if (target.closest('.graph-node')) return;
      if (activePopup) {
        const isPopup = target.closest('.popup-menu');
        if (!isPopup) hidePopupMenu();
      }
      startPan(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && (dragging || panning)) {
      e.preventDefault();
      if (dragging) {
        moveNodeDrag(e.touches[0].clientX, e.touches[0].clientY);
      } else if (panning) {
        movePan(e.touches[0].clientX, e.touches[0].clientY);
      }
    }
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (pinching && pinching.lastDist) {
        const factor = dist / pinching.lastDist;
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        zoomAt(factor, cx, cy);
      }
      if (pinching) {
        pinching.lastDist = dist;
      } else {
        pinching = { lastDist: dist };
      }
    }
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (dragging) endNodeDrag();
    if (panning) endPan();
    pinching = null;
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      undo();
    }
    if (e.key === 'Delete' || e.key === 'Del') {
      if (selectedNodeId && selectedNodeId !== state.rootId) {
        e.preventDefault();
        deleteSelectedNode();
      }
    }
    if (e.key === 'Escape') {
      hidePopupMenu();
    }
  });

  window.addEventListener('resize', () => {
    renderAll();
  });
}

function isUIClick(target) {
  return target.closest('.input-area') ||
         target.closest('.zoom-controls') ||
         target.closest('.theme-toggle') ||
         target.closest('.history-drawer') ||
         target.closest('.history-toggle') ||
         target.closest('.history-overlay') ||
         target.closest('.popup-menu') ||
         target.closest('.detail-popup') ||
         target.closest('.node-expand-btn');
}

// --- Public API for main.js ---

export function setRootWord(word) {
  state.nodes = {};
  state.edges = [];
  state.undoStack = [];

  const root = createNode(word, '', 0, 0, null);
  state.nodes[root.id] = root;
  state.rootId = root.id;
  state.transform = { x: 0, y: 0, scale: 1 };

  root.animScale = 0;
  root.animOpacity = 0;
  root.targetScale = 1;
  root.targetOpacity = 1;

  renderAll();
}

export function addChildNodes(parentId, words, mode = 'associate') {
  const parent = getNode(parentId);
  if (!parent) return;

  const edgeType = (mode === 'pain' || mode === 'scenario' || mode === 'solution') ? 'dashed' : 'solid';
  const newChildIds = [];
  for (const w of words) {
    const painType = mode === 'scenario' ? 'scenario' : mode === 'solution' ? 'solution' : (w.type || null);
    const child = createNode(w.zh, w.en, parent.x, parent.y, parentId, mode, painType);
    child.animScale = 0;
    child.animOpacity = 0;
    child.targetScale = 1;
    child.targetOpacity = 1;
    state.nodes[child.id] = child;
    parent.children.push(child.id);
    state.edges.push({ from: parentId, to: child.id, type: edgeType });
    newChildIds.push(child.id);
  }
  parent.expanded = true;
  parent.childCount = parent.children.length;
  layoutChildren(parentId);
  renderAll();
  notifyChange();
  return newChildIds;
}

export function getGraphState() {
  return {
    nodes: JSON.parse(JSON.stringify(state.nodes)),
    edges: [...state.edges],
    rootId: state.rootId,
  };
}

export function restoreGraph(nodes, edges, rootId) {
  state.nodes = JSON.parse(JSON.stringify(nodes));
  state.edges = [...edges];
  state.rootId = rootId;

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
    n.targetX = n.x;
    n.targetY = n.y;
    n.animScale = 1;
    n.animOpacity = 1;
    n.targetScale = 1;
    n.targetOpacity = 1;
  }
  for (const e of state.edges) {
    if (e.type === undefined) e.type = 'solid';
  }

  fitView();
  renderAll();
}

export function hasNodes() {
  return Object.keys(state.nodes).length > 0;
}

export function getRootWord() {
  const root = getNode(state.rootId);
  return root ? root.zh : '';
}

// --- Export to Image ---

export function exportToImage() {
  const rect = canvasContainer.getBoundingClientRect();
  const scale = 2; // 2x for retina
  const w = rect.width * scale;
  const h = rect.height * scale;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Dark background
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, w, h);

  const { x: tx, y: ty, scale: s } = state.transform;
  const cx = rect.width / 2;
  const cy = rect.height / 2;

  ctx.save();
  ctx.translate(cx * scale, cy * scale);
  ctx.scale(s * scale, s * scale);
  ctx.translate(tx / s, ty / s);

  // Draw edges
  for (const edge of state.edges) {
    const from = getNode(edge.from);
    const to = getNode(edge.to);
    if (!from || !to) continue;

    const type = edge.type || 'solid';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const cpx = mx - dy / len * (len * 0.18);
    const cpy = my + dx / len * (len * 0.18);
    ctx.quadraticCurveTo(cpx, cpy, to.x, to.y);
    ctx.strokeStyle = type === 'dashed' ? '#333333' : '#2a2a2a';
    ctx.lineWidth = 1.2;
    if (type === 'dashed') ctx.setLineDash([6, 4]);
    else ctx.setLineDash([]);
    ctx.stroke();
  }

  // Draw nodes
  for (const id in state.nodes) {
    const node = state.nodes[id];
    const isRoot = node.parentId === null;
    const sizeMap = { 0: 96, 1: 76, 2: 66, 3: 58 };
    const size = sizeMap[node.depth] || 52;
    const r = size / 2;

    // Circle background
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);

    if (isRoot || node.expanded) {
      ctx.fillStyle = '#FFD600';
    } else if (node.painType === 'pain') {
      ctx.fillStyle = '#1a1a1a';
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 2;
    } else if (node.painType === 'pleasure') {
      ctx.fillStyle = '#1a1a1a';
      ctx.strokeStyle = '#4ecdc4';
      ctx.lineWidth = 2;
    } else if (node.painType === 'scenario') {
      ctx.fillStyle = '#1a1a1a';
      ctx.strokeStyle = '#5b9bd5';
      ctx.lineWidth = 2;
    } else {
      ctx.fillStyle = '#1a1a1a';
      ctx.strokeStyle = '#2a2a2a';
      ctx.lineWidth = 1.5;
    }
    ctx.fill();
    if (!isRoot && !node.expanded) ctx.stroke();

    // Text
    const fontSizeMap = { 0: 17, 1: 13, 2: 12, 3: 11 };
    const fontSize = fontSizeMap[node.depth] || 10;
    ctx.fillStyle = (isRoot || node.expanded) ? '#1a1a1a' : '#e0e0e0';
    ctx.font = `${node.parentId === null ? '700' : '600'} ${fontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const maxW = r * 1.5;
    const text = node.zh.length > 4 ? node.zh.slice(0, 4) + '..' : node.zh;
    ctx.fillText(text, node.x, node.y);
  }

  ctx.restore();

  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `creative-muse-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// --- Minimap ---

let minimapCanvas = null;
let minimapCtx = null;

function initMinimap() {
  minimapCanvas = document.getElementById('minimap-canvas');
  if (!minimapCanvas) return;
  minimapCtx = minimapCanvas.getContext('2d');
  // Minimap panning
  minimapCanvas.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    handleMinimapClick(e);
  });
  minimapCanvas.addEventListener('mousemove', (e) => {
    if (e.buttons === 1) handleMinimapClick(e);
  });
}

function handleMinimapClick(e) {
  if (!minimapCanvas || Object.keys(state.nodes).length === 0) return;
  const rect = minimapCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // Compute world bounding box of all nodes
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id in state.nodes) {
    const n = state.nodes[id];
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  const pad = 120;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const worldW = maxX - minX;
  const worldH = maxY - minY;

  const mw = minimapCanvas.width;
  const mh = minimapCanvas.height;
  const aspect = mw / mh;
  let sw, sh, ox, oy;
  if (worldW / worldH > aspect) {
    sw = worldW;
    sh = worldW / aspect;
    ox = 0;
    oy = (sh - worldH) / 2;
  } else {
    sh = worldH;
    sw = worldH * aspect;
    ox = (sw - worldW) / 2;
    oy = 0;
  }

  const mapX = (mx - 0) / mw * sw + minX - ox;
  const mapY = (my - 0) / mh * sh + minY - oy;

  const containerRect = canvasContainer.getBoundingClientRect();
  const cw = containerRect.width;
  const ch = containerRect.height;
  state.transform.x = cw / 2 - mapX * state.transform.scale;
  state.transform.y = ch / 2 - mapY * state.transform.scale;
  renderAll();
}

function renderMinimap() {
  if (!minimapCtx) {
    initMinimap();
    if (!minimapCtx) return;
  }

  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  const ctx = minimapCtx;

  // Dark semi-transparent bg
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(18, 18, 18, 0.85)';
  ctx.beginPath();
  const radius = 8;
  ctx.moveTo(radius, 0);
  ctx.lineTo(w - radius, 0);
  ctx.arcTo(w, 0, w, radius, radius);
  ctx.lineTo(w, h - radius);
  ctx.arcTo(w, h, w - radius, h, radius);
  ctx.lineTo(radius, h);
  ctx.arcTo(0, h, 0, h - radius, radius);
  ctx.lineTo(0, radius);
  ctx.arcTo(0, 0, radius, 0, radius);
  ctx.fill();

  const nodeIds = Object.keys(state.nodes);
  if (nodeIds.length === 0) return;

  // Compute world bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of nodeIds) {
    const n = state.nodes[id];
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  const pad = 120;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const worldW = maxX - minX;
  const worldH = maxY - minY;

  const aspect = w / h;
  let sw, sh, ox, oy;
  if (worldW / worldH > aspect) {
    sw = worldW;
    sh = worldW / aspect;
    ox = 0;
    oy = (sh - worldH) / 2;
  } else {
    sh = worldH;
    sw = worldH * aspect;
    ox = (sw - worldW) / 2;
    oy = 0;
  }

  function worldToMap(wx, wy) {
    return {
      x: (wx - minX + ox) / sw * w,
      y: (wy - minY + oy) / sh * h,
    };
  }

  // Draw node dots
  for (const id in state.nodes) {
    const n = state.nodes[id];
    const p = worldToMap(n.x, n.y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, n.parentId === null ? 3.5 : 2, 0, Math.PI * 2);
    ctx.fillStyle = n.parentId === null ? '#FFD600' : (n.expanded ? '#e8b830' : '#505050');
    ctx.fill();
  }

  // Draw viewport rect
  const containerRect = canvasContainer.getBoundingClientRect();
  const cw = containerRect.width;
  const ch = containerRect.height;
  const { scale } = state.transform;
  const vpW = cw / scale;
  const vpH = ch / scale;
  const vpCenterX = cw / 2 - state.transform.x;
  const vpCenterY = ch / 2 - state.transform.y;
  const vpMinX = (vpCenterX - vpW / 2) / scale;
  const vpMinY = (vpCenterY - vpH / 2) / scale;
  // Actually viewport in world coords
  // World point at screen (0,0): wx = (0 - cx - tx) / scale
  // World point at screen (cw,ch): wx = (cw - cx - tx) / scale
  const vpX1 = (0 - cw / 2 - state.transform.x) / scale;
  const vpY1 = (0 - ch / 2 - state.transform.y) / scale;
  const vpX2 = (cw - cw / 2 - state.transform.x) / scale;
  const vpY2 = (ch - ch / 2 - state.transform.y) / scale;

  const p1 = worldToMap(vpX1, vpY1);
  const p2 = worldToMap(vpX2, vpY2);

  ctx.strokeStyle = '#FFD600';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
}
