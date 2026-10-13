import assert from 'node:assert/strict';
import test from 'node:test';
import { createField, updateField, Particle } from '../src/flow.js';

const silent = { energy: 0, bass: 0, mid: 0, treble: 0 };

test('the field covers partial cells at the right and bottom edges', () => {
  const width = 391,
    height = 843;
  const field = createField(width, height);
  updateField(field, 0, silent, () => 0);
  const particle = new Particle(width, height, (size) => size - 0.01);
  particle.move(field, width, height, 8, 0, 1);
  assert.ok(Number.isFinite(particle.x) && Number.isFinite(particle.y));
  assert.equal(particle.speed, 0.5);
});

test('wrapping never connects opposite sides with a long trail', () => {
  const field = createField(391, 843);
  updateField(field, 0, silent, () => 0);
  const particle = new Particle(391, 843, (size) => size - 0.01);
  particle.vx = 8;
  particle.move(field, 391, 843, 8, 0, 3);
  assert.ok(particle.x >= 0 && particle.x < 391);
  assert.equal(particle.prevX, particle.x);
  assert.equal(particle.prevY, particle.y);
});

test('bass bursts push outward while speed remains bounded', () => {
  const field = createField(800, 600);
  updateField(field, 0, silent, () => 0.25);
  for (const x of [200, 600]) {
    const particle = new Particle(800, 600, (size) => size / 2);
    particle.x = x;
    particle.move(field, 800, 600, 2, 4.5, 3);
    assert.ok(particle.vx * (x - 400) > 0);
    assert.ok(particle.speed <= 2 + 1e-12);
  }
});

test('resizing and tiny viewports keep particles and trails inside the field', () => {
  const particle = new Particle(1280, 800, (size) => size * 0.99);
  let oldWidth = 1280,
    oldHeight = 800;
  for (const [width, height] of [
    [390, 844],
    [844, 260],
    [1, 1],
  ]) {
    particle.resize(oldWidth, oldHeight, width, height);
    const field = createField(width, height);
    updateField(
      field,
      10,
      { energy: 255, bass: 255, mid: 255, treble: 255 },
      () => 0.7,
    );
    for (let i = 0; i < 100; i++) {
      particle.move(field, width, height, 8, 4.5, 3);
      assert.ok(particle.x >= 0 && particle.x < width);
      assert.ok(particle.y >= 0 && particle.y < height);
      assert.ok(
        Math.hypot(particle.x - particle.prevX, particle.y - particle.prevY) <=
          24 + 1e-9,
      );
    }
    oldWidth = width;
    oldHeight = height;
  }
});
