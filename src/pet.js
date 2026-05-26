/**
 * Pet state machine and game logic.
 */

const MOODS = {
  HAPPY: 'happy',
  IDLE: 'idle',
  SAD: 'sad',
  HUNGRY: 'hungry',
  SLEEPING: 'sleeping',
  DEAD: 'dead',
};

const SPRITES = {
  [MOODS.HAPPY]:    '(＾▽＾)',
  [MOODS.IDLE]:     '(・ω・)',
  [MOODS.SAD]:      '(╥﹏╥)',
  [MOODS.HUNGRY]:   '(；⌣̀_⌣́)',
  [MOODS.SLEEPING]: '(－ω－) zzZ',
  [MOODS.DEAD]:     '(✖╭╮✖)',
};

class Pet {
  constructor() {
    this.name = 'Pixel';
    this.hunger = 80;    // 0 = starving, 100 = full
    this.happiness = 80; // 0 = miserable, 100 = ecstatic
    this.energy = 80;    // 0 = exhausted, 100 = fully rested
    this.alive = true;
    this.isSleeping = false;
    this._decayInterval = null;
    this._lastNotify = {};
  }

  get mood() {
    if (!this.alive) return MOODS.DEAD;
    if (this.isSleeping) return MOODS.SLEEPING;
    if (this.hunger < 20) return MOODS.HUNGRY;
    if (this.happiness < 20) return MOODS.SAD;
    if (this.happiness > 60 && this.hunger > 40) return MOODS.HAPPY;
    return MOODS.IDLE;
  }

  get sprite() {
    return SPRITES[this.mood];
  }

  /** Start the decay timer (call once on init). */
  startLife(onUpdate) {
    this._onUpdate = onUpdate;

    // Decay stats every 30 seconds
    this._decayInterval = setInterval(() => {
      if (!this.alive) return;

      if (this.isSleeping) {
        this.energy = Math.min(100, this.energy + 5);
        this.hunger = Math.max(0, this.hunger - 1);
        if (this.energy >= 100) {
          this.isSleeping = false;
          this._triggerNotify('Good morning!', `${this.name} woke up fully rested!`);
        }
      } else {
        this.hunger = Math.max(0, this.hunger - 3);
        this.happiness = Math.max(0, this.happiness - 2);
        this.energy = Math.max(0, this.energy - 1);
      }

      // Notifications at thresholds
      if (this.hunger < 15 && this.hunger > 0) {
        this._triggerNotify('I\'m hungry!', `${this.name} needs food!`);
      }
      if (this.happiness < 15 && this.happiness > 0) {
        this._triggerNotify('I\'m lonely...', `${this.name} wants to play!`);
      }

      // Death condition
      if (this.hunger <= 0 && this.happiness <= 0 && this.energy <= 0) {
        this.alive = false;
        this._triggerNotify('Oh no...', `${this.name} has passed away. 💔`);
      }

      this._onUpdate?.();
    }, 30_000);

    this._onUpdate?.();
  }

  feed() {
    if (!this.alive || this.isSleeping) return;
    this.hunger = Math.min(100, this.hunger + 25);
    this.happiness = Math.min(100, this.happiness + 5);
    this._onUpdate?.();
  }

  play() {
    if (!this.alive || this.isSleeping) return;
    this.happiness = Math.min(100, this.happiness + 20);
    this.energy = Math.max(0, this.energy - 10);
    this.hunger = Math.max(0, this.hunger - 5);
    this._onUpdate?.();
  }

  sleep() {
    if (!this.alive) return;
    this.isSleeping = !this.isSleeping;
    this._onUpdate?.();
  }

  reset() {
    this.hunger = 80;
    this.happiness = 80;
    this.energy = 80;
    this.alive = true;
    this.isSleeping = false;
    this._onUpdate?.();
  }

  _triggerNotify(title, body) {
    const key = title;
    const now = Date.now();
    if (this._lastNotify[key] && now - this._lastNotify[key] < 60_000) return;
    this._lastNotify[key] = now;
    window.electronAPI?.notify(title, body);
  }
}
