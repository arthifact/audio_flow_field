import { test, expect } from '@playwright/test';
import { makeWav } from '../helpers/audio.js';

test('rendered particle density and thickness scale with the window', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page.evaluate(() => {
    const draw = window.draw;
    const starts = new WeakMap();
    const prototype = CanvasRenderingContext2D.prototype;
    const moveTo = prototype.moveTo,
      lineTo = prototype.lineTo;
    window.draw = () => {
      const frame = {
        width: window.width,
        height: window.height,
        count: 0,
        totalWidth: 0,
        longest: 0,
        outside: 0,
      };
      window.__flowFrame = frame;
      draw();
    };
    prototype.moveTo = function (x, y) {
      starts.set(this, { x, y });
      return moveTo.call(this, x, y);
    };
    prototype.lineTo = function (x, y) {
      const frame = window.__flowFrame,
        start = starts.get(this);
      if (frame && start) {
        frame.count++;
        frame.totalWidth += this.lineWidth;
        frame.longest = Math.max(
          frame.longest,
          Math.hypot(x - start.x, y - start.y),
        );
        for (const point of [start, { x, y }])
          if (
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y) ||
            point.x < -0.01 ||
            point.y < -0.01 ||
            point.x > frame.width + 0.01 ||
            point.y > frame.height + 0.01
          )
            frame.outside++;
      }
      return lineTo.call(this, x, y);
    };
  });
  await page.locator('#audio-file').setInputFiles({
    name: 'sizing.wav',
    mimeType: 'audio/wav',
    buffer: makeWav(20, 44100, { profile: 'pad' }),
  });
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const frames = [];
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
    { width: 2560, height: 1600 },
    { width: 844, height: 260 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        page.evaluate(() => ({
          width: window.__flowFrame?.width,
          height: window.__flowFrame?.height,
        })),
      )
      .toEqual(viewport);
    const frame = await page.evaluate(() => window.__flowFrame);
    expect(frame.count).toBeGreaterThan(0);
    expect(frame.count).toBeLessThanOrEqual(5000);
    expect(frame.outside).toBe(0);
    expect(frame.longest).toBeLessThanOrEqual(38.41);
    frames.push({ ...frame, thickness: frame.totalWidth / frame.count });
  }
  const [desktop, phone, large] = frames;
  expect(phone.count).toBeLessThan(desktop.count * 0.8);
  expect(phone.thickness).toBeLessThan(desktop.thickness * 0.9);
  expect(large.count).toBeGreaterThan(desktop.count * 1.5);
  expect(large.thickness).toBeGreaterThan(desktop.thickness * 1.1);
  expect(errors).toEqual([]);
});
