const test = require('node:test');
const assert = require('node:assert/strict');
const { SETTINGS_DEFAULTS, validate } = require('../src/settings-schema');

test('validate(undefined) returns object deep-equal to fresh defaults', () => {
  const result = validate(undefined);
  assert.deepStrictEqual(result, {
    name: 'Pixel',
    colors: { pet: '#ffffff', background: '#1e1e28', accent: '#4ade80' }
  });
});

test('validate(null) returns defaults', () => {
  const result = validate(null);
  assert.deepStrictEqual(result, {
    name: 'Pixel',
    colors: { pet: '#ffffff', background: '#1e1e28', accent: '#4ade80' }
  });
});

test('validate({}) returns defaults', () => {
  const result = validate({});
  assert.deepStrictEqual(result, {
    name: 'Pixel',
    colors: { pet: '#ffffff', background: '#1e1e28', accent: '#4ade80' }
  });
});

test('validate("garbage string") returns defaults', () => {
  const result = validate('garbage string');
  assert.deepStrictEqual(result, {
    name: 'Pixel',
    colors: { pet: '#ffffff', background: '#1e1e28', accent: '#4ade80' }
  });
});

test('validate(42) returns defaults', () => {
  const result = validate(42);
  assert.deepStrictEqual(result, {
    name: 'Pixel',
    colors: { pet: '#ffffff', background: '#1e1e28', accent: '#4ade80' }
  });
});

test('valid input round-trips exactly', () => {
  const input = {
    name: 'Rex',
    colors: { pet: '#ff0000', background: '#000000', accent: '#00ff00' }
  };
  const result = validate(input);
  assert.deepStrictEqual(result, input);
});

test('partial input (name only) returns name + default colors', () => {
  const result = validate({ name: 'Rex' });
  assert.deepStrictEqual(result, {
    name: 'Rex',
    colors: { pet: '#ffffff', background: '#1e1e28', accent: '#4ade80' }
  });
});

test('bad color string falls back to default pet color', () => {
  const result = validate({ colors: { pet: 'not-a-color' } });
  assert.deepStrictEqual(result, {
    name: 'Pixel',
    colors: { pet: '#ffffff', background: '#1e1e28', accent: '#4ade80' }
  });
});

test('name trimming: "  Rex  " becomes "Rex"', () => {
  const result = validate({ name: '  Rex  ' });
  assert.strictEqual(result.name, 'Rex');
});

test('name empty after trim returns default "Pixel"', () => {
  const result = validate({ name: '   ' });
  assert.strictEqual(result.name, 'Pixel');
});

test('name too long (21 chars) returns default "Pixel"', () => {
  const result = validate({ name: 'a'.repeat(21) });
  assert.strictEqual(result.name, 'Pixel');
});

test('name at limit (20 chars) is accepted', () => {
  const result = validate({ name: 'a'.repeat(20) });
  assert.strictEqual(result.name, 'a'.repeat(20));
  assert.strictEqual(result.name.length, 20);
});

test('SETTINGS_DEFAULTS is frozen', () => {
  assert.strictEqual(Object.isFrozen(SETTINGS_DEFAULTS), true);
  assert.strictEqual(Object.isFrozen(SETTINGS_DEFAULTS.colors), true);
});

test('mutating returned object does NOT mutate defaults', () => {
  const result = validate({});
  result.name = 'Foo';
  assert.strictEqual(SETTINGS_DEFAULTS.name, 'Pixel');
});

test('uppercase hex accepted: #FF00AA', () => {
  const result = validate({ colors: { pet: '#FF00AA' } });
  assert.strictEqual(result.colors.pet, '#FF00AA');
});

test('3-digit hex rejected: #fff falls back to default', () => {
  const result = validate({ colors: { pet: '#fff' } });
  assert.strictEqual(result.colors.pet, '#ffffff');
});
