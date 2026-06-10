'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const settingsForm = document.getElementById('settings-form');
  const petNameInput = document.getElementById('pet-name');
  const petColorInput = document.getElementById('color-pet');
  const bgColorInput = document.getElementById('color-bg');
  const accentColorInput = document.getElementById('color-accent');
  const btnCancel = document.getElementById('btn-cancel');
  const btnReset = document.getElementById('btn-reset');

  function populate(s) {
    petNameInput.value = s.name;
    petColorInput.value = s.colors.pet;
    bgColorInput.value = s.colors.background;
    accentColorInput.value = s.colors.accent;
  }

  function collectFormSettings() {
    return {
      name: petNameInput.value,
      colors: {
        pet: petColorInput.value,
        background: bgColorInput.value,
        accent: accentColorInput.value,
      },
    };
  }

  let currentSettings;
  try {
    currentSettings = await window.electronAPI.getSettings();
  } catch (err) {
    console.error('[settings] Failed to load settings, using defaults:', err);
    const d = globalThis.SETTINGS_DEFAULTS;
    currentSettings = {
      name: d.name,
      colors: { pet: d.colors.pet, background: d.colors.background, accent: d.colors.accent },
    };
  }
  populate(currentSettings);

  settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await window.electronAPI.saveSettings(collectFormSettings());
      window.close();
    } catch (err) {
      console.error('[settings] Failed to save settings:', err);
    }
  });

  btnCancel.addEventListener('click', () => {
    window.close();
  });

  btnReset.addEventListener('click', async () => {
    try {
      const defaults = globalThis.SETTINGS_DEFAULTS;
      populate({
        name: defaults.name,
        colors: {
          pet: defaults.colors.pet,
          background: defaults.colors.background,
          accent: defaults.colors.accent,
        },
      });
      await window.electronAPI.saveSettings({
        ...defaults,
        colors: { ...defaults.colors },
      });
    } catch (err) {
      console.error('[settings] Failed to reset settings:', err);
    }
  });

  window.electronAPI.onSettingsUpdated((s) => {
    populate(s);
  });
});
