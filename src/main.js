// --- Creative Muse — Main Entry ---

import './style.css';
import { expandWord, expandPainPoints, expandScenario, expandSolution } from './api.js';
import * as Graph from './graph.js';
import * as Input from './input.js';
import * as History from './history.js';

// Theme
const THEME_KEY = 'creative-muse-theme';
let isLight = false;

// Track current word for history integrity (requirement #23)
let currentWord = '';

// --- Init ---

function init() {
  // Theme
  initTheme();

  // Graph
  Graph.init({
    canvasContainer: document.getElementById('canvas-container'),
    edgesSvg: document.getElementById('edges-svg'),
    nodesLayer: document.getElementById('nodes-layer'),
    welcomeHint: document.getElementById('welcome-hint'),
    zoomLevelEl: document.getElementById('zoom-level'),
    onGraphChange: onGraphChange,
  });

  // If saved state has nodes, set the word
  if (Graph.hasNodes()) {
    currentWord = Graph.getRootWord();
  }

  // Set up popup menu action handler
  Graph.setOnPopupAction(onPopupAction);

  // Input
  Input.init({
    inputArea: document.getElementById('input-area'),
    wordInput: document.getElementById('word-input'),
    submitBtn: document.getElementById('submit-btn'),
    onSubmit: onWordSubmit,
  });

  // History
  History.init({
    historyDrawer: document.getElementById('history-drawer'),
    historyList: document.getElementById('history-list'),
    historyToggle: document.getElementById('history-toggle'),
    historyOverlay: document.getElementById('history-overlay'),
    historyClose: document.getElementById('history-close'),
    onRestore: onHistoryRestore,
  });

  // Zoom controls
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
  // Show loading
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = '...';

  try {
    const words = await expandWord(word);
    currentWord = word;

    // Set root and add children
    Graph.setRootWord(word);
    Graph.addChildNodes(Graph.getGraphState().rootId, words);

    Input.clear();

    // Add to history
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
  } catch (err) {
    alert(label + '失败：' + err.message);
  }
}

// --- Graph Change (for history sync) ---

function onGraphChange() {
  // Requirement #23: only update history if currentWord matches latest entry
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

// --- Boot ---

document.addEventListener('DOMContentLoaded', init);
