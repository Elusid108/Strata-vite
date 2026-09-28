import DOMPurify from 'dompurify';

/**
 * Sanitize block HTML before it is injected into a contenteditable.
 * Block content is authored by the user, but pasted HTML from other sites can
 * carry scripts and event handlers; this keeps only inline formatting, lists
 * and links.
 */
const CONFIG = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'br', 'span', 'a', 'ul', 'ol', 'li', 'div', 'p', 'code', 'pre', 'sub', 'sup', 'mark'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'data-checked', 'class', 'style'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
};

export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return html || '';
  if (typeof window === 'undefined' || !DOMPurify?.sanitize) return html;
  return DOMPurify.sanitize(html, CONFIG);
}
