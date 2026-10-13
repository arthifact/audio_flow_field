const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function bandEnergy(spectrum, lowHz, highHz, sampleRate) {
  const bin = (hz) =>
    clamp(
      Math.round((hz / (sampleRate / 2)) * spectrum.length),
      0,
      spectrum.length - 1,
    );
  const first = bin(lowHz),
    last = bin(highHz);
  let sum = 0;
  for (let i = first; i <= last; i++) sum += spectrum[i];
  return sum / (last - first + 1);
}

// Lift quiet recordings for analysis only; playback volume stays unchanged.
export class AudioResponse {
  constructor() {
    this.reference = 0;
    this.gainDb = 0;
    this.spectrum = new Float32Array(1024);
  }

  update(decibels, rms, sampleRate, dt, minDb = -100, maxDb = -30) {
    this.reference = Math.max(rms, this.reference * Math.exp(-dt / 0.9));
    const active = rms > Math.max(0.00001, this.reference * 0.007);
    const gain = Math.min(
      1000,
      Math.max(1, 0.08 / Math.max(this.reference, 0.00001)),
    );
    const targetDb = active ? 20 * Math.log10(gain) : this.gainDb;
    // Reduce gain quickly on loud arrivals, release it gently into quiet passages.
    const seconds = targetDb < this.gainDb ? 0.03 : 0.18;
    this.gainDb = targetDb + (this.gainDb - targetDb) * Math.exp(-dt / seconds);
    if (this.spectrum.length !== decibels.length)
      this.spectrum = new Float32Array(decibels.length);
    let peak = 0;
    for (let i = 0; i < decibels.length; i++) {
      this.spectrum[i] =
        active && Number.isFinite(decibels[i])
          ? clamp(
              ((decibels[i] + this.gainDb - minDb) / (maxDb - minDb)) * 255,
              0,
              255,
            )
          : 0;
      if (i > 0) peak = Math.max(peak, this.spectrum[i]);
    }
    return {
      // Bass keeps its original response; higher tones get a small motion floor.
      energy: Math.max(
        bandEnergy(this.spectrum, 1, 250, sampleRate),
        peak * 0.25,
      ),
      bass: bandEnergy(this.spectrum, 20, 140, sampleRate),
      mid: bandEnergy(this.spectrum, 400, 2600, sampleRate),
      treble: bandEnergy(this.spectrum, 5200, 14000, sampleRate),
      level: active ? clamp(rms * 10 ** (this.gainDb / 20), 0, 1) : 0,
    };
  }
}
