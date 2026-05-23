// --- Creative Muse — Main Entry ---

import './style.css';
import { expandWord, expandPainPoints, expandScenario, expandSolution } from './api.js';
import * as Graph from './graph.js';
import * as Input from './input.js';
import * as History from './history.js';

// Theme
const THEME_KEY = 'creative-muse-theme';
let isLight = false;

// Usage tracking
const USAGE_KEY = 'creative-muse-usage';
const FREE_DAILY_LIMIT = 5;
let usageCount = 0;
let usageDate = '';

// Plan state (free / basic / pro)
const PLAN_KEY = 'creative-muse-plan';
let currentPlan = 'free';
let basicRemaining = 0; // remaining uses for basic plan

let currentWord = '';

function loadUsage() {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      const today = new Date().toDateString();
      if (data.date === today) {
        usageCount = data.count || 0;
      } else {
        usageCount = 0;
      }
      usageDate = today;
    } else {
      usageDate = new Date().toDateString();
      usageCount = 0;
    }
    currentPlan = localStorage.getItem(PLAN_KEY) || 'free';
    if (currentPlan === 'basic') {
      basicRemaining = parseInt(localStorage.getItem('creative-muse-basic-remaining') || '0');
    }
  } catch {
    usageCount = 0;
    usageDate = new Date().toDateString();
    currentPlan = 'free';
  }
}

function saveUsage() {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify({ date: usageDate, count: usageCount }));
    localStorage.setItem(PLAN_KEY, currentPlan);
    if (currentPlan === 'basic') {
      localStorage.setItem('creative-muse-basic-remaining', String(basicRemaining));
    }
  } catch { /* ignore */ }
}

function canUse() {
  if (currentPlan === 'pro') return true;
  if (currentPlan === 'basic') return basicRemaining > 0;
  return usageCount < FREE_DAILY_LIMIT;
}

function incrementUsage() {
  if (currentPlan === 'pro') return;
  if (currentPlan === 'basic') {
    basicRemaining--;
  } else {
    usageCount++;
  }
  saveUsage();
}

function showPricingModal() {
  document.getElementById('pricing-overlay').classList.remove('hidden');
}

function hidePricingModal() {
  document.getElementById('pricing-overlay').classList.add('hidden');
}

// --- Init ---

function init() {
  loadUsage();
  initTheme();
  initGraph();
  initInput();
  initHistory();
  initButtons();
  initPricing();
  updateUsageDisplay();
}

function initGraph() {
  Graph.init({
    canvasContainer: document.getElementById('canvas-container'),
    edgesSvg: document.getElementById('edges-svg'),
    nodesLayer: document.getElementById('nodes-layer'),
    welcomeHint: document.getElementById('welcome-hint'),
    zoomLevelEl: document.getElementById('zoom-level'),
    onGraphChange: onGraphChange,
  });
  if (Graph.hasNodes()) {
    currentWord = Graph.getRootWord();
  }
  Graph.setOnPopupAction(onPopupAction);
}

function initInput() {
  Input.init({
    inputArea: document.getElementById('input-area'),
    wordInput: document.getElementById('word-input'),
    submitBtn: document.getElementById('submit-btn'),
    onSubmit: onWordSubmit,
  });
}

function initHistory() {
  History.init({
    historyDrawer: document.getElementById('history-drawer'),
    historyList: document.getElementById('history-list'),
    historyToggle: document.getElementById('history-toggle'),
    historyOverlay: document.getElementById('history-overlay'),
    historyClose: document.getElementById('history-close'),
    onRestore: onHistoryRestore,
  });
}

function initButtons() {
  document.getElementById('zoom-in').addEventListener('click', () => {
    const rect = document.getElementById('canvas-container').getBoundingClientRect();
    Graph.zoomAt(1.25, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  document.getElementById('zoom-out').addEventListener('click', () => {
    const rect = document.getElementById('canvas-container').getBoundingClientRect();
    Graph.zoomAt(0.8, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  document.getElementById('fit-view').addEventListener('click', () => Graph.fitView());
  document.getElementById('clear-canvas').addEventListener('click', () => {
    Graph.clearCanvas();
    currentWord = '';
    Input.clear();
  });
  document.getElementById('export-image').addEventListener('click', () => Graph.exportToImage());
  document.getElementById('export-markdown').addEventListener('click', () => Graph.exportToMarkdown('思维发散'));
  document.getElementById('share-link').addEventListener('click', shareCurrentGraph);
}

async function shareCurrentGraph() {
  const state = Graph.exportState();
  if (!state || !state.rootId) {
    alert('请先发散内容再分享');
    return;
  }
  try {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graphState: state, projectName: '思维发散' }),
    });
    if (!res.ok) throw new Error('Share failed');
    const { shareId } = await res.json();
    const url = `${window.location.origin}/view/${shareId}`;
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      alert('分享链接已复制到剪贴板！\n\n' + url);
    } else {
      prompt('复制此链接分享：', url);
    }
  } catch (err) {
    alert('分享失败：' + err.message);
  }
}

// --- Theme ---

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light') {
    isLight = true;
    document.documentElement.classList.add('light');
  }
  updateThemeIcon();
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
}

function toggleTheme() {
  isLight = !isLight;
  document.documentElement.classList.toggle('light', isLight);
  localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
  updateThemeIcon();
}

function updateThemeIcon() {
  document.getElementById('theme-toggle').textContent = isLight ? '☀️' : '🌙';
}

// --- Word Submit ---

async function onWordSubmit(word) {
  if (!canUse()) {
    showPricingModal();
    return;
  }
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = '...';
  try {
    const words = await expandWord(word);
    currentWord = word;
    Graph.setRootWord(word);
    Graph.addChildNodes(Graph.getGraphState().rootId, words);
    incrementUsage();
    updateUsageDisplay();
    Input.clear();
    History.addEntry(word, Graph.getGraphState());
  } catch (err) {
    alert('联想失败：' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '发散';
  }
}

// --- Popup Menu Action ---

async function onPopupAction(nodeId, word, mode) {
  if (!canUse()) {
    showPricingModal();
    return;
  }
  const label = mode === 'pain' ? '痛点分析' : mode === 'scenario' ? '场景发散' : mode === 'solution' ? '解决方案' : '联想';
  try {
    let words;
    if (mode === 'pain') {
      words = await expandPainPoints(word);
    } else if (mode === 'scenario') {
      words = await expandScenario(word);
    } else if (mode === 'solution') {
      words = await expandSolution(word);
    } else {
      words = await expandWord(word);
    }
    Graph.addChildNodes(nodeId, words, mode);
    incrementUsage();
    updateUsageDisplay();
  } catch (err) {
    alert(label + '失败：' + err.message);
  }
}

// --- Graph Change ---

function initPricing() {
  document.getElementById('pricing-close').addEventListener('click', hidePricingModal);
  document.getElementById('pricing-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hidePricingModal();
  });
  document.querySelectorAll('.pricing-btn.primary').forEach(btn => {
    btn.addEventListener('click', () => {
      const plan = btn.dataset.plan;
      if (plan === 'basic') {
        currentPlan = 'basic';
        basicRemaining = 10;
        saveUsage();
        updateUsageDisplay();
        hidePricingModal();
        alert('已升级至基础版！畅享 10 次发散。');
      } else if (plan === 'pro') {
        currentPlan = 'pro';
        saveUsage();
        updateUsageDisplay();
        hidePricingModal();
        alert('已升级至 Pro 版！无限发散，畅快使用。');
      }
    });
  });
}

function updateUsageDisplay() {
  let el = document.getElementById('usage-display');
  if (!el) {
    el = document.createElement('span');
    el.id = 'usage-display';
    el.className = 'usage-badge';
    el.addEventListener('click', showPricingModal);
    document.body.appendChild(el);
  }
  el.classList.remove('pro', 'basic', 'free');
  if (currentPlan === 'pro') {
    el.textContent = 'Pro · 无限次数';
    el.classList.add('pro');
  } else if (currentPlan === 'basic') {
    el.textContent = `基础版 · 剩余 ${basicRemaining} 次`;
    el.classList.add('basic');
  } else {
    const remaining = FREE_DAILY_LIMIT - usageCount;
    el.textContent = `免费 · 剩余 ${Math.max(0, remaining)} 次`;
    el.classList.add('free');
  }
}

function onGraphChange() {
  const list = History.getHistory();
  if (list.length > 0 && list[0].word === currentWord) {
    History.updateLatestHistory(Graph.getGraphState());
  }
}

// --- History Restore ---

function onHistoryRestore(entry) {
  Graph.restoreGraph(entry.nodes, entry.edges, entry.rootId);
  currentWord = entry.word;
  Input.setWord(entry.word);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Boot ---

document.addEventListener('DOMContentLoaded', init);
