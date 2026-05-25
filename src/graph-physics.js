// --- Graph Physics Module ---
// Spring physics, collision avoidance, entry animation loop

import * as S from './graph-state.js';
import * as R from './graph-render.js';

export function startPhysicsLoop() {
  const startTime = performance.now();

  function tick(now) {
    let needsUpdate = false;

    for (const id in S.state.nodes) {
      const node = S.state.nodes[id];

      // Wave cascade entry animation
      if (node.animScale !== node.targetScale || node.animOpacity !== node.targetOpacity) {
        const delay = node.waveDelay || 0;
        if (now - startTime >= delay) {
          const elapsed = now - startTime - delay;
          const duration = 550; // ms
          const progress = Math.min(1, elapsed / duration);
          // Ease-out cubic
          const t = 1 - Math.pow(1 - progress, 3);

          if (node.animScale !== node.targetScale) {
            node.animScale = 0.3 + (node.targetScale - 0.3) * t;
            if (progress >= 1) node.animScale = node.targetScale;
            needsUpdate = true;
          }
          if (node.animOpacity !== node.targetOpacity) {
            node.animOpacity = t;
            if (progress >= 1) node.animOpacity = node.targetOpacity;
            needsUpdate = true;
          }
        }
      }

      if (node.parentId === null) continue;
      if (S.dragging && S.dragging.nodeId === id) continue;

      const dx = node.targetX - node.x;
      const dy = node.targetY - node.y;
      node.vx += dx * S.SPRING_STIFFNESS;
      node.vy += dy * S.SPRING_STIFFNESS;
      node.vx *= S.SPRING_DAMPING;
      node.vy *= S.SPRING_DAMPING;
      node.x += node.vx;
      node.y += node.vy;

      if (Math.abs(node.vx) > 0.01 || Math.abs(node.vy) > 0.01) needsUpdate = true;
    }

    // Global collision: check all visible non-root nodes against each other
    const nodeIds = Object.keys(S.state.nodes);
    for (let a = 0; a < nodeIds.length; a++) {
      const node = S.state.nodes[nodeIds[a]];
      if (!node.parentId) continue;
      for (let b = a + 1; b < nodeIds.length; b++) {
        const other = S.state.nodes[nodeIds[b]];
        if (!other.parentId) continue;
        if (node.parentId === other.parentId) continue; // siblings handled below
        const dx = node.x - other.x, dy = node.y - other.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < S.COLLISION_RADIUS * 1.6 && dist > 0.001) {
          const force = (S.COLLISION_RADIUS * 1.6 - dist) * S.COLLISION_FORCE * 0.01;
          const fx = dx / dist * force, fy = dy / dist * force;
          if (!S.dragging || S.dragging.nodeId !== node.id) { node.x += fx; node.y += fy; }
          if (!S.dragging || S.dragging.nodeId !== other.id) { other.x -= fx; other.y -= fy; }
          needsUpdate = true;
        }
      }
    }

    // Sibling collision (stronger push)
    for (const id in S.state.nodes) {
      const node = S.state.nodes[id];
      if (!node.parentId) continue;
      const siblings = S.getChildren(node.parentId);
      for (const sib of siblings) {
        if (sib.id === id) continue;
        const dx = node.x - sib.x, dy = node.y - sib.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < S.COLLISION_RADIUS && dist > 0.001) {
          const force = (S.COLLISION_RADIUS - dist) * S.COLLISION_FORCE * 0.02;
          const fx = dx / dist * force, fy = dy / dist * force;
          if (!S.dragging || S.dragging.nodeId !== node.id) { node.x += fx; node.y += fy; node.vx += fx * 0.3; node.vy += fy * 0.3; }
          if (!S.dragging || S.dragging.nodeId !== sib.id) { sib.x -= fx; sib.y -= fy; sib.vx -= fx * 0.3; sib.vy -= fy * 0.3; }
          needsUpdate = true;
        }
      }
    }

    if (needsUpdate) R.renderAll();
    S.setAnimFrameId(requestAnimationFrame(tick));
  }
  S.setAnimFrameId(requestAnimationFrame(tick));
}
