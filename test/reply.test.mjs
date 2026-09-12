// Tests for the two gates in src/reply.js: what leaves the machine, and what
// we are willing to believe on the way back.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripValues, parseAgentReply } from '../src/reply.js';

const SECRET = '80012345';

test('stripValues removes every key that could carry what the person typed', () => {
  const safe = stripValues({
    ref: 'vt-0',
    label: 'Nº de Cédula de Identidad Civil',
    required: true,
    filled: true,
    value: SECRET,
    values: [SECRET],
    textContent: SECRET,
    defaultValue: SECRET,
  });

  assert.equal(JSON.stringify(safe).includes(SECRET), false,
    'a known secret must not survive anywhere in the outbound payload');
  assert.deepEqual(safe, {
    ref: 'vt-0',
    label: 'Nº de Cédula de Identidad Civil',
    required: true,
    filled: true,
  });
});

test('stripValues keeps the structure the model actually needs', () => {
  const safe = stripValues({ ref: 'vt-1', label: 'DV', pattern: '[0-9]', maxLength: 1 });
  assert.equal(safe.pattern, '[0-9]');
  assert.equal(safe.maxLength, 1);
});

test('stripValues survives null and undefined', () => {
  assert.deepEqual(stripValues(null), {});
  assert.deepEqual(stripValues(undefined), {});
});

test('parseAgentReply reads a plain JSON reply', () => {
  const out = parseAgentReply(
    '{"summary":"Te inscribe en el RUC.","fields":[{"ref":"vt-0","meaning":"Tu cédula."}]}',
    [{ ref: 'vt-0' }],
  );
  assert.equal(out.summary, 'Te inscribe en el RUC.');
  assert.equal(out.fields.length, 1);
  assert.equal(out.degraded, undefined);
});

test('parseAgentReply unwraps a fenced code block', () => {
  const out = parseAgentReply('```json\n{"summary":"Hola","fields":[]}\n```', []);
  assert.equal(out.summary, 'Hola');
  assert.equal(out.degraded, undefined);
});

test('parseAgentReply drops explanations for fields that do not exist', () => {
  const out = parseAgentReply(
    '{"summary":"","fields":[{"ref":"vt-0"},{"ref":"vt-99"},{"ref":null}]}',
    [{ ref: 'vt-0' }],
  );
  assert.deepEqual(out.fields.map((f) => f.ref), ['vt-0'],
    'a hallucinated ref would render as a card pointing at nothing');
});

test('parseAgentReply degrades to prose instead of throwing', () => {
  const out = parseAgentReply('Lo siento, no puedo ayudarte con eso.', [{ ref: 'vt-0' }]);
  assert.equal(out.degraded, true);
  assert.equal(out.fields.length, 0);
  assert.match(out.summary, /Lo siento/);
});

test('parseAgentReply survives an empty or absent reply', () => {
  for (const raw of ['', null, undefined]) {
    const out = parseAgentReply(raw, []);
    assert.equal(out.degraded, true);
    assert.deepEqual(out.fields, []);
  }
});

test('parseAgentReply refuses a non-string summary', () => {
  const out = parseAgentReply('{"summary":{"x":1},"fields":[]}', []);
  assert.equal(out.summary, '');
});

test('parseAgentReply tolerates fields that are not an array', () => {
  const out = parseAgentReply('{"summary":"ok","fields":"nope"}', []);
  assert.deepEqual(out.fields, []);
});
