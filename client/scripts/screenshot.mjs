// Drives the real game in a headless browser and saves screenshots — for
// eyeballing rendering changes (biomes, sprites, lighting) without having to
// play to the right spot and time of day by hand.
//
//   npm run shoot --workspace=client              # walk north, capture
//   npm run shoot --workspace=client -- --dir s   # walk south instead
//   npm run shoot --workspace=client -- --night   # wait for nightfall first
//
// Requires both dev servers up (npm run dev) and playwright installed.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1] ?? true;
};

const URL = flag('url', 'http://localhost:5173');
const OUT = path.resolve(flag('out', 'screenshots'));
const DIR = flag('dir', 'w'); // which way to walk: w/a/s/d
const STEPS = Number(flag('steps', 12));
const WANT_NIGHT = args.includes('--night');

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Mean luminance of the game canvas. The day/night cycle is server-driven,
 * so rather than guessing where in the cycle we are, just look at how dark
 * the screen actually is.
 */
const luminance = (page) =>
  page.evaluate(() => {
    const c = document.getElementById('game-canvas');
    const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4 * 97) {
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      n++;
    }
    return sum / n;
  });

/** Waits until the screen is brighter/darker than `threshold`, or gives up. */
async function waitForLight(page, threshold, wantBrighter) {
  for (let i = 0; i < 120; i++) {
    const l = await luminance(page);
    if (wantBrighter ? l > threshold : l < threshold) return l;
    await sleep(2000);
  }
  return luminance(page);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[page error]', m.text());
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.fill('#name-input', 'Screenshot');
await page.click('#play-btn');
await sleep(2500);

if (WANT_NIGHT) {
  console.log('waiting for nightfall...');
  console.log('  night luminance =', (await waitForLight(page, 42, false)).toFixed(1));
} else {
  console.log('waiting for daylight...');
  console.log('  day luminance =', (await waitForLight(page, 95, true)).toFixed(1));
}

// Walk, capturing as we go. The periodic sideways nudge stops us wedging
// against a tree and holding the key into it for the rest of the run.
console.log(`walking "${DIR}" for ${STEPS} steps...`);
await page.keyboard.down(DIR);
for (let i = 0; i < STEPS; i++) {
  await sleep(1800);
  await page.screenshot({ path: `${OUT}/${String(i).padStart(2, '0')}.png` });
  const side = i % 2 ? 'a' : 'd';
  await page.keyboard.down(side);
  await sleep(320);
  await page.keyboard.up(side);
}
await page.keyboard.up(DIR);

await browser.close();
console.log('done ->', OUT);
