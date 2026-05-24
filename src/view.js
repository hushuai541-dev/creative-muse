// --- Read-Only View ---
// Minimal render-only graph view for shared links

import './style.css';

const ROOT_RADIUS = 140;
const CHILD_RADIUS = 120;
const MIN_SCALE = 0.2;
const MAX_SCALE = 5.0;

let state = {
  nodes: {},
  edges: [],
  rootId: null,
  transform: { x: 0, y: 0, scale: 1 },
};

let canvasContainer, edgesSvg, nodesLayer;
let panning = null;
let pinching = null;

async function init() {
  canvasContainer = document.getElementById('canvas-container');
  edgesSvg = document.getElementById('edges-svg');
  nodesLayer = document.getElementById('nodes-layer');

  // Load shared data
  const shareId = window.location.pathname.split('/view/')[1];
  if (!shareId) {
    document.getElementById('welcome-hint').innerHTML = '<span>无效的分享链接</span>';
    return;
  }

  try {
    const res = await fetch(`/api/share/${shareId}`);
    if (!res.ok) throw new Error('Not found');
    const data = await res.json();
    state.nodes = data.graphState.nodes || {};
    state.edges = data.graphState.edges || [];
    state.rootId = data.graphState.rootId || null;
    if (data.projectName) {
      document.getElementById('project-name').textContent = data.projectName;
      document.title = data.projectName + ' - Creative Muse';
      updateMeta('og:title', data.projectName + ' - Creative Muse');
      updateMeta('twitter:title', data.projectName + ' - Creative Muse');
      updateMeta('og:description', '查看' + data.projectName + '的思维发散分析结果');
      updateMeta('twitter:description', '查看' + data.projectName + '的思维发散分析结果');
    }
    fitView();
  } catch (err) {
    document.getElementById('welcome-hint').innerHTML = '<span>分享已过期或不存在</span>';
    return;
  }

  bindEvents();
  renderAll();
}

function getNode(id) { return state.nodes[id]; }

function getChildren(nodeId) {
  const node = getNode(nodeId);
  if (!node) return [];
  return node.children.map(id => getNode(id)).filter(Boolean);
}

function renderAll() {
  applyTransform();
  renderNodes();
  renderEdges();
}

function applyTransform() {
  const { x, y, scale } = state.transform;
  nodesLayer.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  document.getElementById('zoom-level').textContent = Math.round(scale * 100) + '%';
}

function renderNodes() {
  nodesLayer.innerHTML = '';
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
    let classes = 'graph-node';
    if (node.parentId === null) classes += ' root-node';
    if (node.expanded && node.parentId !== null) classes += ' expanded-node';
    if (node.painType) classes += ` pain-type-${node.painType}`;
    el.className = classes;

    const sizeMap = { 0: 96, 1: 76, 2: 66, 3: 58 };
    const fontSizeMap = { 0: 17, 1: 13, 2: 12, 3: 11 };
    const size = sizeMap[node.depth] || 52;
    const fontSize = fontSizeMap[node.depth] || 10;
    const isRoot = node.parentId === null;

    let tagHtml = '';
    if (node.painType) {
      const labels = { pain: '痛', pleasure: '爽', scenario: '场', solution: '解' };
      tagHtml = `<span class="pain-type-tag ${node.painType}">${labels[node.painType] || ''}</span>`;
    }

    el.innerHTML = `
      <div class="node-glass">
        <span class="node-zh">${escapeHtml(node.zh)}</span>
        ${isRoot ? `<span class="node-en">${escapeHtml(node.en)}</span>` : ''}
      </div>
      ${tagHtml}
    `;
    el.style.setProperty('--node-size', size + 'px');
    el.style.setProperty('--font-size-zh', fontSize + 'px');
    el.style.transform = `translate(${node.x - size/2}px, ${node.y - size/2}px)`;
    el.style.opacity = 1;
    el.style.zIndex = isRoot ? 10 : 5;
    el.style.pointerEvents = 'none';
    nodesLayer.appendChild(el);
  }
}

function renderEdges() {
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
    const cpx = mx - dy / len * (len * 0.18);
    const cpy = my + dx / len * (len * 0.18);
    const type = edge.type || 'solid';
    const cls = type === 'dashed' ? 'graph-edge dashed' : 'graph-edge';
    svgContent += `<path d="M${fx},${fy} Q${cpx},${cpy} ${tx_},${ty_}" class="${cls}" style="opacity:1" />`;
  }
  edgesSvg.innerHTML = svgContent;
}

function getNodeScreenPos(node) {
  const rect = canvasContainer.getBoundingClientRect();
  const ox = rect.left + rect.width / 2;
  const oy = rect.top + rect.height / 2;
  const { x: tx, y: ty, scale } = state.transform;
  return { x: ox + node.x * scale + tx, y: oy + node.y * scale + ty };
}

function zoomAt(factor, cx, cy) {
  const oldScale = state.transform.scale;
  const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * factor));
  if (newScale === oldScale) return;
  const rect = canvasContainer.getBoundingClientRect();
  const ox = rect.left + rect.width / 2;
  const oy = rect.top + rect.height / 2;
  const wx = (cx - ox - state.transform.x) / oldScale;
  const wy = (cy - oy - state.transform.y) / oldScale;
  state.transform.scale = newScale;
  state.transform.x = cx - ox - wx * newScale;
  state.transform.y = cy - oy - wy * newScale;
  renderAll();
}

function fitView() {
  const ids = Object.keys(state.nodes);
  if (ids.length === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of ids) {
    const n = state.nodes[id];
    if (n.x < minX) minX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x;
    if (n.y > maxY) maxY = n.y;
  }
  const rect = canvasContainer.getBoundingClientRect();
  const pad = 80;
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;
  const scale = Math.min(rect.width / w, rect.height / h, 2);
  state.transform = { x: 0, y: 0, scale };
  renderAll();
}

function startPan(clientX, clientY) {
  panning = { startX: clientX, startY: clientY, startTX: state.transform.x, startTY: state.transform.y };
}

function movePan(clientX, clientY) {
  if (!panning) return;
  state.transform.x = panning.startTX + clientX - panning.startX;
  state.transform.y = panning.startTY + clientY - panning.startY;
  renderAll();
}

function endPan() { panning = null; }

function bindEvents() {
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.zoom-controls')) return;
    startPan(e.clientX, e.clientY);
  });
  document.addEventListener('mousemove', (e) => {
    if (panning) movePan(e.clientX, e.clientY);
  });
  document.addEventListener('mouseup', () => endPan());
  document.addEventListener('wheel', (e) => {
    if (e.target.closest('.zoom-controls')) return;
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.08 : 0.93, e.clientX, e.clientY);
  }, { passive: false });
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) startPan(e.touches[0].clientX, e.touches[0].clientY);
    else if (e.touches.length === 2) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && panning) { e.preventDefault(); movePan(e.touches[0].clientX, e.touches[0].clientY); }
  }, { passive: false });
  document.addEventListener('touchend', () => endPan());
  document.getElementById('zoom-in').addEventListener('click', () => {
    const r = canvasContainer.getBoundingClientRect();
    zoomAt(1.25, r.left + r.width/2, r.top + r.height/2);
  });
  document.getElementById('zoom-out').addEventListener('click', () => {
    const r = canvasContainer.getBoundingClientRect();
    zoomAt(0.8, r.left + r.width/2, r.top + r.height/2);
  });
  document.getElementById('fit-view').addEventListener('click', () => fitView());
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function updateMeta(name, content) {
  let meta = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(name.includes('og:') ? 'property' : 'name', name);
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

document.addEventListener('DOMContentLoaded', init);
