export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

export function icon(id, className = 'ic') {
  return `<svg class="${className}" aria-hidden="true" focusable="false"><use href="#${id}"></use></svg>`;
}

const reducedQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

export function prefersReducedMotion() {
  return Boolean(reducedQuery && reducedQuery.matches);
}

export function onReducedMotionChange(handler) {
  if (!reducedQuery) return;
  if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', handler);
  else if (reducedQuery.addListener) reducedQuery.addListener(handler);
}

export function motionAllowed() {
  return !prefersReducedMotion() && document.documentElement.dataset.motion !== 'off';
}

export function tween(from, to, duration, onUpdate, onDone) {
  if (!motionAllowed() || from === to || !Number.isFinite(from) || !Number.isFinite(to)) {
    onUpdate(to);
    if (onDone) onDone();
    return () => {};
  }
  let frame = 0;
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    onUpdate(from + (to - from) * ease(t));
    if (t < 1) frame = requestAnimationFrame(tick);
    else if (onDone) onDone();
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

export function restartAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}
