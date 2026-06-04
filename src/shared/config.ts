export const CONFIG = {
  WINDOW: {
    width: 200,
    height: 250,
    marginRight: 250,
    marginBottom: 280,
  },
  DECAY_INTERVAL_MS: 30_000,
  DECAY_RATES: {
    hunger: 3,
    happiness: 2,
    energy: 1,
    sleepingEnergyGain: 5,
    sleepingHungerLoss: 1,
  },
  ACTION_EFFECTS: {
    feed: { hunger: 25, happiness: 5 },
    play: { happiness: 20, energy: -10, hunger: -5 },
    // sleep is a toggle, no numeric effects on action
  },
  NOTIFICATION_COOLDOWN_MS: 60_000,
  THRESHOLDS: {
    notifyAt: 15,
    stickyRevealAt: 15,
    critical: 20,
  },
  MOOD_THRESHOLDS: {
    hungry: 20,
    sad: 20,
    happyHappiness: 60,
    happyHunger: 40,
  },
  INITIAL_STATS: {
    hunger: 80,
    happiness: 80,
    energy: 80,
  },
  ANIMATION: {
    frameMs: 300,
    feedFrames: ['🤤', '😋', '😊'],
    playFrames: ['😄', '🎾', '😆'],
    sleepFrames: ['😴', '💤'],
    petFrames: ['🥰', '💖', '✨'],
  },
  DRAG: {
    maxFps: 60,
  },
} as const
