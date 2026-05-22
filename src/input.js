// --- Input Component ---

let inputArea, wordInput, submitBtn;
let onSubmit = null;
let isDocked = false;

export function init(options) {
  inputArea = options.inputArea;
  wordInput = options.wordInput;
  submitBtn = options.submitBtn;
  onSubmit = options.onSubmit || null;

  bindEvents();
}

function bindEvents() {
  submitBtn.addEventListener('click', handleSubmit);
  wordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSubmit();
  });
}

function handleSubmit() {
  const word = wordInput.value.trim();
  if (!word) return;
  if (onSubmit) onSubmit(word);
}

export function dockToBottom() {
  if (isDocked) return;
  isDocked = true;
  inputArea.classList.remove('centered');
  inputArea.classList.add('docked');
}

export function moveToCenter() {
  isDocked = false;
  inputArea.classList.remove('docked');
  inputArea.classList.add('centered');
}

export function clear() {
  wordInput.value = '';
}

export function setWord(word) {
  wordInput.value = word;
}

export function getWord() {
  return wordInput.value.trim();
}

export function setIsDocked(val) {
  isDocked = val;
}
