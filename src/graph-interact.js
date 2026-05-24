// --- Graph Interact Module ---
// Drag, pan, zoom, popup, collapse, events, public API

import * as S from './graph-state.js';
import * as R from './graph-render.js';
import { startPhysicsLoop } from './graph-physics.js';

// Wire render callbacks (called from graph.js entry)
export function wireCallbacks() {
  R.setNodeClick(onNodeClick);
  R.setNodeDblClick(onNodeDblClick);
  R.setNodeMouseDown(onNodeMouseDown);
  R.setExpandBtnClick(onExpandBtnClick);
}

// --- Popup ---

export function showPopupMenu(nodeId, buttonEl) {
  hidePopupMenu();
  const node = S.getNode(nodeId);
  const isPainNode = node && node.painType === 'pain';

  const menu = document.createElement('div');
  menu.className = 'popup-menu';
  menu.dataset.nodeId = nodeId;
  menu.innerHTML = `
    <button class="popup-item" data-mode="associate"><span class="popup-icon">🧠</span><span>继续发散</span></button>
    <button class="popup-item" data-mode="pain"><span class="popup-icon">🧨</span><span>痛点发散</span></button>
    <button class="popup-item" data-mode="scenario"><span class="popup-icon">🏬</span><span>场景发散</span></button>
    ${isPainNode ? '<button class="popup-item" data-mode="solution"><span class="popup-icon">💡</span><span>解决方案</span></button>' : ''}
  `;

  const btnRect = buttonEl.getBoundingClientRect();
  const menuWidth = 178;
  let left = btnRect.right + 8;
  if (left + menuWidth > window.innerWidth - 8) left = btnRect.left - menuWidth - 8;
  let top = btnRect.top - 4;
  if (top + 150 > window.innerHeight) top = window.innerHeight - 160;

  menu.style.left = left + 'px'; menu.style.top = top + 'px';
  document.body.appendChild(menu);

  menu.querySelectorAll('.popup-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = item.dataset.mode;
      hidePopupMenu();
      const n = S.getNode(nodeId);
      if (S.onPopupAction) S.onPopupAction(nodeId, n ? n.zh : '', mode);
    });
  });

  requestAnimationFrame(() => menu.classList.add('open'));
  S.setActivePopup(menu);
  S.setActivePopupNodeId(nodeId);
}

export function hidePopupMenu() {
  if (!S.activePopup) return;
  const menu = S.activePopup;
  S.setActivePopup(null);
  S.setActivePopupNodeId(null);
  menu.classList.remove('open');
  setTimeout(() => { if (menu.parentNode) menu.parentNode.removeChild(menu); }, 200);
}

// --- Detail Popup ---

export function showDetailPopup(node, nodeEl) {
  hideDetailPopup();
  const detail = document.createElement('div');
  detail.className = 'detail-popup';
  detail.innerHTML = `<span>${escapeHtml(node.zh)}</span>`;

  const nodeRect = nodeEl.getBoundingClientRect();
  let left = nodeRect.right + 12;
  let top = nodeRect.top;
  if (left + 220 > window.innerWidth - 8) left = nodeRect.left - 232;
  if (top + 20 > window.innerHeight) top = window.innerHeight - 30;
  detail.style.left = left + 'px'; detail.style.top = top + 'px';
  document.body.appendChild(detail);
  requestAnimationFrame(() => detail.classList.add('open'));
  S.setDetailPopup(detail);
  S.setDetailPopupNodeId(node.id);
}

export function hideDetailPopup() {
  if (!S.detailPopup) return;
  const d = S.detailPopup;
  S.setDetailPopup(null);
  S.setDetailPopupNodeId(null);
  d.classList.remove('open');
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 200);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str; return div.innerHTML;
}

// --- Node actions ---

function onNodeClick(node) {
  if (S.dragging) return;
  const prev = S.selectedNodeId;
  if (prev === node.id) {
    S.setSelectedNodeId(null);
  } else {
    S.setSelectedNodeId(node.id);
  }
  // Update DOM class
  if (prev) {
    const oldEl = S.nodesLayer.querySelector(`.graph-node[data-node-id="${prev}"]`);
    if (oldEl) oldEl.classList.remove('selected');
  }
  const el = S.nodesLayer.querySelector(`.graph-node[data-node-id="${node.id}"]`);
  if (el) {
    if (prev === node.id) el.classList.remove('selected');
    else el.classList.add('selected');
  }
}

function onNodeDblClick(node, nodeEl) {
  if (S.detailPopupNodeId === node.id) {
    hideDetailPopup();
  } else {
    showDetailPopup(node, nodeEl);
  }
}

function onNodeMouseDown(node, clientX, clientY) {
  startNodeDrag(node, clientX, clientY);
}

function onExpandBtnClick(node, btn) {
  if (node.expanded) {
    collapseNode(node);
  } else if (node.children.length > 0) {
    node.expanded = true;
    S.layoutChildren(node.id);
    R.renderAll();
    notifyChange();
  } else {
    if (S.activePopup && S.activePopupNodeId === node.id) {
      hidePopupMenu();
    } else {
      showPopupMenu(node.id, btn);
    }
  }
}

function collapseNode(node) {
  node.expanded = false;
  R.renderAll();
  notifyChange();
}

function deleteSelectedNode() {
  if (!S.selectedNodeId || S.selectedNodeId === S.state.rootId) return;
  const node = S.getNode(S.selectedNodeId);
  if (!node) return;
  S.pushUndo();
  const toRemove = new Set();
  function collect(nid) {
    const n = S.getNode(nid);
    if (!n) return;
    toRemove.add(nid);
    for (const cid of n.children) collect(cid);
  }
  collect(S.selectedNodeId);
  if (node.parentId) {
    const parent = S.getNode(node.parentId);
    if (parent) {
      parent.children = parent.children.filter(id => id !== S.selectedNodeId);
      parent.childCount = parent.children.length;
      if (parent.childCount === 0) parent.expanded = false;
    }
  }
  S.state.edges = S.state.edges.filter(e => !toRemove.has(e.from) && !toRemove.has(e.to));
  for (const id of toRemove) delete S.state.nodes[id];
  S.setSelectedNodeId(null);
  R.renderAll();
  notifyChange();
}

// --- Drag ---

function startNodeDrag(node, clientX, clientY) {
  const world = S.screenToWorld(clientX, clientY);
  S.pushUndo();
  S.setDragging({
    nodeId: node.id,
    offsetWorldX: node.x - world.x,
    offsetWorldY: node.y - world.y,
    startX: node.x,
    startY: node.y,
  });
}

function moveNodeDrag(clientX, clientY) {
  if (!S.dragging) return;
  const node = S.getNode(S.dragging.nodeId);
  if (!node) return;
  const world = S.screenToWorld(clientX, clientY);
  node.x = world.x + S.dragging.offsetWorldX;
  node.y = world.y + S.dragging.offsetWorldY;
  node.targetX = node.x;
  node.targetY = node.y;
  updateChildTargets(node);
  R.renderAll();
}

function endNodeDrag() {
  if (!S.dragging) return;
  const node = S.getNode(S.dragging.nodeId);
  if (node) {
    node.vx = 0; node.vy = 0;
    const dx = node.x - S.dragging.startX;
    const dy = node.y - S.dragging.startY;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) S.popUndo();
    else notifyChange();
  }
  S.setDragging(null);
}

function updateChildTargets(parent) {
  if (!parent.children.length) return;
  S.layoutChildren(parent.id);
}

// --- Pan ---

function startPan(clientX, clientY) {
  S.setPanning({ startX: clientX, startY: clientY, startTX: S.state.transform.x, startTY: S.state.transform.y });
}

function movePan(clientX, clientY) {
  if (!S.panning) return;
  S.state.transform.x = S.panning.startTX + clientX - S.panning.startX;
  S.state.transform.y = S.panning.startTY + clientY - S.panning.startY;
  R.renderAll();
}

function endPan() { S.setPanning(null); }

// --- Zoom ---

export function zoomAt(factor, cx, cy) {
  const oldScale = S.state.transform.scale;
  const newScale = Math.max(S.MIN_SCALE, Math.min(S.MAX_SCALE, oldScale * factor));
  if (newScale === oldScale) return;
  const rect = S.canvasContainer.getBoundingClientRect();
  const ox = rect.left + rect.width / 2, oy = rect.top + rect.height / 2;
  const wx = (cx - ox - S.state.transform.x) / oldScale;
  const wy = (cy - oy - S.state.transform.y) / oldScale;
  S.state.transform.scale = newScale;
  S.state.transform.x = cx - ox - wx * newScale;
  S.state.transform.y = cy - oy - wy * newScale;
  R.renderAll();
}

export function fitView() {
  const ids = Object.keys(S.state.nodes);
  if (ids.length === 0) { S.state.transform = { x: 0, y: 0, scale: 1 }; R.renderAll(); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of ids) {
    const n = S.state.nodes[id];
    if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y;
  }
  const rect = S.canvasContainer.getBoundingClientRect();
  const pad = 80;
  const worldW = maxX - minX + pad * 2, worldH = maxY - minY + pad * 2;
  const scale = Math.min(rect.width / worldW, rect.height / worldH, 2);
  S.state.transform = { x: 0, y: 0, scale };
  R.renderAll();
}

export function clearCanvas() {
  S.pushUndo();
  S.state.nodes = {};
  S.state.edges = [];
  S.state.rootId = null;
  S.state.transform = { x: 0, y: 0, scale: 1 };
  S.state.undoStack = [];
  R.renderAll();
  notifyChange();
}

// --- Undo ---

export function undo() {
  if (S.state.undoStack.length === 0) return false;
  const snapshot = S.state.undoStack.pop();
  S.state.nodes = snapshot.nodes;
  S.state.edges = snapshot.edges;
  R.renderAll();
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

function notifyChange() { if (S.onGraphChange) S.onGraphChange(); }

// --- Public API ---

export function setRootWord(word) {
  S.state.nodes = {};
  S.state.edges = [];
  S.state.undoStack = [];
  const root = S.createNode(word, '', 0, 0, null);
  S.state.nodes[root.id] = root;
  S.state.rootId = root.id;
  S.state.transform = { x: 0, y: 0, scale: 1 };
  root.animScale = 0; root.animOpacity = 0; root.targetScale = 1; root.targetOpacity = 1;
  R.renderAll();
}

export function addChildNodes(parentId, words, mode = 'associate') {
  const parent = S.getNode(parentId);
  if (!parent) return;
  const edgeType = (mode === 'pain' || mode === 'scenario' || mode === 'solution') ? 'dashed' : 'solid';
  const newChildIds = [];
  let idx = 0;
  for (const w of words) {
    const painType = mode === 'scenario' ? 'scenario' : mode === 'solution' ? 'solution' : (w.type || null);
    const child = S.createNode(w.zh, w.en, parent.x, parent.y, parentId, mode, painType);
    child.animScale = 0; child.animOpacity = 0; child.targetScale = 1; child.targetOpacity = 1;
    child.waveDelay = idx * 80; // 80ms stagger
    idx++;
    S.state.nodes[child.id] = child;
    parent.children.push(child.id);
    S.state.edges.push({ from: parentId, to: child.id, type: edgeType });
    newChildIds.push(child.id);
  }
  parent.expanded = true;
  parent.childCount = parent.children.length;
  S.layoutChildren(parentId);
  R.renderAll();
  notifyChange();
  return newChildIds;
}

export function getGraphState() {
  return { nodes: JSON.parse(JSON.stringify(S.state.nodes)), edges: [...S.state.edges], rootId: S.state.rootId };
}

export function restoreGraph(nodes, edges, rootId) {
  S.state.nodes = JSON.parse(JSON.stringify(nodes));
  S.state.edges = [...edges];
  S.state.rootId = rootId;
  for (const id in S.state.nodes) {
    const n = S.state.nodes[id];
    if (n.mode === undefined) n.mode = 'associate';
    if (n.painType === undefined) n.painType = null;
    if (n.depth === undefined) {
      let d = 0, cur = n;
      while (cur.parentId && S.state.nodes[cur.parentId]) { d++; cur = S.state.nodes[cur.parentId]; }
      n.depth = d;
    }
    n.vx = 0; n.vy = 0; n.targetX = n.x; n.targetY = n.y;
    n.animScale = 1; n.animOpacity = 1; n.targetScale = 1; n.targetOpacity = 1;
  }
  for (const e of S.state.edges) { if (e.type === undefined) e.type = 'solid'; }
  fitView();
  R.renderAll();
}

// --- Events ---

function isUIClick(target) {
  return target.closest('.input-area') || target.closest('.zoom-controls') ||
    target.closest('.theme-toggle') || target.closest('.history-drawer') ||
    target.closest('.history-toggle') || target.closest('.history-overlay') ||
    target.closest('.popup-menu') || target.closest('.detail-popup') ||
    target.closest('.node-expand-btn');
}

export function bindEvents() {
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (isUIClick(e.target)) return;
    if (e.target.closest('.graph-node')) return;
    if (S.activePopup) { if (!e.target.closest('.popup-menu')) hidePopupMenu(); }
    if (S.selectedNodeId) {
      const prev = S.nodesLayer.querySelector(`.graph-node[data-node-id="${S.selectedNodeId}"]`);
      if (prev) prev.classList.remove('selected');
      S.setSelectedNodeId(null);
    }
    startPan(e.clientX, e.clientY);
  });

  document.addEventListener('mousemove', (e) => {
    if (S.dragging) moveNodeDrag(e.clientX, e.clientY);
    else if (S.panning) movePan(e.clientX, e.clientY);
  });

  document.addEventListener('mouseup', () => {
    if (S.dragging) endNodeDrag();
    if (S.panning) endPan();
  });

  document.addEventListener('wheel', (e) => {
    if (isUIClick(e.target)) return;
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.08 : 0.93, e.clientX, e.clientY);
  }, { passive: false });

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) e.preventDefault();
    if (e.touches.length === 1) {
      if (isUIClick(e.target)) return;
      if (e.target.closest('.graph-node')) return;
      if (S.activePopup && !e.target.closest('.popup-menu')) hidePopupMenu();
      startPan(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && (S.dragging || S.panning)) {
      e.preventDefault();
      if (S.dragging) moveNodeDrag(e.touches[0].clientX, e.touches[0].clientY);
      else if (S.panning) movePan(e.touches[0].clientX, e.touches[0].clientY);
    }
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (S.pinching && S.pinching.lastDist) {
        zoomAt(dist / S.pinching.lastDist, (e.touches[0].clientX+e.touches[1].clientX)/2, (e.touches[0].clientY+e.touches[1].clientY)/2);
      }
      S.setPinching(S.pinching ? { lastDist: dist } : { lastDist: dist });
    }
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (S.dragging) endNodeDrag();
    if (S.panning) endPan();
    S.setPinching(null);
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    if ((e.key === 'Delete' || e.key === 'Del') && S.selectedNodeId && S.selectedNodeId !== S.state.rootId) {
      e.preventDefault(); deleteSelectedNode();
    }
    if (e.key === 'Escape') hidePopupMenu();
  });

  window.addEventListener('resize', () => R.renderAll());
}
