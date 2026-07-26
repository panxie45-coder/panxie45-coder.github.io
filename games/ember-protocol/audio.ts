export type AudioScene = "menu" | "game" | "pause";
export type SoundCue =
  | "ui"
  | "start"
  | "shot"
  | "ally-shot"
  | "hit"
  | "kill"
  | "hurt"
  | "pickup"
  | "level"
  | "upgrade"
  | "skill"
  | "ultimate"
  | "connected"
  | "game-over";

type AudioSettings = {
  enabled: boolean;
  musicVolume: number;
  sfxVolume: number;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const note = (root: number, semitones: number) => root * 2 ** (semitones / 12);

export class EmberAudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private scheduler: number | null = null;
  private nextNoteTime = 0;
  private musicStep = 0;
  private scene: AudioScene = "menu";
  private enabled: boolean;
  private musicVolume: number;
  private sfxVolume: number;
  private lastCue = new Map<SoundCue, number>();

  constructor(settings: AudioSettings) {
    this.enabled = settings.enabled;
    this.musicVolume = clamp01(settings.musicVolume);
    this.sfxVolume = clamp01(settings.sfxVolume);
  }

  async unlock() {
    if (!this.context) this.createGraph();
    if (this.context?.state === "suspended") await this.context.resume();
    this.applyVolumes();
    this.startMusic();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.applyVolumes();
    if (enabled) void this.unlock();
  }

  setMusicVolume(volume: number) {
    this.musicVolume = clamp01(volume);
    this.applyVolumes();
  }

  setSfxVolume(volume: number) {
    this.sfxVolume = clamp01(volume);
    this.applyVolumes();
  }

  setScene(scene: AudioScene) {
    this.scene = scene;
    this.applyVolumes();
  }

  play(cue: SoundCue) {
    const ctx = this.context;
    if (!ctx || !this.enabled || ctx.state !== "running") return;

    const nowMs = performance.now();
    const cooldowns: Partial<Record<SoundCue, number>> = {
      shot: 75,
      "ally-shot": 90,
      hit: 42,
      kill: 70,
      hurt: 210,
      pickup: 65,
    };
    const cooldown = cooldowns[cue] ?? 0;
    if (nowMs - (this.lastCue.get(cue) ?? 0) < cooldown) return;
    this.lastCue.set(cue, nowMs);

    const now = ctx.currentTime;
    switch (cue) {
      case "ui":
        this.tone(520, now, 0.055, "sine", 0.055, 720);
        break;
      case "start":
        [0, 0.09, 0.18].forEach((delay, index) => {
          this.tone(note(164.81, [0, 3, 7][index]), now + delay, 0.32, "triangle", 0.08);
        });
        this.noise(now, 0.18, 0.035, 1200, "bandpass");
        break;
      case "shot":
        this.tone(410, now, 0.065, "square", 0.045, 125);
        this.noise(now, 0.045, 0.022, 2200, "highpass");
        break;
      case "ally-shot":
        this.tone(520, now, 0.06, "triangle", 0.032, 180);
        break;
      case "hit":
        this.tone(150, now, 0.075, "sine", 0.05, 78);
        this.noise(now, 0.055, 0.035, 760, "bandpass");
        break;
      case "kill":
        this.tone(92, now, 0.16, "sawtooth", 0.055, 46);
        this.noise(now, 0.11, 0.045, 420, "lowpass");
        break;
      case "hurt":
        this.tone(118, now, 0.19, "sawtooth", 0.075, 58);
        this.noise(now, 0.12, 0.05, 520, "lowpass");
        break;
      case "pickup":
        this.tone(740, now, 0.07, "sine", 0.035, 1040);
        break;
      case "level":
        [0, 0.085, 0.17, 0.255].forEach((delay, index) => {
          this.tone(note(220, [0, 3, 7, 12][index]), now + delay, 0.28, "triangle", 0.07);
        });
        break;
      case "upgrade":
        this.tone(330, now, 0.22, "sine", 0.06, 660);
        this.tone(495, now + 0.06, 0.25, "triangle", 0.045, 740);
        break;
      case "skill":
        this.tone(240, now, 0.24, "sawtooth", 0.06, 880);
        this.tone(720, now + 0.035, 0.18, "triangle", 0.045, 360);
        this.noise(now, 0.13, 0.035, 1800, "bandpass");
        break;
      case "ultimate":
        [0, .055, .11, .19].forEach((delay, index) => {
          this.tone(note(110, [0, 7, 12, 19][index]), now + delay, .45, index % 2 ? "triangle" : "sawtooth", .07);
        });
        this.noise(now + .08, .42, .055, 720, "lowpass");
        break;
      case "connected":
        this.tone(392, now, 0.2, "sine", 0.06, 523.25);
        this.tone(659.25, now + 0.12, 0.25, "triangle", 0.055);
        break;
      case "game-over":
        [0, 0.16, 0.32].forEach((delay, index) => {
          this.tone(note(164.81, [7, 3, 0][index]), now + delay, 0.5, "triangle", 0.075);
        });
        this.noise(now + 0.18, 0.5, 0.025, 280, "lowpass");
        break;
    }
  }

  destroy() {
    if (this.scheduler !== null) window.clearInterval(this.scheduler);
    this.scheduler = null;
    void this.context?.close();
    this.context = null;
  }

  private createGraph() {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    const music = ctx.createGain();
    const sfx = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();

    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.22;

    music.connect(master);
    sfx.connect(master);
    master.connect(compressor);
    compressor.connect(ctx.destination);

    this.context = ctx;
    this.masterGain = master;
    this.musicGain = music;
    this.sfxGain = sfx;
    this.nextNoteTime = ctx.currentTime + 0.08;
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.context || !this.masterGain || !this.musicGain || !this.sfxGain) return;
    const now = this.context.currentTime;
    const master = this.enabled ? 0.72 : 0.0001;
    const sceneScale = this.scene === "pause" ? 0.42 : this.scene === "menu" ? 0.62 : 1;
    this.masterGain.gain.setTargetAtTime(master, now, 0.025);
    this.musicGain.gain.setTargetAtTime(this.musicVolume * sceneScale, now, 0.08);
    this.sfxGain.gain.setTargetAtTime(this.sfxVolume, now, 0.025);
  }

  private startMusic() {
    if (this.scheduler !== null) return;
    this.scheduler = window.setInterval(() => this.scheduleMusic(), 45);
    this.scheduleMusic();
  }

  private scheduleMusic() {
    const ctx = this.context;
    if (!ctx || ctx.state !== "running") return;
    const tempo = this.scene === "game" ? 104 : this.scene === "pause" ? 62 : 76;
    const stepLength = 60 / tempo / 2;

    if (this.nextNoteTime < ctx.currentTime - 0.5) this.nextNoteTime = ctx.currentTime + 0.05;
    while (this.nextNoteTime < ctx.currentTime + 0.22) {
      this.scheduleMusicStep(this.musicStep, this.nextNoteTime, stepLength);
      this.nextNoteTime += stepLength;
      this.musicStep = (this.musicStep + 1) % 16;
    }
  }

  private scheduleMusicStep(step: number, time: number, length: number) {
    if (!this.context || !this.musicGain) return;
    const melody = [0, 3, 7, 10, 7, 3, 12, 10, 0, 3, 7, 14, 12, 7, 3, -2];
    const bass = [0, 0, -2, -2, -5, -5, -2, -2];
    const gameEnergy = this.scene === "game" ? 1 : 0.62;

    if (step % 2 === 0) {
      this.musicTone(note(55, bass[(step / 2) % bass.length]), time, length * 1.8, "triangle", 0.075 * gameEnergy, 280);
    }

    this.musicTone(note(110, melody[step]), time, length * 0.78, "sine", 0.028 * gameEnergy, 1050);
    if (step % 4 === 0) {
      this.musicTone(note(110, melody[step] - 12), time, length * 3.5, "sawtooth", 0.018, 420);
    }
    if (this.scene === "game" && step % 2 === 0) {
      this.musicNoise(time, 0.035, step % 4 === 0 ? 0.018 : 0.01);
    }
  }

  private tone(
    frequency: number,
    start: number,
    duration: number,
    type: OscillatorType,
    level: number,
    endFrequency = frequency,
  ) {
    const ctx = this.context;
    if (!ctx || !this.sfxGain) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + Math.min(0.012, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.sfxGain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private noise(start: number, duration: number, level: number, frequency: number, filterType: BiquadFilterType) {
    const ctx = this.context;
    if (!ctx || !this.sfxGain) return;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    source.start(start);
  }

  private musicTone(
    frequency: number,
    start: number,
    duration: number,
    type: OscillatorType,
    level: number,
    cutoff: number,
  ) {
    const ctx = this.context;
    if (!ctx || !this.musicGain) return;
    const oscillator = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.6;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + Math.min(0.06, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private musicNoise(start: number, duration: number, level: number) {
    const ctx = this.context;
    if (!ctx || !this.musicGain) return;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = buffer;
    filter.type = "highpass";
    filter.frequency.value = 4200;
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    source.start(start);
  }
}
