// harvest.js — turn a live page of form controls into a compact, sendable map.
//
// Split deliberately in two:
//   * pure functions (pickLabel, normalizeControl, redactValue) — all the
//     judgement calls, testable with plain objects and no DOM at all
//   * harvest(doc) — a thin DOM walker that extracts raw strings and hands
//     them to the pure functions
//
// Nothing here ever reads what the user has typed. See redactValue.

/** Controls we refuse to look at, no matter what. */
export const FORBIDDEN_TYPES = ['password', 'hidden'];

/**
 * Choose the best human label for a control, and say where it came from.
 * Order matters: an explicit <label for> beats a guess from nearby text.
 *
 * @param {{forLabel?, ariaLabel?, wrappingLabel?, precedingText?, placeholder?, name?}} raw
 * @returns {{label: string, labelSource: string}}
 */
export function pickLabel(raw = {}) {
  const candidates = [
    ['label[for]', raw.forLabel],
    ['aria-label', raw.ariaLabel],
    ['wrapping label', raw.wrappingLabel],
    ['nearby text', raw.precedingText],
    ['placeholder', raw.placeholder],
    ['name attribute', raw.name],
  ];
  for (const [labelSource, value] of candidates) {
    const cleaned = clean(value);
    // A one-character "label" is punctuation, not a label.
    if (cleaned.length > 1) return { label: cleaned, labelSource };
  }
  return { label: '', labelSource: 'none' };
}

/** Collapse whitespace and strip the trailing colon forms love. */
export function clean(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\s+/g, ' ').trim().replace(/[:：*]+$/, '').trim();
}

/**
 * The privacy rule, in one function: we report WHETHER a field is filled,
 * never WITH WHAT. The model helps with the question, not the answer.
 */
export function redactValue(value) {
  return { filled: typeof value === 'string' && value.trim().length > 0 };
}

/**
 * Build the field entry that gets sent to the agent.
 * Returns null for anything we must not touch.
 *
 * @param {object} raw  extracted attributes, plain strings
 * @returns {object|null}
 */
export function normalizeControl(raw = {}) {
  const type = (raw.type || 'text').toLowerCase();
  if (FORBIDDEN_TYPES.includes(type)) return null;
  if (raw.tag === 'input' && !raw.type) return null; // malformed, skip

  const { label, labelSource } = pickLabel(raw);
  // No label and no name means we cannot describe it usefully.
  if (!label) return null;

  const field = {
    id: raw.id || '',
    ref: raw.ref,
    tag: raw.tag,
    type,
    label,
    labelSource,
    required: Boolean(raw.required),
    ...redactValue(raw.value),
  };

  if (raw.pattern) field.pattern = raw.pattern;
  if (raw.maxLength > 0 && raw.maxLength < 524288) field.maxLength = raw.maxLength;
  if (Array.isArray(raw.options) && raw.options.length) {
    field.options = raw.options.map(clean).filter(Boolean).slice(0, 25);
  }
  return field;
}

/** Text immediately before a control, used when there is no real label. */
export function precedingTextOf(el) {
  let node = el.previousSibling;
  let hops = 0;
  while (node && hops < 4) {
    const text = clean(node.textContent || '');
    if (text.length > 1) return text;
    node = node.previousSibling;
    hops++;
  }
  const parentText = clean(el.parentElement ? el.parentElement.textContent : '');
  return parentText.slice(0, 120);
}

/**
 * Walk a document and produce the form map.
 * Each control gets a `ref` stamped on it so fill-back can find it again.
 */
export function harvest(doc) {
  const controls = doc.querySelectorAll('input, select, textarea');
  const fields = [];
  let n = 0;

  for (const el of controls) {
    const tag = el.tagName.toLowerCase();
    const ref = 'vt-' + n++;
    el.setAttribute('data-ventanilla-ref', ref);

    let forLabel = '';
    if (el.id) {
      const l = doc.querySelector(`label[for="${cssEscape(el.id)}"]`);
      if (l) forLabel = l.textContent;
    }
    const wrapping = el.closest ? el.closest('label') : null;

    const field = normalizeControl({
      ref,
      tag,
      id: el.id,
      name: el.name,
      type: tag === 'input' ? el.type || 'text' : tag,
      value: el.value,
      required: el.required || el.getAttribute('aria-required') === 'true',
      pattern: el.getAttribute('pattern'),
      maxLength: el.maxLength,
      placeholder: el.getAttribute('placeholder'),
      ariaLabel: el.getAttribute('aria-label'),
      forLabel,
      wrappingLabel: wrapping ? wrapping.textContent : '',
      precedingText: precedingTextOf(el),
      options: tag === 'select' ? [...el.options].map((o) => o.textContent) : null,
    });

    if (field) fields.push(field);
  }
  return fields;
}

/** Minimal CSS.escape — ids in the wild contain colons and dots. */
export function cssEscape(value) {
  return String(value).replace(/([^\w-])/g, '\\$1');
}
