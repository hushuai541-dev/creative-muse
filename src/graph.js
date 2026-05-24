// --- Graph Engine (entry) ---
// Re-exports from sub-modules

import * as S from './graph-state.js';
import * as R from './graph-render.js';
import { startPhysicsLoop } from './graph-physics.js';
import * as I from './graph-interact.js';

export function init(options) {
  S.setDomRefs(options);
  if (options.initialState) S.loadStateFromData(options.initialState);
  else S.loadState();
  I.wireCallbacks();
  I.bindEvents();
  startPhysicsLoop();
  R.updateWelcomeHint();
  R.renderAll();
}

export function setOnPopupAction(fn) { S.setOnPopupAction(fn); }

// Re-export from state
export { screenToWorld, loadStateFromData, exportState, hasNodes, getRootWord, getNode } from './graph-state.js';

// Re-export from render
export { applyTransform, renderAll, renderNodes, renderEdges, updateZoomDisplay, updateWelcomeHint, painTagLabel, exportToMarkdown, exportToImage } from './graph-render.js';

// Re-export from interact
export { zoomAt, fitView, clearCanvas, undo, getGraphState, restoreGraph, setRootWord, addChildNodes, showPopupMenu, hidePopupMenu } from './graph-interact.js';
