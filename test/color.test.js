const test = require('node:test');
const assert = require('node:assert/strict');
const { hexToRgba } = require('../src/utils/color');

test('hexToRgba - valid conversions', async (t) => {
  await t.test('black with 0 alpha', () => {
    assert.equal(hexToRgba('#000000', 0), 'rgba(0, 0, 0, 0)');
  });

  await t.test('white with 1 alpha', () => {
    assert.equal(hexToRgba('#ffffff', 1), 'rgba(255, 255, 255, 1)');
  });

  await t.test('dark gray with 0.88 alpha', () => {
    assert.equal(hexToRgba('#1e1e28', 0.88), 'rgba(30, 30, 40, 0.88)');
  });

  await t.test('green with 0.5 alpha', () => {
    assert.equal(hexToRgba('#4ade80', 0.5), 'rgba(74, 222, 128, 0.5)');
  });

  await t.test('uppercase hex', () => {
    assert.equal(hexToRgba('#ABCDEF', 0.5), 'rgba(171, 205, 239, 0.5)');
  });

  await t.test('mixed case hex', () => {
    assert.equal(hexToRgba('#aBcDeF', 0.5), 'rgba(171, 205, 239, 0.5)');
  });
});

test('hexToRgba - invalid hex', async (t) => {
  await t.test('missing hash', () => {
    assert.throws(() => hexToRgba('ffffff', 1));
  });

  await t.test('3-digit hex', () => {
    assert.throws(() => hexToRgba('#fff', 1));
  });

  await t.test('7-digit hex', () => {
    assert.throws(() => hexToRgba('#1234567', 1));
  });

  await t.test('non-hex characters', () => {
    assert.throws(() => hexToRgba('#zzzzzz', 1));
  });
});

test('hexToRgba - invalid alpha', async (t) => {
  await t.test('negative alpha', () => {
    assert.throws(() => hexToRgba('#000000', -0.1));
  });

  await t.test('alpha > 1', () => {
    assert.throws(() => hexToRgba('#000000', 1.1));
  });

  await t.test('NaN alpha', () => {
    assert.throws(() => hexToRgba('#000000', NaN));
  });

  await t.test('string alpha', () => {
    assert.throws(() => hexToRgba('#000000', '0.5'));
  });
});
