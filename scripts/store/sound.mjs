// The film's soundtrack, synthesised from scratch (no samples, so nothing to
// license): a few small interface sounds and a quiet pad, rendered offline in
// the browser's audio engine and returned as a WAV file.
//
// Sounds are kept short and soft on purpose. To use recorded sound effects
// instead, replace this module's output with your own WAV of the same length.
const SAMPLE_RATE = 48_000;
const PEAK = 0.7; // about -3 dBFS: the loudest sound sits here, everything else relative to it

// Runs inside the page. Must stay self-contained.
async function synthesise({ duration, events, sampleRate, peak }) {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);

  // Master: gentle glue, then a touch of short echo for air.
  const master = ctx.createGain();
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16;
  glue.ratio.value = 2.5;
  glue.attack.value = 0.01;
  glue.release.value = 0.2;
  master.connect(glue).connect(ctx.destination);
  const air = ctx.createGain();
  const delay = ctx.createDelay();
  const damp = ctx.createBiquadFilter();
  const feedback = ctx.createGain();
  delay.delayTime.value = 0.13;
  damp.type = 'lowpass';
  damp.frequency.value = 2200;
  feedback.gain.value = 0.3;
  air.connect(delay).connect(damp).connect(feedback).connect(delay);
  damp.connect(master);

  const noise = ctx.createBuffer(1, sampleRate * 2, sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

  // An envelope: [[time offset, level], …] with exponential moves between points.
  const envelope = (param, at, points) => {
    param.setValueAtTime(0.0001, at);
    for (const [offset, level] of points) param.exponentialRampToValueAtTime(Math.max(level, 0.0001), at + offset);
  };
  const voice = (at, { pan = 0, send = 0 } = {}) => {
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, at);
    gain.connect(panner).connect(master);
    if (send) {
      const toAir = ctx.createGain();
      toAir.gain.value = send;
      panner.connect(toAir).connect(air);
    }
    return { gain, panner };
  };
  const tone = (at, type, from, to, glide, length) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, at + glide);
    osc.start(at);
    osc.stop(at + length);
    return osc;
  };
  const hiss = (at, length) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.start(at, Math.random());
    src.stop(at + length);
    return src;
  };

  const SOUNDS = {
    // A dry little key or switch.
    tick(at, { pitch = 1, level = 0.09, pan = 0 }) {
      const { gain } = voice(at, { pan, send: 0.08 });
      envelope(gain.gain, at, [[0.002, level], [0.05, 0.0001]]);
      tone(at, 'sine', 1900 * pitch, 1150 * pitch, 0.03, 0.07).connect(gain);
      const click = ctx.createBiquadFilter();
      click.type = 'highpass';
      click.frequency.value = 3200;
      const clickGain = ctx.createGain();
      envelope(clickGain.gain, at, [[0.001, level * 0.5], [0.014, 0.0001]]);
      hiss(at, 0.03).connect(click).connect(clickGain).connect(gain);
    },
    // Something soft landing.
    pop(at, { level = 0.2, pitch = 1, pan = 0 }) {
      const { gain } = voice(at, { pan, send: 0.22 });
      envelope(gain.gain, at, [[0.004, level], [0.2, 0.0001]]);
      tone(at, 'sine', 520 * pitch, 170 * pitch, 0.09, 0.24).connect(gain);
    },
    // Air moving past: filtered noise sweeping up or down, crossing the stereo field.
    whoosh(at, { length = 0.55, level = 0.1, rising = true, from = -0.5, to = 0.5 }) {
      const { gain, panner } = voice(at, { pan: from, send: 0.15 });
      panner.pan.linearRampToValueAtTime(to, at + length);
      envelope(gain.gain, at, [[length * 0.45, level], [length, 0.0001]]);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 0.9;
      const [low, high] = rising ? [380, 2600] : [2400, 420];
      band.frequency.setValueAtTime(low, at);
      band.frequency.exponentialRampToValueAtTime(high, at + length);
      hiss(at, length + 0.05).connect(band).connect(gain);
    },
    // Two or three soft bell tones.
    chime(at, { notes, level = 0.085, gap = 0.085 }) {
      notes.forEach((frequency, i) => {
        const start = at + i * gap;
        const { gain } = voice(start, { pan: (i - (notes.length - 1) / 2) * 0.25, send: 0.35 });
        envelope(gain.gain, start, [[0.006, level], [1.3, 0.0001]]);
        tone(start, 'sine', frequency, frequency, 0, 1.4).connect(gain);
        const shimmer = ctx.createGain();
        shimmer.gain.value = 0.18;
        tone(start, 'sine', frequency * 2.01, frequency * 2.01, 0, 0.7).connect(shimmer).connect(gain);
      });
    },
    // A quiet bed under everything: fifths, slowly opening.
    pad(at, { length, level = 0.03, root = 110 }) {
      const { gain } = voice(at, { send: 0.1 });
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level, at + 2.5);
      gain.gain.setValueAtTime(level, at + length - 3);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420, at);
      filter.frequency.linearRampToValueAtTime(900, at + length * 0.6);
      filter.frequency.linearRampToValueAtTime(500, at + length);
      filter.connect(gain);
      for (const [ratio, detune, weight] of [[1, -4, 1], [1.5, 3, 0.7], [2, 5, 0.5], [3, -2, 0.18]]) {
        const osc = tone(at, 'triangle', root * ratio, root * ratio, 0, length);
        osc.detune.value = detune;
        const part = ctx.createGain();
        part.gain.value = weight;
        osc.connect(part).connect(filter);
      }
    },
  };

  for (const { sound, at, ...options } of events) SOUNDS[sound](at, options);
  const rendered = await ctx.startRendering();

  // Bring the loudest moment up to the target peak, then interleave to 16-bit
  // PCM and hand it back as base64.
  const [left, right] = [rendered.getChannelData(0), rendered.getChannelData(1)];
  let loudest = 0;
  for (let i = 0; i < left.length; i++) loudest = Math.max(loudest, Math.abs(left[i]), Math.abs(right[i]));
  const gain = loudest ? peak / loudest : 1;
  const pcm = new Int16Array(left.length * 2);
  for (let i = 0; i < left.length; i++) {
    pcm[i * 2] = left[i] * gain * 32767;
    pcm[i * 2 + 1] = right[i] * gain * 32767;
  }
  const bytes = new Uint8Array(pcm.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function wav(pcm, sampleRate, channels = 2) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// Notes of an A major chord, used for the two chimes.
const NOTE = { A4: 440, CS5: 554.37, E5: 659.25, A5: 880 };

// Turns the film's cue sheet into sound events.
export function soundEvents({ T, CLICK_AT, SWIPES, TYPING }, duration) {
  return [
    { sound: 'pad', at: 0, length: duration },
    // intro: the mark assembles
    { sound: 'pop', at: T.intro + 0.2, level: 0.18 },
    { sound: 'tick', at: T.intro + 0.5, pitch: 0.8 },
    { sound: 'tick', at: T.intro + 0.8, pitch: 1.0, pan: 0.2 },
    { sound: 'chime', at: T.intro + 0.95, notes: [NOTE.E5, NOTE.A5] },
    // the browser arrives
    { sound: 'whoosh', at: T.tabs + 0.15, length: 0.8, level: 0.085, from: 0.6, to: 0.1 },
    { sound: 'tick', at: CLICK_AT, pitch: 0.7, level: 0.11, pan: 0.1 },
    // swipes between spaces: out, out, and back
    ...SWIPES.map((at, i) => ({ sound: 'whoosh', at: at + 0.12, length: 0.5, level: 0.095, rising: i !== SWIPES.length - 1, from: i === SWIPES.length - 1 ? -0.4 : 0.5, to: i === SWIPES.length - 1 ? 0.5 : -0.4 })),
    // camera pushes in, the folder unfolds
    { sound: 'whoosh', at: T.live + 0.3, length: 1.0, level: 0.055 },
    ...[0, 1, 2, 3, 4].map((i) => ({ sound: 'tick', at: T.live + 1.3 + i * 0.075, pitch: 0.9 + i * 0.07, level: 0.07, pan: 0.15 })),
    // command bar
    { sound: 'pop', at: T.command + 0.6, level: 0.16, pitch: 1.15 },
    ...TYPING.map((at, i) => ({ sound: 'tick', at, pitch: [1, 1.07, 0.95][i % 3], level: 0.085 })),
    // library and settings
    { sound: 'whoosh', at: T.library + 0.3, length: 0.55, level: 0.085, rising: false, from: -0.5, to: 0.3 },
    { sound: 'pop', at: T.library + 1.45, level: 0.13, pitch: 0.9, pan: 0.35 },
    // end card
    { sound: 'whoosh', at: T.outro - 0.05, length: 0.7, level: 0.07, rising: false },
    { sound: 'chime', at: T.outro + 0.95, notes: [NOTE.CS5, NOTE.E5, NOTE.A5], level: 0.09 },
  ];
}

export async function renderSoundtrack(page, cues, duration) {
  const events = soundEvents(cues, duration);
  const base64 = await page.evaluate(`(${synthesise})(${JSON.stringify({ duration, events, sampleRate: SAMPLE_RATE, peak: PEAK })})`);
  return wav(Buffer.from(base64, 'base64'), SAMPLE_RATE);
}
