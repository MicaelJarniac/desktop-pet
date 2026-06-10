// Pure settings schema with defaults and validation — loads in Node and browser
const SETTINGS_DEFAULTS = Object.freeze({
  name: 'Pixel',
  colors: Object.freeze({
    pet: '#ffffff',
    background: '#1e1e28',
    accent: '#4ade80'
  })
});

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const COLOR_KEYS = ['pet', 'background', 'accent'];
const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 20;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function defaults() {
  return JSON.parse(JSON.stringify(SETTINGS_DEFAULTS));
}

function validate(input) {
  if (!isPlainObject(input)) return defaults();

  const result = defaults();

  if (typeof input.name === 'string') {
    const trimmed = input.name.trim();
    if (trimmed.length >= NAME_MIN_LENGTH && trimmed.length <= NAME_MAX_LENGTH) {
      result.name = trimmed;
    }
  }

  if (isPlainObject(input.colors)) {
    for (const key of COLOR_KEYS) {
      const value = input.colors[key];
      if (typeof value === 'string' && HEX_COLOR.test(value)) {
        result.colors[key] = value;
      }
    }
  }

  return result;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SETTINGS_DEFAULTS, validate };
} else {
  globalThis.SETTINGS_DEFAULTS = SETTINGS_DEFAULTS;
  globalThis.validateSettings = validate;
}
