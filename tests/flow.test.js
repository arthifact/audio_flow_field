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
  assert.equal(particle.speed, 0.5 * field.scale);
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
    oldHeight = 800,
    oldScale = createField(oldWidth, oldHeight).scale;
  for (const [width, height] of [
    [390, 844],
    [844, 260],
    [1, 1],
  ]) {
    const field = createField(width, height);
    particle.resize(oldWidth, oldHeight, width, height, field.scale / oldScale);
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
    oldScale = field.scale;
  }
});

test('turning the field changes direction without a fixed audio-axis bias', () => {
  const field = createField(1280, 800);
  const levels = { energy: 150, bass: 170, mid: 130, treble: 40 };
  updateField(field, 10, levels, () => 0.5, 0);
  const original = { x: field.x[0], y: field.y[0] };
  updateField(field, 10, levels, () => 0.5, Math.PI / 2);
  assert.ok(Math.abs(field.x[0] + original.y) < 1e-12);
  assert.ok(Math.abs(field.y[0] - original.x) < 1e-12);
  updateField(field, 10, levels, () => 0.5, Math.PI);
  assert.ok(Math.abs(field.x[0] + original.x) < 1e-12);
  assert.ok(Math.abs(field.y[0] + original.y) < 1e-12);
  updateField(field, 10, levels, () => 0.5, 0.001);
  assert.ok(
    Math.hypot(field.x[0] - original.x, field.y[0] - original.y) <
      Math.hypot(original.x, original.y) * 0.0011,
  );
});

test('particles cross cell boundaries without a sudden steering change', () => {
  const field = createField(1280, 800);
  for (let i = 0; i < field.x.length; i++) field.x[i] = i % field.cols;
  const left = new Particle(1280, 800, () => 0);
  const right = new Particle(1280, 800, () => 0);
  left.x = field.cellSize - 0.001;
  right.x = field.cellSize + 0.001;
  left.move(field, 1280, 800, 100, 0, 1);
  right.move(field, 1280, 800, 100, 0, 1);
  assert.ok(Math.abs(left.vx - right.vx) < 0.001);
  assert.equal(left.vy, right.vy);
});

test('window sizing preserves the reference look and caps large-screen density', () => {
  const desktop = createField(1280, 800);
  const phone = createField(390, 844);
  const large = createField(2560, 1600);
  assert.equal(desktop.scale, 1);
  assert.equal(desktop.baseCount, 1400);
  assert.equal(desktop.maxCount, 3500);
  assert.ok(phone.scale < desktop.scale && phone.scale > 0.5);
  assert.ok(phone.baseCount < desktop.baseCount);
  assert.ok(phone.maxCount < desktop.maxCount);
  assert.ok(large.scale > desktop.scale);
  assert.ok(large.baseCount > desktop.baseCount);
  for (const [width, height] of [
    [1, 1],
    [2560, 1600],
    [10000, 10000],
  ]) {
    const field = createField(width, height);
    assert.ok(field.baseCount > 0 && field.baseCount <= field.maxCount);
    assert.ok(field.maxCount <= 5000);
    assert.ok(field.scale >= 0.5 && field.scale <= 1.6);
  }
});

test('resizing scales velocity smoothly without changing its direction', () => {
  const particle = new Particle(1280, 800, (size) => size / 2);
  particle.vx = 3;
  particle.vy = 4;
  particle.speed = 5;
  const ratio = createField(390, 844).scale;
  particle.resize(1280, 800, 390, 844, ratio);
  assert.equal(particle.x, 195);
  assert.equal(particle.y, 422);
  assert.equal(particle.vx, 3 * ratio);
  assert.equal(particle.vy, 4 * ratio);
  assert.equal(particle.speed, 5 * ratio);
  assert.equal(particle.prevX, particle.x);
  assert.equal(particle.prevY, particle.y);
});
