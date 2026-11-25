#!/usr/bin/env node
// Renders the promo film:   node scripts/store-film.mjs
//
//   store/arcish-promo.mp4      1920x1080, H.264 + AAC
//   store/arcish-promo.jpg      poster frame
//
// The film is a page whose every frame is a pure function of time
// (scripts/store/film.html). Each frame is captured from Chrome and piped to
// ffmpeg; the soundtrack is synthesised (scripts/store/sound.mjs) and muxed in.
// Needs ffmpeg on the PATH. FILM_FPS and FILM_FROM/FILM_TO (seconds) are for
// quick previews.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureUi } from './store/capture.mjs';
import { openDemoSession, ROOT } from './store/session.mjs';
import { renderSoundtrack } from './store/sound.mjs';

const OUT = join(ROOT, 'store');
const SIZE = { width: 1920, height: 1080 };
const FPS = Number(process.env.FILM_FPS) || 60;
const FRAME_QUALITY = 96;
const POSTER_AT = 6.2; // seconds: sidebar and caption both on screen
const LANGUAGE = 'en';
const TEXT = { tagline: 'Arc-style sidebar for Chrome', link: 'github.com/KikuchiTomo/arcish' };

function ffmpeg(args) {
  const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = once(child, 'exit').then(([code]) => {
    if (code !== 0) throw new Error(`ffmpeg exited with ${code}`);
  });
  return { child, done };
}

const session = await openDemoSession();
const work = mkdtempSync(join(tmpdir(), 'arcish-film-'));
try {
  const { site, browser } = session;
  await captureUi({ ...session, language: LANGUAGE });
  site.publish('film.html', readFileSync(join(ROOT, 'scripts/store/film.html')), 'text/html');

  const film = await browser.openPage(site.file('film.html'));
  await film.setViewport(SIZE.width, SIZE.height, { scale: 1 });
  await film.evaluate(`init(${JSON.stringify({ assetUrl: site.file(`ui/${LANGUAGE}/{name}.png`), ...TEXT })})`);
  const { duration, cues } = JSON.parse(await film.evaluate('JSON.stringify({ duration: DURATION, cues: CUES })'));
  const from = Number(process.env.FILM_FROM) || 0;
  const to = Number(process.env.FILM_TO) || duration;

  mkdirSync(OUT, { recursive: true });
  const silent = join(work, 'video.mp4');
  const encoder = ffmpeg(['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), silent]);
  const frames = Math.round((to - from) * FPS);
  for (let i = 0; i < frames; i++) {
    await film.evaluate(`seek(${from + i / FPS})`);
    const frame = await film.capture({ format: 'jpeg', quality: FRAME_QUALITY });
    if (!encoder.child.stdin.write(frame)) await once(encoder.child.stdin, 'drain');
    if (i % (FPS * 2) === 0) process.stdout.write(`\rframes ${i}/${frames}`);
  }
  encoder.child.stdin.end();
  await encoder.done;
  process.stdout.write(`\rframes ${frames}/${frames}\n`);

  await film.evaluate(`seek(${POSTER_AT})`);
  await film.capture({ file: join(OUT, 'arcish-promo.jpg'), format: 'jpeg', quality: 94 });

  const soundtrack = join(work, 'sound.wav');
  writeFileSync(soundtrack, await renderSoundtrack(film, cues, duration));
  const output = join(OUT, 'arcish-promo.mp4');
  // -ss/-t keep the sound aligned when only part of the film is rendered.
  await ffmpeg(['-i', silent, '-ss', String(from), '-t', String(to - from), '-i', soundtrack, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', output]).done;
  console.log(output.replace(`${ROOT}/`, ''));
} finally {
  await session.close();
  rmSync(work, { recursive: true, force: true });
}
