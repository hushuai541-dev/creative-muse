// --- Graph Render Module ---
// Node, edge, minimap rendering + export

import * as S from './graph-state.js';

export function applyTransform() {
  const { x, y, scale } = S.state.transform;
  S.nodesLayer.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

export function renderAll() {
  applyTransform();
  renderNodes();
  renderEdges();
  updateZoomDisplay();
  updateWelcomeHint();
  renderMinimap();
  S.saveState();
}

export function renderNodes() {
  S.nodesLayer.innerHTML = '';

  const visibleNodes = [];
  function walk(nid) {
    const node = S.getNode(nid);
    if (!node) return;
    visibleNodes.push(node);
    if (node.expanded && node.children.length > 0) {
      for (const cid of node.children) walk(cid);
    }
  }
  if (S.state.rootId) walk(S.state.rootId);

  for (const node of visibleNodes) {
    const id = node.id;
    const el = document.createElement('div');

    let classList = 'graph-node';
    if (node.parentId === null) classList += ' root-node';
    if (node.expanded && node.parentId !== null) classList += ' expanded-node';
    if (node.painType) classList += ` pain-type-${node.painType}`;
    if (S.selectedNodeId === id) classList += ' selected';
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

    el.style.setProperty('--node-size', size + 'px');
    el.style.setProperty('--font-size-zh', fontSize + 'px');

    const animS = node.animScale;
    const opacity = node.animOpacity;
    const tx = node.x - size / 2;
    const ty = node.y - size / 2;
    el.style.transform = `translate(${tx}px, ${ty}px) scale(${animS})`;
    el.style.opacity = opacity;
    el.style.zIndex = isRoot ? 10 : 5;

    el.addEventListener('click', (e) => {
      if (e.target.closest('.node-expand-btn') || e.target.closest('.node-child-badge')) return;
      e.stopPropagation();
      if (typeof _onNodeClick === 'function') _onNodeClick(node);
    });

    el.addEventListener('dblclick', (e) => {
      if (e.target.closest('.node-expand-btn') || e.target.closest('.node-child-badge')) return;
      e.stopPropagation();
      if (typeof _onNodeDblClick === 'function') _onNodeDblClick(node, el);
    });

    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.node-expand-btn') || e.target.closest('.node-child-badge')) return;
      e.stopPropagation();
      if (typeof _onNodeMouseDown === 'function') _onNodeMouseDown(node, e.clientX, e.clientY);
    });

    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        if (e.target.closest('.node-expand-btn') || e.target.closest('.node-child-badge')) return;
        e.stopPropagation();
        if (typeof _onNodeMouseDown === 'function') _onNodeMouseDown(node, e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    S.nodesLayer.appendChild(el);
  }

  S.nodesLayer.querySelectorAll('.node-expand-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nodeId = btn.dataset.nodeId;
      const node = S.getNode(nodeId);
      if (!node) return;
      if (typeof _onExpandBtnClick === 'function') _onExpandBtnClick(node, btn);
    });
  });
}

// Callbacks set by interact module
let _onNodeClick = null, _onNodeDblClick = null, _onNodeMouseDown = null, _onExpandBtnClick = null;
export function setNodeClick(fn) { _onNodeClick = fn; }
export function setNodeDblClick(fn) { _onNodeDblClick = fn; }
export function setNodeMouseDown(fn) { _onNodeMouseDown = fn; }
export function setExpandBtnClick(fn) { _onExpandBtnClick = fn; }

export function renderEdges() {
  const visibleIds = new Set();
  function walk(nid) {
    const node = S.getNode(nid);
    if (!node) return;
    visibleIds.add(nid);
    if (node.expanded && node.children.length > 0) {
      for (const cid of node.children) walk(cid);
    }
  }
  if (S.state.rootId) walk(S.state.rootId);

  let svgContent = '';
  for (const edge of S.state.edges) {
    if (!visibleIds.has(edge.from) || !visibleIds.has(edge.to)) continue;
    const from = S.getNode(edge.from);
    const to = S.getNode(edge.to);
    if (!from || !to) continue;

    const fp = S.getNodeScreenPos(from);
    const tp = S.getNodeScreenPos(to);
    const rect = S.canvasContainer.getBoundingClientRect();
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

    const opacity = Math.min(from.animOpacity, to.animOpacity);
    const type = edge.type || 'solid';
    const className = type === 'dashed' ? 'graph-edge dashed' : 'graph-edge';
    svgContent += `<path d="M${fx},${fy} Q${cpx},${cpy} ${tx_},${ty_}" class="${className}" style="opacity:${opacity}" />`;

    // Particle dots along edge (3 dots per edge, staggered animation)
    if (type === 'solid' && opacity > 0.3) {
      for (let i = 1; i <= 3; i++) {
        const t = i / 4;
        const dt = 1 - t;
        const px = dt * dt * fx + 2 * dt * t * cpx + t * t * tx_;
        const py = dt * dt * fy + 2 * dt * t * cpy + t * t * ty_;
        svgContent += `<circle cx="${px}" cy="${py}" r="2" class="edge-particle" style="animation-delay:${(i-1)*0.3}s;opacity:${opacity}" />`;
      }
    }
  }
  S.edgesSvg.innerHTML = svgContent;
}

export function updateZoomDisplay() {
  if (S.zoomLevelEl) S.zoomLevelEl.textContent = Math.round(S.state.transform.scale * 100) + '%';
}

export function updateWelcomeHint() {
  const hasNodes = Object.keys(S.state.nodes).length > 0;
  if (S.welcomeHint) S.welcomeHint.classList.toggle('hidden', hasNodes);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function painTagLabel(type) {
  if (type === 'pain') return '痛';
  if (type === 'pleasure') return '爽';
  if (type === 'scenario') return '场';
  if (type === 'solution') return '解';
  return '';
}

// --- Export ---

export function exportToMarkdown(projectName) {
  const tagLabels = { pain: '🚨 痛', pleasure: '😊 爽', scenario: '📍 场', solution: '✅ 解' };
  function walk(nid, indent) {
    const node = S.getNode(nid);
    if (!node) return '';
    let md = '';
    const prefix = '  '.repeat(indent);
    let label = node.painType && tagLabels[node.painType] ? tagLabels[node.painType] + ' ' : '';
    md += `${prefix}- ${label}${node.zh}\n`;
    if (node.expanded && node.children.length > 0) {
      for (const cid of node.children) md += walk(cid, indent + 1);
    }
    return md;
  }
  let markdown = `# ${projectName || '思维发散'}\n\n`;
  if (S.state.rootId) markdown += walk(S.state.rootId, 0);
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${projectName || 'creative-muse'}-${Date.now()}.md`;
  a.click(); URL.revokeObjectURL(url);
}

export function exportToImage() {
  const rect = S.canvasContainer.getBoundingClientRect();
  const scale = 2;
  const w = rect.width * scale, h = rect.height * scale;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d0d0d'; ctx.fillRect(0, 0, w, h);
  const { x: tx, y: ty, scale: s } = S.state.transform;
  const cx = rect.width / 2, cy = rect.height / 2;
  ctx.save(); ctx.translate(cx * scale, cy * scale); ctx.scale(s * scale, s * scale); ctx.translate(tx / s, ty / s);

  for (const edge of S.state.edges) {
    const from = S.getNode(edge.from), to = S.getNode(edge.to);
    if (!from || !to) continue;
    ctx.beginPath(); ctx.moveTo(from.x, from.y);
    const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.sqrt(dx*dx+dy*dy) || 1;
    ctx.quadraticCurveTo(mx-dy/len*(len*0.18), my+dx/len*(len*0.18), to.x, to.y);
    ctx.strokeStyle = (edge.type === 'dashed') ? '#333' : '#2a2a2a';
    ctx.lineWidth = 1.2;
    ctx.setLineDash((edge.type === 'dashed') ? [6,4] : []);
    ctx.stroke();
  }

  for (const id in S.state.nodes) {
    const node = S.state.nodes[id];
    const isRoot = !node.parentId;
    const sizeMap = {0:96,1:76,2:66,3:58};
    const r = (sizeMap[node.depth] || 52) / 2;
    ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI*2);
    if (isRoot || node.expanded) { ctx.fillStyle = '#FFD600'; }
    else { ctx.fillStyle = '#1a1a1a'; ctx.strokeStyle = node.painType ? ({pain:'#ff6b6b',pleasure:'#4ecdc4',scenario:'#5b9bd5',solution:'#4ecdc4'}[node.painType]||'#2a2a2a') : '#2a2a2a'; ctx.lineWidth = 1.5; }
    ctx.fill(); if (!isRoot && !node.expanded) ctx.stroke();
    const fzMap = {0:17,1:13,2:12,3:11}; const fz = fzMap[node.depth] || 10;
    ctx.fillStyle = (isRoot || node.expanded) ? '#1a1a1a' : '#e0e0e0';
    ctx.font = `${!node.parentId?'700':'600'} ${fz}px Inter, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(node.zh.length > 4 ? node.zh.slice(0,4)+'..' : node.zh, node.x, node.y);
  }
  ctx.restore();
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `creative-muse-${Date.now()}.png`; a.click(); URL.revokeObjectURL(url);
  });
}

// --- Minimap ---

let minimapCanvas = null, minimapCtx = null;

export function initMinimap() {
  minimapCanvas = document.getElementById('minimap-canvas');
  if (!minimapCanvas) return;
  minimapCtx = minimapCanvas.getContext('2d');
  minimapCanvas.addEventListener('mousedown', (e) => { e.stopPropagation(); handleMinimapClick(e); });
  minimapCanvas.addEventListener('mousemove', (e) => { if (e.buttons === 1) handleMinimapClick(e); });
}

function handleMinimapClick(e) {
  if (!minimapCanvas || Object.keys(S.state.nodes).length === 0) return;
  const rect = minimapCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id in S.state.nodes) {
    const n = S.state.nodes[id];
    if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y;
    if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y;
  }
  const pad = 120; minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const worldW = maxX - minX, worldH = maxY - minY;
  const mw = minimapCanvas.width, mh = minimapCanvas.height;
  const aspect = mw / mh;
  let sw, sh, ox, oy;
  if (worldW / worldH > aspect) { sw = worldW; sh = worldW / aspect; ox = 0; oy = (sh - worldH) / 2; }
  else { sh = worldH; sw = worldH * aspect; ox = (sw - worldW) / 2; oy = 0; }
  const mapX = mx / mw * sw + minX - ox;
  const mapY = my / mh * sh + minY - oy;
  const cr = S.canvasContainer.getBoundingClientRect();
  S.state.transform.x = cr.width / 2 - mapX * S.state.transform.scale;
  S.state.transform.y = cr.height / 2 - mapY * S.state.transform.scale;
  renderAll();
}

export function renderMinimap() {
  if (!minimapCtx) { initMinimap(); if (!minimapCtx) return; }
  const w = minimapCanvas.width, h = minimapCanvas.height, ctx = minimapCtx;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(18,18,18,0.85)';
  const radius = 8;
  ctx.beginPath(); ctx.moveTo(radius,0); ctx.lineTo(w-radius,0); ctx.arcTo(w,0,w,radius,radius);
  ctx.lineTo(w,h-radius); ctx.arcTo(w,h,w-radius,h,radius); ctx.lineTo(radius,h);
  ctx.arcTo(0,h,0,h-radius,radius); ctx.lineTo(0,radius); ctx.arcTo(0,0,radius,0,radius); ctx.fill();

  const ids = Object.keys(S.state.nodes);
  if (ids.length === 0) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of ids) { const n = S.state.nodes[id]; if (n.x < minX) minX = n.x; if (n.y < minY) minY = n.y; if (n.x > maxX) maxX = n.x; if (n.y > maxY) maxY = n.y; }
  const pad = 120; minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const worldW = maxX - minX, worldH = maxY - minY;
  const aspect = w / h;
  let sw, sh, ox, oy;
  if (worldW / worldH > aspect) { sw = worldW; sh = worldW / aspect; ox = 0; oy = (sh - worldH) / 2; }
  else { sh = worldH; sw = worldH * aspect; ox = (sw - worldW) / 2; oy = 0; }

  function worldToMap(wx, wy) { return { x: (wx - minX + ox) / sw * w, y: (wy - minY + oy) / sh * h }; }
  for (const id in S.state.nodes) {
    const n = S.state.nodes[id], p = worldToMap(n.x, n.y);
    ctx.beginPath(); ctx.arc(p.x, p.y, !n.parentId ? 3.5 : 2, 0, Math.PI*2);
    ctx.fillStyle = !n.parentId ? '#FFD600' : (n.expanded ? '#e8b830' : '#505050');
    ctx.fill();
  }

  const cr = S.canvasContainer.getBoundingClientRect();
  const cw = cr.width, ch = cr.height, { scale } = S.state.transform;
  const vpX1 = (0 - cw/2 - S.state.transform.x) / scale, vpY1 = (0 - ch/2 - S.state.transform.y) / scale;
  const vpX2 = (cw - cw/2 - S.state.transform.x) / scale, vpY2 = (ch - ch/2 - S.state.transform.y) / scale;
  const p1 = worldToMap(vpX1, vpY1), p2 = worldToMap(vpX2, vpY2);
  ctx.strokeStyle = '#FFD600'; ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
}
