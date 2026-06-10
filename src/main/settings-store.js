// Main-process settings persistence: safe load/save with schema validation. JSON in app userData.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { validate, SETTINGS_DEFAULTS } = require('../settings-schema');

function settingsFilePath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function load() {
  const filePath = settingsFilePath();
  try {
    if (!fs.existsSync(filePath)) {
      return validate({});  // returns a deep clone of defaults
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return validate(parsed);
  } catch (err) {
    console.warn('[settings-store] failed to load settings, using defaults:', err.message);
    return validate({});
  }
}

function save(input) {
  const normalized = validate(input);
  const filePath = settingsFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

function ensureExists() {
  const filePath = settingsFilePath();
  if (!fs.existsSync(filePath)) {
    save({});  // writes defaults
  }
}

module.exports = { settingsFilePath, load, save, ensureExists, SETTINGS_DEFAULTS };
