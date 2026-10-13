import { AudioPlayer } from './audio.js';
import { AudioResponse } from './analysis.js';
import { createField, updateField, Particle } from './flow.js';
import { buildUI } from './ui.js';

const SILENCE = { energy: 0, bass: 0, mid: 0, treble: 0, level: 0 };

let fft, amplitude, player, ui, field;
let particles, response;
let zOffset, heading;
let burst, cooldown, previousBass;
let userColor, targetColor;

function setup() {
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent('visualizer');
  canvas.elt.setAttribute('aria-label', 'Audio-reactive particle flow field');
  frameRate(60);
  fft = new p5.FFT();
  amplitude = new p5.Amplitude();
  userColor = color('#ff2828');
  field = createField(width, height);
  resetScene();
  player = new AudioPlayer({
    fft,
    amplitude,
    onChange: () => ui?.update(),
    onReset: resetScene,
  });
  ui = buildUI({ player, clear: resetScene, toggleFullscreen });
  document
    .querySelector('#particle-color')
    .addEventListener('input', (event) => {
      userColor = color(event.target.value);
      targetColor = userColor;
    });
  ui.update();
}

function addParticle() {
  const particle = new Particle(width, height, random);
  particle.col = color(255);
  particles.push(particle);
}

function resetScene() {
  particles = [];
  for (let i = 0; i < field.baseCount; i++) addParticle();
  response = new AudioResponse();
  zOffset = 10;
  heading = 0;
  burst = cooldown = previousBass = 0;
  targetColor = userColor;
  background(0);
}

function draw() {
  const dt = Math.min(Math.max(deltaTime / 1000, 0), 0.05);
  const step = dt * 60;
  background(0, 255 * (1 - (1 - 20 / 255) ** step));
  const levels = player.isPlaying
    ? response.update(
        fft.analyze('dB'),
        amplitude.getLevel(),
        getAudioContext().sampleRate,
        dt,
        fft.analyser.minDecibels,
        fft.analyser.maxDecibels,
      )
    : SILENCE;

  cooldown = Math.max(0, cooldown - step);
  if (levels.bass > 210 && levels.bass - previousBass > 25 && cooldown === 0) {
    burst = 4.5;
    cooldown = 18;
  }
  burst *= 0.88 ** step;
  previousBass = levels.bass;

  // Slow, continuous steering keeps the familiar flow from favoring a diagonal.
  heading += dt * (0.12 + (levels.energy / 255) * 0.1);
  updateField(field, zOffset, levels, noise, heading);
  zOffset += (0.0001 + (levels.bass / 255) * 0.0099) * step;
  const count = Math.floor(
    field.baseCount + levels.level * (field.maxCount - field.baseCount),
  );
  while (particles.length < count) addParticle();
  particles.length = count;

  const maxSpeed = (0.1 + (levels.energy / 255) * 7.9) * field.scale;
  const energyColor = lerpColor(
    color(
      red(userColor) * 0.24,
      green(userColor) * 0.24,
      blue(userColor) * 0.24,
    ),
    userColor,
    levels.energy / 255,
  );
  const transition = 1 - (1 - (0.01 + (levels.energy / 255) * 0.09)) ** step;
  for (const particle of particles) {
    const previousSpeed = particle.speed;
    particle.move(field, width, height, maxSpeed, burst, step);
    if (Math.abs(particle.speed - previousSpeed) > 0.5 * field.scale)
      targetColor = energyColor;
    particle.col = lerpColor(particle.col, targetColor, transition);
    strokeWeight(
      (2 + (((particle.speed / field.scale) * levels.level) / 5) * 2) *
        field.scale,
    );
    stroke(particle.col);
    line(particle.prevX, particle.prevY, particle.x, particle.y);
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    player.error = 'Fullscreen is unavailable in this browser.';
    ui.update();
  }
}

function keyPressed(event) {
  if (event.target.closest('input, textarea, select, [contenteditable]'))
    return;
  if (event.code === 'Space') {
    if (event.target.closest('button, summary, a')) return;
    player.togglePlay();
    return false;
  }
  if (event.key.toLowerCase() === 'c') resetScene();
  if (event.key.toLowerCase() === 'f') toggleFullscreen();
}

function windowResized() {
  const oldWidth = width,
    oldHeight = height,
    oldScale = field.scale;
  // Resize geometry before the next draw; p5 otherwise redraws immediately.
  resizeCanvas(windowWidth, windowHeight, true);
  field = createField(width, height);
  for (const particle of particles)
    particle.resize(oldWidth, oldHeight, width, height, field.scale / oldScale);
}

// p5 global mode discovers its callbacks on window.
Object.assign(window, { setup, draw, keyPressed, windowResized });
