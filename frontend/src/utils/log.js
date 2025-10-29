export const DEBUG_SEGMENTS = true;

export function slog(...args) {
  if (DEBUG_SEGMENTS) console.log('[Segments]', ...args);
}
export function swarn(...args) {
  if (DEBUG_SEGMENTS) console.warn('[Segments]', ...args);
}
export function serror(...args) {
  console.error('[Segments]', ...args);
}