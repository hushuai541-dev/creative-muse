// --- Creative Muse — Main Entry ---

import './style.css';
import { expandWord, expandPainPoints, expandScenario, expandSolution } from './api.js';
import * as Graph from './graph.js';
import * as Input from './input.js';
import * as History from './history.js';
import * as Auth from './auth.js';
import { showOnboarding } from './onboarding.js';

// Theme
const THEME_KEY = 'creative-muse-theme';
let isLight = false;

let currentWord = '';
let remainingUsage = { remaining: 5, plan: 'free', permanentTokens: 0 };

async function updateRemaining() {
  if (Auth.isLoggedIn()) {
    try {
      remainingUsage = await Auth.getRemaining();
    } catch {
      remainingUsage = { remaining: 5, plan: 'free', permanentTokens: 0 };
    }
  } else {
    remainingUsage = { remaining: 5, plan: 'free', permanentTokens: 0 };
  }
  updateUsageDisplay();
}

async function canUse() {
  if (!Auth.isLoggedIn()) return remainingUsage.remaining > 0;
  await updateRemaining();
  return remainingUsage.remaining > 0 || remainingUsage.plan === 'pro';
}

async function incrementUsage() {
  try {
    if (!Auth.isLoggedIn()) {
      remainingUsage.remaining--;
      return;
    }
    await Auth.spendOneUse();
    await updateRemaining();
  } catch {
    remainingUsage.remaining--;
  }
}

function showPricingModal() {
  const plan = remainingUsage.plan || 'free';
  document.querySelectorAll('.pricing-card').forEach(c => c.classList.remove('current-plan'));
  document.querySelectorAll('.pricing-btn.primary').forEach(b => {
    b.style.display = '';
    b.disabled = false;
  });
  document.querySelectorAll('.pricing-btn.secondary').forEach(b => {
    b.style.display = '';
  });
  if (plan === 'free') {
    document.getElementById('plan-free')?.classList.add('current-plan');
    const fb = document.querySelector('#plan-free .pricing-btn.secondary');
    if (fb) { fb.textContent = '你当前的套餐'; fb.style.display = ''; }
    document.querySelector('#plan-basic .pricing-btn')?.classList.add('primary');
    document.querySelector('#plan-pro .pricing-btn')?.classList.add('primary');
  } else if (plan === 'basic') {
    document.getElementById('plan-basic')?.classList.add('current-plan');
    const bb = document.querySelector('#plan-basic .pricing-btn');
    if (bb) { bb.textContent = '你当前的套餐'; bb.className = 'pricing-btn secondary'; bb.disabled = true; }
    document.querySelector('#plan-free .pricing-btn')?.classList.add('primary');
    document.querySelector('#plan-pro .pricing-btn')?.classList.add('primary');
  } else {
    document.getElementById('plan-pro')?.classList.add('current-plan');
    const pb = document.querySelector('#plan-pro .pricing-btn');
    if (pb) { pb.textContent = '你当前的套餐'; pb.className = 'pricing-btn secondary'; pb.disabled = true; }
    document.querySelector('#plan-free .pricing-btn')?.classList.add('primary');
    document.querySelector('#plan-basic .pricing-btn')?.classList.add('primary');
  }
  document.getElementById('pricing-overlay').classList.remove('hidden');
}

function hidePricingModal() {
  document.getElementById('pricing-overlay').classList.add('hidden');
}

// --- Init ---

function init() {
  initTheme();
  initGraph();
  initInput();
  initHistory();
  initButtons();
  initPricing();
  updateRemaining().then(() => {
    showOnboarding(() => {});
  });

  // Check for word from homepage
  const params = new URLSearchParams(window.location.search);
  const word = params.get('word');
  if (word && Auth.isLoggedIn()) {
    setTimeout(() => {
      document.getElementById('word-input').value = word;
      document.getElementById('submit-btn').click();
      // Clean URL
      window.history.replaceState({}, '', '/');
    }, 500);
  }
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
  if (!(await canUse())) {
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
    await incrementUsage();
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
  if (!(await canUse())) {
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
    await incrementUsage();
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
    btn.addEventListener('click', async () => {
      const plan = btn.dataset.plan;
      try {
        if (Auth.isLoggedIn()) {
          await Auth.upgradePlan(plan);
        }
        remainingUsage.plan = plan;
        hidePricingModal();
        updateUsageDisplay();
        alert(plan === 'pro' ? '已升级至 Pro 版！' : '已升级至基础版！');
      } catch (err) {
        alert('升级失败：' + err.message);
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
  const plan = remainingUsage.plan || 'free';
  el.classList.remove('pro', 'basic', 'free');
  if (plan === 'pro') {
    el.textContent = 'Pro · 无限次数';
    el.classList.add('pro');
  } else {
    el.textContent = `剩余 ${remainingUsage.remaining} 次`;
    el.classList.add(remainingUsage.remaining > 5 ? 'basic' : 'free');
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
