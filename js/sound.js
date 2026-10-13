'use strict';
/* ============================================================================
   SOUND — every effect and the island music are synthesized with the Web Audio
   API (no audio files to download). Browsers only allow sound after the first
   tap, so the engine starts on the first user interaction.
   ========================================================================== */
const Sound = {
  ctx: null,
  master: null,
  musicGain: null,
  sfxOn: true,
  musicOn: true,
  musicTimer: null,
  nextNoteTime: 0,
  step: 0,

  load() {
    try {
      this.sfxOn = localStorage.getItem('pim_sfx') !== '0';
      this.musicOn = localStorage.getItem('pim_music') !== '0';
    } catch (e) {}
  },
  savePrefs() {
    try { localStorage.setItem('pim_sfx', this.sfxOn ? '1' : '0'); localStorage.setItem('pim_music', this.musicOn ? '1' : '0'); } catch (e) {}
  },

  /** Create / resume the audio engine (must happen inside a user gesture) */
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.0; this.musicGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  },

  /** First tap anywhere: start audio + music */
  unlock() {
    if (!this.ensure()) return;
    if (this.musicOn) this.startMusic();
  },

  /* ---------- building blocks ---------- */
  tone(freq, dur, { type = 'sine', vol = 0.2, delay = 0, slide = null, attack = 0.005, out = null } = {}) {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, { vol = 0.2, delay = 0, freq = 1200, q = 0.8, type = 'bandpass' } = {}) {
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },
  arp(notes, step, opts = {}) { notes.forEach((n, i) => this.tone(n, opts.dur || 0.18, { ...opts, delay: (opts.delay || 0) + i * step })); },

  /* ---------- sound effects ---------- */
  play(name) {
    if (!this.sfxOn || !this.ensure()) return;
    switch (name) {
      case 'tap':      this.tone(660, 0.05, { type: 'triangle', vol: 0.08 }); break;
      case 'tick':     this.tone(1400 + Math.random() * 300, 0.025, { type: 'square', vol: 0.025 }); break;
      case 'reelStop': this.tone(180, 0.12, { type: 'sine', vol: 0.25, slide: 90 }); this.noise(0.05, { vol: 0.08, freq: 800 }); break;
      case 'coin':     this.tone(988, 0.08, { type: 'square', vol: 0.07 }); this.tone(1319, 0.22, { type: 'square', vol: 0.07, delay: 0.07 }); break;
      case 'bigwin':   this.arp([523, 659, 784, 1047], 0.08, { type: 'triangle', vol: 0.16, dur: 0.22 }); this.play('coin'); break;
      case 'jackpot':
        this.arp([523, 659, 784, 1047, 784, 1047, 1319], 0.09, { type: 'square', vol: 0.08, dur: 0.2 });
        this.arp([262, 330, 392, 523], 0.18, { type: 'triangle', vol: 0.14, dur: 0.4 });
        for (let i = 0; i < 6; i++) this.tone(1800 + i * 220, 0.08, { type: 'sine', vol: 0.05, delay: 0.7 + i * 0.06 });
        break;
      case 'energy':   this.tone(300, 0.35, { type: 'sine', vol: 0.18, slide: 1400 }); this.tone(600, 0.3, { type: 'triangle', vol: 0.06, slide: 2000, delay: 0.05 }); break;
      case 'raid':
        this.noise(0.35, { vol: 0.35, freq: 600, q: 0.5, type: 'lowpass' });
        this.tone(110, 0.4, { type: 'sawtooth', vol: 0.12, slide: 55 });
        this.tone(220, 0.15, { type: 'square', vol: 0.06, delay: 0.25 });
        break;
      case 'steal':    for (let i = 0; i < 5; i++) this.tone(900 + i * 140, 0.08, { type: 'square', vol: 0.05, delay: i * 0.06 }); break;
      case 'shield':
        this.tone(880, 0.5, { type: 'square', vol: 0.06 }); this.tone(1320, 0.4, { type: 'triangle', vol: 0.08 });
        this.tone(660, 0.6, { type: 'sine', vol: 0.12, delay: 0.02 });
        break;
      case 'blocked':  this.noise(0.12, { vol: 0.25, freq: 2500 }); this.tone(520, 0.45, { type: 'square', vol: 0.07 }); this.tone(390, 0.5, { type: 'triangle', vol: 0.1 }); break;
      case 'crack':    this.noise(0.06, { vol: 0.3, freq: 3000 }); this.noise(0.06, { vol: 0.25, freq: 2400, delay: 0.25 }); this.noise(0.08, { vol: 0.3, freq: 2000, delay: 0.55 }); break;
      case 'hatch':    this.tone(500, 0.15, { type: 'triangle', vol: 0.15, slide: 1000 }); this.arp([1047, 1319, 1568], 0.06, { type: 'sine', vol: 0.08, dur: 0.15, delay: 0.12 }); break;
      case 'empty':    this.tone(392, 0.25, { type: 'triangle', vol: 0.12, slide: 260 }); this.tone(262, 0.35, { type: 'triangle', vol: 0.1, delay: 0.22, slide: 196 }); break;
      case 'merge':    this.arp([784, 988, 1175, 1568, 1976], 0.05, { type: 'sine', vol: 0.1, dur: 0.18 }); this.tone(392, 0.4, { type: 'triangle', vol: 0.1 }); break;
      case 'build':
        for (let i = 0; i < 3; i++) { this.noise(0.05, { vol: 0.35, freq: 900, delay: i * 0.13 }); this.tone(160, 0.06, { type: 'square', vol: 0.06, delay: i * 0.13 }); }
        this.arp([659, 880], 0.08, { type: 'triangle', vol: 0.12, dur: 0.25, delay: 0.42 });
        break;
      case 'gift':     this.arp([1047, 1319], 0.1, { type: 'sine', vol: 0.12, dur: 0.3 }); break;
      case 'new':      this.arp([880, 1175], 0.07, { type: 'triangle', vol: 0.1, dur: 0.18 }); break;
      case 'error':    this.tone(150, 0.18, { type: 'square', vol: 0.06 }); this.tone(120, 0.2, { type: 'square', vol: 0.05, delay: 0.1 }); break;
      case 'pet':      this.tone(700 + Math.random() * 400, 0.12, { type: 'sine', vol: 0.1, slide: 1200 + Math.random() * 400 }); break;
    }
  },

  /* ---------- island music: a gentle tropical loop ---------- */
  // 16-step patterns (MIDI numbers, 0 = rest) — C major pentatonic, 96 bpm
  MELODY: [72, 0, 76, 79, 0, 76, 74, 0, 72, 0, 69, 72, 0, 74, 76, 0,
           79, 0, 81, 79, 0, 76, 74, 0, 76, 0, 74, 72, 0, 69, 72, 0],
  BASS:   [48, 0, 0, 0, 55, 0, 0, 0, 45, 0, 0, 0, 52, 0, 0, 0,
           41, 0, 0, 0, 48, 0, 0, 0, 43, 0, 0, 0, 50, 0, 0, 0],
  midi(n) { return 440 * Math.pow(2, (n - 69) / 12); },

  startMusic() {
    if (!this.ensure() || this.musicTimer) return;
    this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicGain.gain.setTargetAtTime(0.35, this.ctx.currentTime, 0.8);
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    const stepDur = 60 / 96 / 2;   // eighth notes
    this.musicTimer = setInterval(() => {
      while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
        const i = this.step % this.MELODY.length;
        const delay = Math.max(0, this.nextNoteTime - this.ctx.currentTime);
        const m = this.MELODY[i], b = this.BASS[i];
        if (m) this.tone(this.midi(m), 0.32, { type: 'triangle', vol: 0.09, delay, out: this.musicGain });
        if (b) this.tone(this.midi(b), 0.6, { type: 'sine', vol: 0.16, delay, out: this.musicGain });
        if (i % 4 === 2) this.tone(this.midi(m || 76) * 2, 0.05, { type: 'sine', vol: 0.02, delay, out: this.musicGain }); // shaker-ish sparkle
        this.nextNoteTime += stepDur;
        this.step++;
      }
    }, 60);
  },
  stopMusic() {
    clearInterval(this.musicTimer); this.musicTimer = null;
    if (this.ctx) this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  },

  toggleSfx() { this.sfxOn = !this.sfxOn; this.savePrefs(); if (this.sfxOn) this.play('tap'); },
  toggleMusic() { this.musicOn = !this.musicOn; this.savePrefs(); this.ensure(); if (this.musicOn) this.startMusic(); else this.stopMusic(); },
};
Sound.load();
