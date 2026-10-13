/*****************************************
 *           Global Constants            *
 *****************************************/
const NOISE_INCREMENT = 0.01;  // Increment for Perlin noise sampling
const CELL_SIZE = 20;          // Scale for the grid

// Bass burst tuning
const BURST_THRESHOLD = 210;   // Bass energy (0-255) above which a burst fires
const BURST_COOLDOWN = 18;     // Min frames between bursts (prevents spam on sustained bass)
const BURST_STRENGTH = 4.5;    // Peak outward acceleration
const BURST_DECAY = 0.88;      // Per-frame multiplier (higher = lingers longer)
const BURST_RADIUS = 600;      // How far from center the burst reaches

/*****************************************
 *           Global Variables            *
 *****************************************/
let rows, cols;
let flowField;
let zOffset = 10;

// Particle system variables
const BASE_PARTICLE_NUM = 2000;
const MAX_PARTICLE_NUM = 5000;
let particles = [];

// Audio analysis variables
let sound = null, fft, amp;
let isLoaded = false;
let isPlaying = false;
let filename = '';

// Fixed influence values
const BASS_INFLUENCE = 1.0;
const TREBLE_INFLUENCE = 1.0;
const MID_INFLUENCE = 1.0;
const SENSITIVITY_SCALE = 0.7;

// Target color for particle color transitions
let targetColor;

// User-selected particle color (default: red)
let userColor;

// Bass burst state
let burstEnergy = 0;           // Current intensity (decays each frame)
let burstCooldown = 0;         // Frames remaining before another burst can fire
let prevBassEnergy = 0;        // For detecting sudden spikes

// UI elements
let fileInput, uploadBtn, playBtn, colorPicker;

/*****************************************
 *           Particle Class              *
 *****************************************/
class Particle {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = createVector(0, 0);
    this.acc = createVector(0, 0);
    this.prevPos = this.pos.copy();
    this.speed = 0;
    this.col = color(255);
  }

  show() {
    const audioLevel = amp ? amp.getLevel() : 0;
    const thickness = map(this.speed * audioLevel, 0, 5, 2, 4);
    strokeWeight(thickness);
    stroke(this.col);
    line(this.prevPos.x, this.prevPos.y, this.pos.x, this.pos.y);
  }

  update(maxSpeed, energy) {
    // Wrap-around canvas edges
    if (this.pos.x > width) this.pos.x = 0;
    if (this.pos.x < 0) this.pos.x = width;
    if (this.pos.y > height) this.pos.y = 0;
    if (this.pos.y < 0) this.pos.y = height;

    this.prevPos = this.pos.copy();
    this.vel.add(this.acc);
    this.vel.limit(maxSpeed);
    this.pos.add(this.vel);
    this.acc.set(0, 0);

    const newSpeed = this.vel.mag();
    if (abs(newSpeed - this.speed) > 0.5) {
      targetColor = getColorFromEnergy(energy);
    }
    this.speed = newSpeed;

    const dynamicTransitionSpeed = map(energy, 0, 255, 0.01, 0.1);
    this.col = lerpColor(this.col, targetColor, dynamicTransitionSpeed);
  }

  follow(field, cellSize, cols) {
    const x = floor(this.pos.x / cellSize);
    const y = floor(this.pos.y / cellSize);
    if (x >= 0 && x < cols && y >= 0 && y < rows) {
      const index = x + y * cols;
      const force = field[index];
      if (force) this.applyForce(force);
    }

    // Bass burst: radial impulse from screen center, falls off with distance
    if (burstEnergy > 0.01) {
      const dx = this.pos.x - width * 0.5;
      const dy = this.pos.y - height * 0.5;
      const dist = sqrt(dx * dx + dy * dy);
      if (dist > 1 && dist < BURST_RADIUS) {
        // Falloff: strongest near center, zero at BURST_RADIUS
        const falloff = 1 - (dist / BURST_RADIUS);
        const mag = burstEnergy * falloff;
        this.applyForce(createVector((dx / dist) * mag, (dy / dist) * mag));
      }
    }
  }

  applyForce(force) {
    this.acc.add(force);
  }
}

/*****************************************
 *            Setup Function             *
 *****************************************/
function setup() {
  createCanvas(windowWidth, windowHeight);
  updateGrid();

  fft = new p5.FFT();
  amp = new p5.Amplitude();

  for (let i = 0; i < BASE_PARTICLE_NUM; i++) {
    particles.push(new Particle());
  }

  userColor = color(255, 40, 40);
  targetColor = userColor;

  buildUI();
}

/*****************************************
 *               UI Setup                *
 *****************************************/
function buildUI() {
  fileInput = createFileInput(handleFileUpload);
  fileInput.hide();

  uploadBtn = createButton('\u2b06 Load MP3');
  styleButton(uploadBtn, '88px', '#5ae6f5', '#1b3c48');
  uploadBtn.mousePressed(() => fileInput.elt.click());

  playBtn = createButton('\u25b6 Play');
  styleButton(playBtn, '54px', '#a3f5b8', '#1b3a28');
  playBtn.attribute('disabled', '');
  playBtn.mousePressed(togglePlay);

  colorPicker = createColorPicker('#ff2828');
  styleColorPicker(colorPicker, '20px');
  colorPicker.input(() => {
    userColor = colorPicker.color();
  });
}

function styleButton(btn, bottom, textColor, borderColor) {
  btn.style('position', 'fixed');
  btn.style('bottom', bottom);
  btn.style('right', '20px');
  btn.style('padding', '8px 16px');
  btn.style('background', '#05070a');
  btn.style('color', textColor);
  btn.style('border', '1px solid ' + borderColor);
  btn.style('border-radius', '4px');
  btn.style('font-family', 'monospace');
  btn.style('font-size', '12px');
  btn.style('cursor', 'pointer');
  btn.style('z-index', '999');
}

function styleColorPicker(picker, bottom) {
  picker.style('position', 'fixed');
  picker.style('bottom', bottom);
  picker.style('right', '20px');
  picker.style('width', '28px');
  picker.style('height', '28px');
  picker.style('border', '1px solid #4a1b1b');
  picker.style('border-radius', '4px');
  picker.style('cursor', 'pointer');
  picker.style('z-index', '999');
  picker.style('padding', '0');
  picker.style('background', '#05070a');
}

/*****************************************
 *          File Upload Handler          *
 *****************************************/
function handleFileUpload(file) {
  if (file.type !== 'audio') {
    alert('Please upload an audio file.');
    return;
  }

  if (sound && sound.isLoaded()) {
    sound.stop();
    sound.disconnect();
  }

  isLoaded = false;
  isPlaying = false;
  filename = file.name.replace(/\.[^.]+$/, '');

  uploadBtn.html('\u23f3 Loading\u2026');
  playBtn.attribute('disabled', '');
  playBtn.html('\u25b6 Play');

  sound = loadSound(file.data, () => {
    fft.setInput(sound);
    amp.setInput(sound);
    isLoaded = true;
    uploadBtn.html('\u2b06 Load MP3');
    playBtn.removeAttribute('disabled');
  });
}

/*****************************************
 *           Play / Pause Toggle         *
 *****************************************/
function togglePlay() {
  if (!isLoaded || !sound) return;
  if (isPlaying) {
    sound.pause();
    isPlaying = false;
    playBtn.html('\u25b6 Play');
  } else {
    sound.loop();
    isPlaying = true;
    playBtn.html('\u23f8 Pause');
  }
}

/*****************************************
 *             Draw Function             *
 *****************************************/
function draw() {
  background(0, 20);

  let energy = 0;
  let amplitude = 0;
  let bassEnergy = 0, trebleEnergy = 0, midEnergy = 0;

  if (isLoaded && isPlaying) {
    fft.analyze();
    energy = fft.getEnergy(1, 250);
    amplitude = amp.getLevel();
    bassEnergy = fft.getEnergy('bass');
    trebleEnergy = fft.getEnergy('treble');
    midEnergy = fft.getEnergy('mid');
  }

  /********** Bass Burst Detection **********/
  // Fire a burst when bass spikes above threshold AND is a real rise (not sustained).
  // The rise check (bassEnergy - prevBassEnergy) is what distinguishes a kick
  // from steady bass humming — we want the *transient*, not the level.
  const bassRise = bassEnergy - prevBassEnergy;
  if (burstCooldown > 0) burstCooldown--;
  if (bassEnergy > BURST_THRESHOLD && bassRise > 25 && burstCooldown === 0) {
    burstEnergy = BURST_STRENGTH;
    burstCooldown = BURST_COOLDOWN;
  }
  burstEnergy *= BURST_DECAY;  // Smooth exponential falloff every frame
  prevBassEnergy = bassEnergy;

  /********** Generate Flow Field **********/
  const forceMagnitude = map(energy, 0, 255, 0.5, 5);

  let yOffset = 0;
  for (let y = 0; y < rows; y++) {
    let xOffset = 0;
    for (let x = 0; x < cols; x++) {
      const index = x + y * cols;

      const baseAngle = noise(xOffset, yOffset, zOffset) * TWO_PI;
      const noiseForce = p5.Vector.fromAngle(baseAngle);
      noiseForce.setMag(forceMagnitude);

      const verticalComponent =
        ((trebleEnergy * TREBLE_INFLUENCE) - (bassEnergy * BASS_INFLUENCE)) / 255;
      const verticalForce = createVector(0, verticalComponent * forceMagnitude);

      const horizontalComponent = (midEnergy * MID_INFLUENCE) / 255;
      const horizontalForce = createVector(horizontalComponent * forceMagnitude, 0);

      const combinedForce = p5.Vector.add(noiseForce, verticalForce);
      combinedForce.add(horizontalForce);
      flowField[index] = combinedForce;

      xOffset += NOISE_INCREMENT;
    }
    yOffset += NOISE_INCREMENT;
  }

  zOffset += map(bassEnergy, 0, 255, 0.0001, 0.01);

  /********** Dynamically Adjust Particle Count **********/
  const targetParticleCount = int(
    map(amplitude, 0, 1, BASE_PARTICLE_NUM, MAX_PARTICLE_NUM) * SENSITIVITY_SCALE
  );
  if (particles.length < targetParticleCount) {
    for (let i = particles.length; i < targetParticleCount; i++) {
      particles.push(new Particle());
    }
  } else {
    particles.length = targetParticleCount;
  }

  /********** Update and Display Particles **********/
  const maxSpeed = map(energy, 0, 255, 0.1, 8);
  for (let i = 0; i < particles.length; i++) {
    particles[i].follow(flowField, CELL_SIZE, cols);
    particles[i].update(maxSpeed, energy);
    particles[i].show();
  }

  drawHUD();
}

/*****************************************
 *              HUD / Hints              *
 *****************************************/
function drawHUD() {
  noStroke();
  textFont('monospace');
  textSize(10);
  textAlign(LEFT);

  if (!isLoaded) {
    fill(0, 180, 200);
    text('upload an MP3 to begin', 22, height - 88);
  } else if (!isPlaying) {
    fill(120, 200, 120);
    text('\u25b6 press Play to start', 22, height - 88);
  } else {
    fill(120, 140, 120);
    text('[space] play/pause', 22, height - 88);
  }

  if (filename) {
    fill(100, 100, 100);
    textSize(9);
    text(filename.toUpperCase(), 22, height - 76);
  }
}

/*****************************************
 *         Keyboard Shortcut             *
 *****************************************/
function keyPressed() {
  if (key === ' ') {
    togglePlay();
    return false;
  }
}

/*****************************************
 *       Grid Update & Window Resize     *
 *****************************************/
function updateGrid() {
  cols = floor(windowWidth / CELL_SIZE);
  rows = floor(windowHeight / CELL_SIZE);
  flowField = new Array(cols * rows);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  updateGrid();
}

/*****************************************
 *         Color Mapping Function        *
 *****************************************/
function getColorFromEnergy(energy) {
  const t = map(energy, 0, 255, 0, 1);
  const r = red(userColor);
  const g = green(userColor);
  const b = blue(userColor);
  const dark = color(r * 0.24, g * 0.24, b * 0.24);
  return lerpColor(dark, userColor, t);
}