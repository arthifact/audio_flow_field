import { test, expect } from '@playwright/test';
import { makeWav } from '../helpers/audio.js';

const audio = (name = 'test.wav', seconds = 4, options = {}) => ({
  name,
  mimeType: 'audio/wav',
  buffer: makeWav(seconds, 44100, options),
});
const play = (page) => page.getByRole('button', { name: 'Play', exact: true });
const pause = (page) =>
  page.getByRole('button', { name: 'Pause', exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
});

test('minimal controls load, loop, pause, resume, clear, and enter fullscreen', async ({
  page,
}) => {
  const errors = [],
    uploads = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'POST') uploads.push(request.url());
  });
  await expect(page.locator('h1')).toHaveCount(0);
  await expect(page.getByRole('button')).toHaveCount(4);
  await expect(play(page)).toBeDisabled();
  await page.locator('#audio-file').setInputFiles(audio('short.wav', 0.5));
  await expect(play(page)).toBeEnabled();
  await play(page).click();
  await page.waitForTimeout(1300);
  await expect(pause(page)).toBeEnabled();
  await pause(page).click();
  await play(page).click();
  await page.keyboard.press('Space');
  await expect(play(page)).toBeEnabled();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.keyboard.press('f');
  await expect(
    page.getByRole('button', { name: 'Exit fullscreen' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Exit fullscreen' }).click();
  await expect(
    page.getByRole('button', { name: 'Fullscreen', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(uploads).toEqual([]);
});

test('a failed decode recovers and replacing a playing file pauses the new one', async ({
  page,
}) => {
  await page.locator('#audio-file').setInputFiles({
    name: 'broken.mp3',
    mimeType: 'audio/mpeg',
    buffer: Buffer.from('invalid audio'),
  });
  await expect(page.getByRole('status')).toContainText('could not be decoded');
  await expect(play(page)).toBeDisabled();
  await page.locator('#audio-file').setInputFiles(audio('first.wav'));
  await play(page).click();
  await page.locator('#audio-file').setInputFiles(audio('second.wav'));
  await expect(page.getByRole('status')).toHaveText('second.wav');
  await expect(play(page)).toBeEnabled();
  await play(page).click();
  await expect(pause(page)).toBeEnabled();
});

test('dropped audio and help stay usable in portrait and short landscape views', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const transfer = await page.evaluateHandle(
    (bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(bytes)], 'dropped.wav', { type: 'audio/wav' }),
      );
      return transfer;
    },
    [...makeWav(4)],
  );
  await page.dispatchEvent('body', 'drop', { dataTransfer: transfer });
  await expect(page.getByRole('status')).toHaveText('dropped.wav');
  await play(page).click();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 260 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByText('How to use', { exact: true }).click();
    for (const selector of ['.controls', '.help']) {
      const box = await page.locator(selector).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    await page.getByText('How to use', { exact: true }).click();
  }
});

test('the color swatch changes visible trails', async ({ page }) => {
  await page.locator('#audio-file').setInputFiles(audio('colors.wav', 10));
  await play(page).click();
  await page.locator('#particle-color').fill('#28aaff');
  await expect
    .poll(() =>
      page.locator('canvas').evaluate((canvas) => {
        const pixels = canvas
          .getContext('2d')
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let blue = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i + 2] > 40 && pixels[i + 2] > pixels[i] * 1.5) blue++;
        return blue;
      }),
    )
    .toBeGreaterThan(200);
});

for (const [profile, gain] of [
  ['melody', 0.001],
  ['pad', 0.001],
  ['beats', 1],
  ['dense', 1],
]) {
  test(`audio drives particle motion for ${profile} at gain ${gain}`, async ({
    page,
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.evaluate(() => {
      const original = CanvasRenderingContext2D.prototype.lineTo;
      const moveTo = CanvasRenderingContext2D.prototype.moveTo;
      const starts = new WeakMap();
      window.__longestTrail = 0;
      CanvasRenderingContext2D.prototype.moveTo = function (x, y) {
        starts.set(this, { x, y });
        return moveTo.call(this, x, y);
      };
      CanvasRenderingContext2D.prototype.lineTo = function (x, y) {
        const start = starts.get(this);
        if (start)
          window.__longestTrail = Math.max(
            window.__longestTrail,
            Math.hypot(x - start.x, y - start.y),
          );
        return original.call(this, x, y);
      };
    });
    await page
      .locator('#audio-file')
      .setInputFiles(audio(profile + '.wav', 10, { profile, gain }));
    await play(page).click();
    await expect
      .poll(() => page.evaluate(() => window.__longestTrail))
      .toBeGreaterThan(1);
    await page.setViewportSize({ width: 391, height: 843 });
    await page.setViewportSize({ width: 844, height: 260 });
    await pause(page).click();
    expect(
      await page.evaluate(() => window.__longestTrail),
    ).toBeLessThanOrEqual(24.01);
    expect(errors).toEqual([]);
  });
}
