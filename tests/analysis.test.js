import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioResponse, bandEnergy } from '../src/analysis.js';

const spectrum = (db) => new Float32Array(1024).fill(db);

test('ordinary recordings retain their original energy and level', () => {
  const result = new AudioResponse().update(spectrum(-45), 0.2, 48000, 1 / 60);
  assert.ok(Math.abs(result.energy - (55 / 70) * 255) < 1e-5);
  assert.equal(result.level, 0.2);
});

test('a recording 60 dB quieter recovers the same visual response', () => {
  const loud = new AudioResponse(),
    quiet = new AudioResponse();
  let a, b;
  for (let i = 0; i < 120; i++) {
    a = loud.update(spectrum(-45), 0.08, 48000, 0.05);
    b = quiet.update(spectrum(-105), 0.00008, 48000, 0.05);
  }
  for (const key of ['energy', 'bass', 'mid', 'treble', 'level'])
    assert.ok(Math.abs(a[key] - b[key]) < 1e-4, key);
});

test('bass-light melodies still drive visible motion', () => {
  const decibels = spectrum(-Infinity);
  decibels[Math.round((3500 / 24000) * decibels.length)] = -35;
  const result = new AudioResponse().update(decibels, 0.1, 48000, 1 / 60);
  assert.equal(result.bass, 0);
  assert.ok(result.energy > 50);
});

test('silence and numerical FFT gaps never produce motion-driving energy', () => {
  const response = new AudioResponse();
  response.update(spectrum(-45), 0.2, 48000, 0.05);
  for (const rms of [0, 1e-8]) {
    const result = response.update(spectrum(-Infinity), rms, 48000, 0.05);
    assert.deepEqual(result, {
      energy: 0,
      bass: 0,
      mid: 0,
      treble: 0,
      level: 0,
    });
  }
  assert.ok(
    Object.values(response.update(spectrum(NaN), 0.1, 48000, 0.05)).every(
      Number.isFinite,
    ),
  );
});

test('frequency bands follow sample rate and remain finite below 28 kHz', () => {
  const bins = Array.from({ length: 1024 }, (_, i) => i);
  for (const sampleRate of [8000, 22050, 44100, 48000, 96000]) {
    const first = Math.round((400 / (sampleRate / 2)) * bins.length);
    const last = Math.round((2600 / (sampleRate / 2)) * bins.length);
    assert.equal(bandEnergy(bins, 400, 2600, sampleRate), (first + last) / 2);
    assert.ok(
      Object.values(
        new AudioResponse().update(spectrum(-50), 0.1, sampleRate, 0.05),
      ).every(Number.isFinite),
    );
  }
});

test('sensitivity recovers after a loud intro and agrees across frame rates', () => {
  const results = [30, 60, 120].map((fps) => {
    const response = new AudioResponse();
    for (let i = 0; i < fps * 2; i++)
      response.update(spectrum(-30), 0.4, 44100, 1 / fps);
    let result;
    for (let i = 0; i < fps * 12; i++)
      result = response.update(spectrum(-105), 0.00008, 44100, 1 / fps);
    assert.ok(result.energy > 195);
    return result;
  });
  for (const result of results) {
    assert.ok(Math.abs(result.energy - results[0].energy) < 0.01);
    assert.ok(Math.abs(result.level - results[0].level) < 0.0001);
  }
});
