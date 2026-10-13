const mix = (a, b, t) => a + (b - a) * t;

export function createField(width, height) {
  const area = (width * height) / (1280 * 800);
  const scale = Math.min(1.6, Math.max(0.5, area ** 0.25));
  const cellSize = 20 * scale;
  // Include a border sample so interpolation also covers partial edge cells.
  const cols = Math.ceil(width / cellSize) + 1;
  const rows = Math.ceil(height / cellSize) + 1;
  const density = Math.min(2, Math.sqrt(area));
  const baseCount = Math.max(80, Math.round(1400 * density));
  return {
    cols,
    rows,
    cellSize,
    scale,
    baseCount,
    maxCount: Math.max(baseCount, Math.min(5000, Math.round(3500 * density))),
    x: new Float64Array(cols * rows),
    y: new Float64Array(cols * rows),
  };
}

export function updateField(
  field,
  z,
  { energy, bass, mid, treble },
  noise,
  heading = 0,
) {
  const magnitude = (0.5 + (energy / 255) * 4.5) * field.scale;
  const horizontal = (mid / 255) * magnitude;
  const vertical = ((treble - bass) / 255) * magnitude;
  const c = Math.cos(heading),
    s = Math.sin(heading);
  for (let y = 0; y < field.rows; y++) {
    for (let x = 0; x < field.cols; x++) {
      const i = x + y * field.cols;
      const angle = noise(x * 0.01, y * 0.01, z) * Math.PI * 2;
      const fx = Math.cos(angle) * magnitude + horizontal;
      const fy = Math.sin(angle) * magnitude + vertical;
      // Turn the audio forces with the field, avoiding a fixed screen-axis bias.
      field.x[i] = fx * c - fy * s;
      field.y[i] = fx * s + fy * c;
    }
  }
}

const wrap = (value, size) => ((value % size) + size) % size;

export class Particle {
  constructor(width, height, random) {
    this.x = random(width);
    this.y = random(height);
    this.prevX = this.x;
    this.prevY = this.y;
    this.vx = 0;
    this.vy = 0;
    this.speed = 0;
  }

  move(field, width, height, maxSpeed, burst, step) {
    this.prevX = this.x;
    this.prevY = this.y;
    const gx = this.x / field.cellSize,
      gy = this.y / field.cellSize;
    const x = Math.floor(gx),
      y = Math.floor(gy);
    const tx = gx - x,
      ty = gy - y;
    const i = x + y * field.cols,
      below = i + field.cols;
    // Blend neighboring directions so crossing a cell never snaps the force.
    let fx = mix(
      mix(field.x[i], field.x[i + 1], tx),
      mix(field.x[below], field.x[below + 1], tx),
      ty,
    );
    let fy = mix(
      mix(field.y[i], field.y[i + 1], tx),
      mix(field.y[below], field.y[below + 1], tx),
      ty,
    );
    if (burst > 0.01) {
      const dx = this.x - width / 2,
        dy = this.y - height / 2;
      const distance = Math.hypot(dx, dy);
      const radius = 600 * field.scale;
      if (distance > 1 && distance < radius) {
        const force =
          (burst * field.scale * (1 - distance / radius)) / distance;
        fx += dx * force;
        fy += dy * force;
      }
    }
    this.vx += fx * step;
    this.vy += fy * step;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > maxSpeed) {
      this.vx *= maxSpeed / speed;
      this.vy *= maxSpeed / speed;
    }
    this.speed = Math.hypot(this.vx, this.vy);
    this.x += this.vx * step;
    this.y += this.vy * step;
    // Wrap both ends of the trail together, avoiding a line across the screen.
    if (this.x < 0 || this.x >= width || this.y < 0 || this.y >= height) {
      this.x = wrap(this.x, width);
      this.y = wrap(this.y, height);
      this.prevX = this.x;
      this.prevY = this.y;
    }
  }

  resize(oldWidth, oldHeight, width, height, scaleRatio) {
    this.x = wrap((this.x * width) / oldWidth, width);
    this.y = wrap((this.y * height) / oldHeight, height);
    this.prevX = this.x;
    this.prevY = this.y;
    this.vx *= scaleRatio;
    this.vy *= scaleRatio;
    this.speed *= scaleRatio;
  }
}
