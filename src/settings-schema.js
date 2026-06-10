// Pure settings schema with defaults and validation — loads in Node and browser
const SETTINGS_DEFAULTS = Object.freeze({
  name: 'Pixel',
  colors: Object.freeze({
    pet: '#ffffff',
    background: '#1e1e28',
    accent: '#4ade80'
  })
});

function validate(input) {
  // Coerce to object; missing/wrong-type → defaults per field
  if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
    return JSON.parse(JSON.stringify(SETTINGS_DEFAULTS));
  }

  // Validate name
  let name = 'Pixel';
  if (typeof input.name === 'string') {
    const trimmed = input.name.trim();
    if (trimmed.length >= 1 && trimmed.length <= 20) {
      name = trimmed;
    }
  }

  // Validate colors
  const colors = {
    pet: '#ffffff',
    background: '#1e1e28',
    accent: '#4ade80'
  };

  if (input.colors && typeof input.colors === 'object' && !Array.isArray(input.colors)) {
    const hexRegex = /^#[0-9a-fA-F]{6}$/;

    if (typeof input.colors.pet === 'string' && hexRegex.test(input.colors.pet)) {
      colors.pet = input.colors.pet;
    }
    if (typeof input.colors.background === 'string' && hexRegex.test(input.colors.background)) {
      colors.background = input.colors.background;
    }
    if (typeof input.colors.accent === 'string' && hexRegex.test(input.colors.accent)) {
      colors.accent = input.colors.accent;
    }
  }

  return { name, colors };
}

// UMD pattern: load in Node and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SETTINGS_DEFAULTS, validate };
} else {
  globalThis.SETTINGS_DEFAULTS = SETTINGS_DEFAULTS;
  globalThis.validateSettings = validate;
}
