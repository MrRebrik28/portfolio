/**
 * Sound FX Synthesizer using native Web Audio API
 * Provides high-end micro-feedback sounds for interactions (clicks, hovers, modal pop)
 */

class SoundEffects {
  constructor() {
    this.audioCtx = null;
    this.enabled = localStorage.getItem('yarovenko_sfx') !== 'disabled';
    this.updateToggleUI();
  }

  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    localStorage.setItem('yarovenko_sfx', this.enabled ? 'enabled' : 'disabled');
    this.updateToggleUI();
    if (this.enabled) {
      this.playTone(880, 'sine', 0.08, 0.05);
    }
  }

  updateToggleUI() {
    const btn = document.getElementById('sfx-toggle');
    if (!btn) return;
    const textSpan = btn.querySelector('.sfx-state');
    if (textSpan) {
      textSpan.textContent = this.enabled ? 'ЗВУК ВКЛ' : 'ЗВУК ВЫКЛ';
    }
    btn.setAttribute('aria-pressed', this.enabled ? 'true' : 'false');
    btn.classList.toggle('active', this.enabled);
  }

  playTone(freq, type = 'sine', duration = 0.05, volume = 0.04) {
    if (!this.enabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      // Audio autoplay policy catch
    }
  }

  // Interaction sounds
  hover() {
    this.playTone(520, 'sine', 0.03, 0.02);
  }

  click() {
    this.playTone(740, 'triangle', 0.06, 0.05);
  }

  modalOpen() {
    if (!this.enabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(680, this.audioCtx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.05, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.14);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.14);
    } catch (e) {}
  }

  modalClose() {
    if (!this.enabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(280, this.audioCtx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.04, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.12);
    } catch (e) {}
  }

  success() {
    this.playTone(880, 'sine', 0.06, 0.04);
    setTimeout(() => this.playTone(1320, 'sine', 0.1, 0.04), 70);
  }
}

window.sfx = new SoundEffects();
