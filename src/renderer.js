const pet = new Pet();

// DOM refs
const spriteEl   = document.getElementById('sprite');
const nameEl     = document.getElementById('name');
const hungerBar  = document.getElementById('hunger-bar');
const happyBar   = document.getElementById('happiness-bar');
const energyBar  = document.getElementById('energy-bar');
const statusMsg  = document.getElementById('status-message');

const btnFeed     = document.getElementById('btn-feed');
const btnPlay     = document.getElementById('btn-play');
const btnSleep    = document.getElementById('btn-sleep');
const btnSettings = document.getElementById('btn-settings');

// --- Settings ---

function applySettings(settings) {
  const root = document.documentElement;
  root.style.setProperty('--color-pet', settings.colors.pet);
  root.style.setProperty('--color-bg', hexToRgba(settings.colors.background, 0.88));
  root.style.setProperty('--color-accent', settings.colors.accent);
}

// --- Rendering ---

function updateUI() {
  spriteEl.textContent = pet.sprite;
  nameEl.textContent = pet.name;

  spriteEl.className = '';
  if (pet.isSleeping) spriteEl.classList.add('sleeping');
  if (!pet.alive) spriteEl.classList.add('dead');

  setBar(hungerBar, pet.hunger);
  setBar(happyBar, pet.happiness);
  setBar(energyBar, pet.energy);

  // Status text
  if (!pet.alive) {
    statusMsg.textContent = 'Click to try again...';
  } else if (pet.isSleeping) {
    statusMsg.textContent = 'Sleeping...';
  } else if (pet.mood === 'hungry') {
    statusMsg.textContent = 'So hungry...';
  } else if (pet.mood === 'sad') {
    statusMsg.textContent = 'Play with me!';
  } else {
    statusMsg.textContent = '';
  }
}

function setBar(el, value) {
  el.style.width = `${value}%`;
  el.className = 'stat-fill';
  if (value < 20) el.classList.add('danger');
  else if (value < 45) el.classList.add('warning');
}

function flashMessage(text) {
  statusMsg.textContent = text;
  setTimeout(() => updateUI(), 1500);
}

// --- Actions ---

btnFeed.addEventListener('click', () => {
  if (!pet.alive) { pet.reset(); return; }
  pet.feed();
  flashMessage('Yum! 🍖');
});

btnPlay.addEventListener('click', () => {
  if (!pet.alive) { pet.reset(); return; }
  pet.play();
  flashMessage('Wheee! 🎾');
});

btnSleep.addEventListener('click', () => {
  if (!pet.alive) { pet.reset(); return; }
  pet.sleep();
  flashMessage(pet.isSleeping ? 'Good night... 💤' : 'I\'m awake!');
});

// Settings button
if (btnSettings) {
  btnSettings.addEventListener('click', () => window.electronAPI.openSettings());
}

// Tray menu actions
window.electronAPI.onAction((action) => {
  switch (action) {
    case 'feed':  pet.feed();  flashMessage('Yum! 🍖');    break;
    case 'play':  pet.play();  flashMessage('Wheee! 🎾');   break;
    case 'sleep': pet.sleep(); flashMessage(pet.isSleeping ? 'Zzz...' : 'Awake!'); break;
    case 'stats':
      flashMessage(`🍖${pet.hunger} 💛${pet.happiness} ⚡${pet.energy}`);
      break;
  }
});

// Live settings updates
window.electronAPI.onSettingsUpdated((settings) => {
  applySettings(settings);
  pet.name = settings.name;
  updateUI();
});

// --- Dragging ---

let isDragging = false;
let dragStartX, dragStartY;

document.getElementById('pet-container').addEventListener('mousedown', (e) => {
  if (e.target.tagName === 'BUTTON') return;
  isDragging = true;
  dragStartX = e.screenX;
  dragStartY = e.screenY;
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const dx = e.screenX - dragStartX;
  const dy = e.screenY - dragStartY;
  dragStartX = e.screenX;
  dragStartY = e.screenY;
  window.electronAPI.moveWindow(dx, dy);
});

window.addEventListener('mouseup', () => {
  isDragging = false;
});

// --- Start ---

async function init() {
  let settings;
  try {
    settings = await window.electronAPI.getSettings();
  } catch (err) {
    console.error('[renderer] failed to load settings:', err);
    settings = globalThis.validateSettings({});
  }
  applySettings(settings);
  pet.name = settings.name;
  updateUI();
  pet.startLife(updateUI);
}

window.addEventListener('DOMContentLoaded', init);
