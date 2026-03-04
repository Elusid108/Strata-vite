/**
 * Simple logging utility with categories and production toggle.
 * - [SYNC]: Only when VITE_STRATA_DEBUG_SYNC=true
 * - [STATE], [AUTH], [ERROR]: When not in production (import.meta.env.PROD)
 */

const IS_PROD = import.meta.env.PROD;
const DEBUG_SYNC = import.meta.env.VITE_STRATA_DEBUG_SYNC === 'true';

function shouldLog(category) {
  if (IS_PROD) return false;
  if (category === 'SYNC') return DEBUG_SYNC;
  return true;
}

/**
 * Log a message with category prefix.
 * @param {string} category - One of 'SYNC', 'STATE', 'AUTH', 'ERROR'
 * @param {string} message - Log message
 * @param {...*} args - Additional args passed to console
 */
export function log(category, message, ...args) {
  if (!shouldLog(category)) return;
  const prefix = `[${category}]`;
  if (category === 'ERROR') {
    console.error(prefix, message, ...args);
  } else {
    console.log(prefix, message, ...args);
  }
}
