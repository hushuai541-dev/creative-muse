// --- Project Manager ---
// localStorage-backed multi-project support

const PROJECTS_KEY = 'creative-muse-projects';
const CURRENT_KEY = 'creative-muse-current-project';

export function getProjects() {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveProjects(list) {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

export function getCurrentProjectId() {
  return localStorage.getItem(CURRENT_KEY) || null;
}

function setCurrentProjectId(id) {
  localStorage.setItem(CURRENT_KEY, id);
}

export function getCurrentProject() {
  const id = getCurrentProjectId();
  if (!id) return createProject('默认项目');
  const list = getProjects();
  return list.find(p => p.id === id) || createProject('默认项目');
}

export function createProject(name = '未命名项目') {
  const list = getProjects();
  const project = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    createdAt: new Date().toISOString(),
    graphState: null,
  };
  list.unshift(project);
  saveProjects(list);
  setCurrentProjectId(project.id);
  return project;
}

export function deleteProject(id) {
  const list = getProjects().filter(p => p.id !== id);
  saveProjects(list);
  if (getCurrentProjectId() === id) {
    const next = list[0] || createProject('默认项目');
    setCurrentProjectId(next.id);
  }
}

export function renameProject(id, name) {
  const list = getProjects();
  const p = list.find(p => p.id === id);
  if (p) {
    p.name = name;
    saveProjects(list);
  }
}

export function saveGraphState(id, graphState) {
  const list = getProjects();
  const p = list.find(p => p.id === id);
  if (p) {
    p.graphState = graphState;
    saveProjects(list);
  }
}

export function switchProject(id) {
  // Save current project's state before switching
  // (caller handles this via saveCurrentProject)
  setCurrentProjectId(id);
  const list = getProjects();
  return list.find(p => p.id === id) || null;
}

export function getProject(id) {
  return getProjects().find(p => p.id === id) || null;
}
