// --- Graph Physics Module ---
// Spring physics, collision avoidance, entry animation loop

import * as S from './graph-state.js';
import * as R from './graph-render.js';

export function startPhysicsLoop() {
  function tick() {
    let needsUpdate = false;

    for (const id in S.state.nodes) {
      const node = S.state.nodes[id];
      if (node.animScale !== node.targetScale) {
        node.animScale += (node.targetScale - node.animScale) * 0.15;
        if (Math.abs(node.targetScale - node.animScale) < 0.002) node.animScale = node.targetScale;
        needsUpdate = true;
      }
      if (node.animOpacity !== node.targetOpacity) {
        node.animOpacity += (node.targetOpacity - node.animOpacity) * 0.15;
        if (Math.abs(node.targetOpacity - node.animOpacity) < 0.002) node.animOpacity = node.targetOpacity;
        needsUpdate = true;
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
