// --- Creative Muse — Main Entry ---

import './style.css';
import { expandWord, expandPainPoints, expandScenario, expandSolution } from './api.js';
import * as Graph from './graph.js';
import * as Input from './input.js';
import * as History from './history.js';
import * as Projects from './projects.js';
import { templates } from './templates.js';

// Theme
const THEME_KEY = 'creative-muse-theme';
let isLight = false;

// Current project
let currentProject = null;
let currentWord = '';
let projectSaveTimeout = null;

// --- Init ---

function init() {
  initTheme();
  initProjects();
  initGraph();
  initInput();
  initHistory();
  initButtons();
  initTemplates();
}

function initProjects() {
  currentProject = Projects.getCurrentProject();
  updateProjectUI();
  document.getElementById('project-name').addEventListener('click', () => {
    const name = prompt('项目名称：', currentProject.name);
    if (name && name.trim()) {
      currentProject.name = name.trim();
      Projects.renameProject(currentProject.id, currentProject.name);
      updateProjectUI();
    }
  });
  document.getElementById('project-new').addEventListener('click', () => {
    saveCurrentProject();
    currentProject = Projects.createProject();
    currentWord = '';
    Graph.clearCanvas();
    Input.clear();
    updateProjectUI();
  });
  document.getElementById('project-prev').addEventListener('click', () => navigateProject(-1));
  document.getElementById('project-next').addEventListener('click', () => navigateProject(1));
  document.getElementById('project-list-btn').addEventListener('click', toggleProjectDropdown);

  document.addEventListener('click', (e) => {
    const dd = document.getElementById('project-dropdown');
    if (!e.target.closest('#project-list-btn') && !e.target.closest('.project-dropdown')) {
      dd.classList.add('hidden');
    }
  });
}

function navigateProject(dir) {
  const list = Projects.getProjects();
  const idx = list.findIndex(p => p.id === currentProject.id);
  const next = list[(idx + dir + list.length) % list.length];
  if (next && next.id !== currentProject.id) {
    saveCurrentProject();
    currentProject = next;
    loadProjectIntoGraph();
    updateProjectUI();
  }
}

function toggleProjectDropdown() {
  const dd = document.getElementById('project-dropdown');
  if (dd.classList.contains('hidden')) {
    const list = Projects.getProjects();
    dd.innerHTML = list.map(p => `
      <div class="project-dropdown-item${p.id === currentProject.id ? ' active' : ''}" data-id="${p.id}">
        <span>${escapeHtml(p.name)}</span>
        <button class="project-delete-btn" data-id="${p.id}" title="删除">✕</button>
      </div>
    `).join('');
    dd.querySelectorAll('.project-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.project-delete-btn')) {
          e.stopPropagation();
          const id = e.target.closest('.project-delete-btn').dataset.id;
          if (confirm('确定删除此项目？')) {
            Projects.deleteProject(id);
            if (id === currentProject.id) {
              currentProject = Projects.getCurrentProject();
              loadProjectIntoGraph();
            }
            updateProjectUI();
          }
          dd.classList.add('hidden');
          return;
        }
        const id = item.dataset.id;
        if (id !== currentProject.id) {
          saveCurrentProject();
          currentProject = Projects.getProject(id);
          loadProjectIntoGraph();
          updateProjectUI();
        }
        dd.classList.add('hidden');
      });
    });
    dd.classList.remove('hidden');
  } else {
    dd.classList.add('hidden');
  }
}

function updateProjectUI() {
  document.getElementById('project-name').textContent = currentProject.name;
}

function saveCurrentProject() {
  if (currentProject) {
    Projects.saveGraphState(currentProject.id, Graph.exportState());
  }
}

function loadProjectIntoGraph() {
  const state = currentProject.graphState;
  if (state && state.rootId) {
    Graph.loadStateFromData(state);
    currentWord = Graph.getRootWord();
  } else {
    Graph.clearCanvas();
    currentWord = '';
  }
  Input.clear();
}

// Debounced auto-save on graph change
function scheduleSave() {
  if (projectSaveTimeout) return;
  projectSaveTimeout = setTimeout(() => {
    projectSaveTimeout = null;
    saveCurrentProject();
  }, 500);
}

function initGraph() {
  const state = currentProject.graphState;
  Graph.init({
    canvasContainer: document.getElementById('canvas-container'),
    edgesSvg: document.getElementById('edges-svg'),
    nodesLayer: document.getElementById('nodes-layer'),
    welcomeHint: document.getElementById('welcome-hint'),
    zoomLevelEl: document.getElementById('zoom-level'),
    onGraphChange: onGraphChange,
    initialState: state && state.rootId ? state : null,
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
    saveCurrentProject();
  });
  document.getElementById('export-image').addEventListener('click', () => Graph.exportToImage());
  document.getElementById('export-markdown').addEventListener('click', () => Graph.exportToMarkdown(currentProject.name));
  document.getElementById('share-link').addEventListener('click', shareCurrentGraph);
}

function initTemplates() {
  const container = document.getElementById('template-tags');
  templates.forEach(t => {
    const tag = document.createElement('span');
    tag.className = 'template-tag';
    tag.textContent = t.icon + ' ' + t.name;
    tag.title = t.prompt;
    tag.addEventListener('click', () => {
      const word = prompt(t.prompt, '');
      if (word && word.trim()) {
        if (t.mode === 'pain') {
          doTemplateSearch(word.trim(), 'pain');
        } else if (t.mode === 'scenario') {
          doTemplateSearch(word.trim(), 'scenario');
        } else {
          document.getElementById('word-input').value = word.trim();
          document.getElementById('submit-btn').click();
        }
      }
    });
    container.appendChild(tag);
  });
}

async function doTemplateSearch(word, mode) {
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = '...';
  try {
    let words;
    if (mode === 'pain') {
      words = await expandPainPoints(word);
    } else if (mode === 'scenario') {
      words = await expandScenario(word);
    } else {
      words = await expandWord(word);
    }
    currentWord = word;
    Graph.setRootWord(word);
    Graph.addChildNodes(Graph.getGraphState().rootId, words, mode);
    Input.clear();
    History.addEntry(word, Graph.getGraphState());
  } catch (err) {
    alert('发散失败：' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '发散';
  }
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
      body: JSON.stringify({ graphState: state, projectName: currentProject.name }),
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
  const submitBtn = document.getElementById('submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = '...';
  try {
    const words = await expandWord(word);
    currentWord = word;
    Graph.setRootWord(word);
    Graph.addChildNodes(Graph.getGraphState().rootId, words);
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

// --- Graph Change ---

function onGraphChange() {
  const list = History.getHistory();
  if (list.length > 0 && list[0].word === currentWord) {
    History.updateLatestHistory(Graph.getGraphState());
  }
  scheduleSave();
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
