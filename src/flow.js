export const CELL_SIZE = 20;

export function createField(width, height) {
  const cols = Math.max(1, Math.ceil(width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(height / CELL_SIZE));
  return {
    cols,
    rows,
    x: new Float64Array(cols * rows),
    y: new Float64Array(cols * rows),
  };
}

export function updateField(field, z, { energy, bass, mid, treble }, noise) {
  const magnitude = 0.5 + (energy / 255) * 4.5;
  const horizontal = (mid / 255) * magnitude;
  const vertical = ((treble - bass) / 255) * magnitude;
  for (let y = 0; y < field.rows; y++) {
    for (let x = 0; x < field.cols; x++) {
      const i = x + y * field.cols;
      const angle = noise(x * 0.01, y * 0.01, z) * Math.PI * 2;
      field.x[i] = Math.cos(angle) * magnitude + horizontal;
      field.y[i] = Math.sin(angle) * magnitude + vertical;
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
    const index =
      Math.floor(this.x / CELL_SIZE) +
      Math.floor(this.y / CELL_SIZE) * field.cols;
    let fx = field.x[index],
      fy = field.y[index];
    const dx = this.x - width / 2,
      dy = this.y - height / 2;
    const distance = Math.hypot(dx, dy);
    if (burst > 0.01 && distance > 1 && distance < 600) {
      const force = (burst * (1 - distance / 600)) / distance;
      fx += dx * force;
      fy += dy * force;
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

  resize(oldWidth, oldHeight, width, height) {
    this.x = wrap((this.x * width) / oldWidth, width);
    this.y = wrap((this.y * height) / oldHeight, height);
    this.prevX = this.x;
    this.prevY = this.y;
  }
}
