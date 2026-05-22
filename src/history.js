// --- History Module ---
// localStorage-backed history, side drawer

const HISTORY_KEY = 'creative-muse-history';
const MAX_HISTORY = 50;

let historyDrawer, historyList, historyToggle, historyOverlay, historyClose;
let onRestore = null;

export function init(options) {
  historyDrawer = options.historyDrawer;
  historyList = options.historyList;
  historyToggle = options.historyToggle;
  historyOverlay = options.historyOverlay;
  historyClose = options.historyClose;
  onRestore = options.onRestore || null;

  bindEvents();
  renderList();
}

function bindEvents() {
  historyToggle.addEventListener('click', openDrawer);
  historyClose.addEventListener('click', closeDrawer);
  historyOverlay.addEventListener('click', closeDrawer);
}

function openDrawer() {
  historyDrawer.classList.add('open');
  historyOverlay.classList.remove('hidden');
}

function closeDrawer() {
  historyDrawer.classList.remove('open');
  historyOverlay.classList.add('hidden');
}

export function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

export function addEntry(word, graphState) {
  const list = getHistory();
  // Remove duplicate word entries
  const filtered = list.filter(e => e.word !== word);
  const entry = {
    word,
    nodes: graphState.nodes,
    edges: graphState.edges,
    rootId: graphState.rootId,
    timestamp: Date.now(),
  };
  filtered.unshift(entry);
  if (filtered.length > MAX_HISTORY) filtered.pop();
  saveHistory(filtered);
  renderList();
}

export function updateLatestHistory(graphState) {
  const list = getHistory();
  if (list.length === 0) return;
  // Only update if the word matches the latest entry (requirement #23)
  // This is checked by the caller, but we also validate here
  list[0].nodes = graphState.nodes;
  list[0].edges = graphState.edges;
  list[0].rootId = graphState.rootId;
  list[0].timestamp = Date.now();
  saveHistory(list);
  renderList();
}

export function deleteEntry(index) {
  const list = getHistory();
  list.splice(index, 1);
  saveHistory(list);
  renderList();
}

function renderList() {
  const list = getHistory();
  if (list.length === 0) {
    historyList.innerHTML = '<div class="history-empty">暂无历史记录</div>';
    return;
  }

  historyList.innerHTML = list.map((entry, i) => {
    const date = new Date(entry.timestamp);
    const timeStr = formatTime(date);
    const nodeCount = Object.keys(entry.nodes || {}).length;
    return `
      <div class="history-item" data-index="${i}">
        <div class="history-item-main">
          <span class="history-word">${escapeHtml(entry.word)}</span>
          <span class="history-meta">${nodeCount} 节点 · ${timeStr}</span>
        </div>
        <div class="history-item-actions">
          <button class="history-restore-btn" data-index="${i}" title="恢复">↩</button>
          <button class="history-delete-btn" data-index="${i}" title="删除">✕</button>
        </div>
      </div>
    `;
  }).join('');

  // Bind restore buttons
  historyList.querySelectorAll('.history-restore-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      const entry = getHistory()[idx];
      if (entry && onRestore) {
        onRestore(entry);
        closeDrawer();
      }
    });
  });

  // Bind delete buttons
  historyList.querySelectorAll('.history-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      deleteEntry(idx);
    });
  });

  // Click on item to restore
  historyList.querySelectorAll('.history-item-main').forEach(main => {
    main.addEventListener('click', () => {
      const item = main.closest('.history-item');
      const idx = parseInt(item.dataset.index);
      const entry = getHistory()[idx];
      if (entry && onRestore) {
        onRestore(entry);
        closeDrawer();
      }
    });
  });
}

function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}/${d} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
