// Converts hex color + alpha to rgba() CSS string

function hexToRgba(hex, alpha) {
  // Validate hex format
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error('Invalid hex color: ' + hex);
  }

  // Validate alpha is a number in [0, 1]
  if (typeof alpha !== 'number' || isNaN(alpha) || alpha < 0 || alpha > 1) {
    throw new Error('Invalid alpha: ' + alpha);
  }

  // Parse R, G, B from hex
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// UMD export pattern
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { hexToRgba };
} else {
  globalThis.hexToRgba = hexToRgba;
}
