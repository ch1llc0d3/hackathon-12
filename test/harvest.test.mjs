import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickLabel, clean, redactValue, normalizeControl, cssEscape, FORBIDDEN_TYPES,
} from '../src/harvest.js';

test('clean collapses whitespace and drops the trailing colon', () => {
  assert.equal(clean('  Nº  de\n identificación :  '), 'Nº de identificación');
  assert.equal(clean('Domicilio *'), 'Domicilio');
  assert.equal(clean(undefined), '');
});

test('pickLabel prefers an explicit label over a guess', () => {
  const got = pickLabel({
    forLabel: 'Régimen de tributación',
    precedingText: 'Sección 3',
    placeholder: 'Elija una opción',
  });
  assert.equal(got.label, 'Régimen de tributación');
  assert.equal(got.labelSource, 'label[for]');
});

test('pickLabel falls back down the chain, reporting which rung it used', () => {
  assert.deepEqual(pickLabel({ ariaLabel: 'Teléfono' }),
    { label: 'Teléfono', labelSource: 'aria-label' });
  assert.deepEqual(pickLabel({ placeholder: 'DD/MM/AAAA' }),
    { label: 'DD/MM/AAAA', labelSource: 'placeholder' });
  assert.deepEqual(pickLabel({}), { label: '', labelSource: 'none' });
});

test('pickLabel rejects one-character punctuation posing as a label', () => {
  assert.equal(pickLabel({ forLabel: '*', ariaLabel: 'Código postal' }).label, 'Código postal');
});

test('redactValue reports whether a field is filled, never what is in it', () => {
  const secret = '12345678Z';
  const got = redactValue(secret);
  assert.deepEqual(got, { filled: true });
  assert.equal(JSON.stringify(got).includes(secret), false);
  assert.deepEqual(redactValue('   '), { filled: false });
  assert.deepEqual(redactValue(undefined), { filled: false });
});

test('normalizeControl never emits the typed value', () => {
  const field = normalizeControl({
    ref: 'vt-0', tag: 'input', type: 'text', id: 'ci',
    forLabel: 'Nº de Cédula de Identidad Civil', value: '12345678', required: true,
  });
  assert.equal(field.filled, true);
  assert.equal('value' in field, false);
  assert.equal(JSON.stringify(field).includes('12345678'), false);
});

test('normalizeControl refuses passwords and hidden inputs', () => {
  for (const type of FORBIDDEN_TYPES) {
    const field = normalizeControl({ ref: 'vt-1', tag: 'input', type, forLabel: 'Contraseña' });
    assert.equal(field, null, `${type} must never be harvested`);
  }
});

test('normalizeControl drops controls it cannot describe', () => {
  assert.equal(normalizeControl({ ref: 'vt-2', tag: 'input', type: 'text' }), null);
});

test('normalizeControl carries the constraints that explain a field', () => {
  const field = normalizeControl({
    ref: 'vt-3', tag: 'input', type: 'text', forLabel: 'Código postal',
    pattern: '[0-9]{5}', maxLength: 5,
  });
  assert.equal(field.pattern, '[0-9]{5}');
  assert.equal(field.maxLength, 5);
});

test('normalizeControl ignores the browser default maxLength', () => {
  const field = normalizeControl({
    ref: 'vt-4', tag: 'input', type: 'text', forLabel: 'Notas', maxLength: 524288,
  });
  assert.equal('maxLength' in field, false);
});

test('normalizeControl cleans and caps select options', () => {
  const field = normalizeControl({
    ref: 'vt-5', tag: 'select', type: 'select', forLabel: 'Provincia',
    options: ['  Central ', 'Alto Paraná', '', ...Array.from({ length: 40 }, (_, i) => `P${i}`)],
  });
  assert.equal(field.options[0], 'Central');
  assert.equal(field.options.includes(''), false);
  assert.equal(field.options.length, 25);
});

test('cssEscape survives ids containing colons and dots', () => {
  assert.equal(cssEscape('form:field.1'), 'form\\:field\\.1');
});
