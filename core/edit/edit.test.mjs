import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fallbackBeats, shotScore } from './beats.mjs';
import { ROOT, inside, resolveFilm, ROLES } from './lib.mjs';
import { fallbackLines } from './narration.mjs';
import { adaptiveCuts, boundaries, cutsFromSamples, parseSceneMetadata, parseSilence } from './shots.mjs';
import { chainClock, fadeOf, placeSegments, planTimeline, xfadeOffsets } from './timeline.mjs';

const cfg = {
  width: 1920, height: 1080, fps: 24,
  target: { min: 60, max: 120, segments: [6, 12] },
  transition: { cut: 0.12, role: 0.45 },
};

function shots(n, dur = 8) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${String(i + 1).padStart(2, '0')}`,
    src: 'raw/a.mp4', srcIn: i * dur, srcOut: (i + 1) * dur, dur,
    motion: 0.2 + (i % 3) * 0.3, silenceRatio: 0,
  }));
}

test('scene metadata and silence logs parse', () => {
  const samples = parseSceneMetadata([
    'frame:0 pts:0 pts_time:0',
    'lavfi.scene_score=0.010000',
    'frame:96 pts:1 pts_time:4',
    'lavfi.scene_score=0.420000',
    'frame:97 pts:2 pts_time:4.041',
    'lavfi.scene_score=0.020000',
  ].join('\n'));
  assert.equal(cutsFromSamples(samples, 0.3)[0], 4);
  assert.deepEqual(parseSilence('silence_start: 1.5\nsilence_end: 2.9 | silence_duration: 1.4\n', 10), [{ t0: 1.5, t1: 2.9 }]);
  assert.equal(parseSilence('silence_start: 8\n', 10)[0].t1, 10);
});

test('adaptive threshold ignores a flat noisy score and keeps a real spike', () => {
  const flat = Array.from({ length: 30 }, (_, i) => ({ t: i / 5, score: 0.02 + (i % 5) * 0.004 }));
  flat[10].score = 0.07;
  assert.equal(adaptiveCuts(flat).length, 0);
  const spike = flat.map(s => ({ ...s }));
  spike[10] = { t: 2, score: 0.4 };
  spike[9] = { t: 1.8, score: 0.02 };
  spike[11] = { t: 2.2, score: 0.02 };
  assert.ok(adaptiveCuts(spike).includes(2));
});

test('long silence splits a shot, short silence does not', () => {
  const plain = boundaries(8, [], [{ t0: 1, t1: 1.4 }], 0.8);
  assert.deepEqual(plain, [0, 8]);
  const split = boundaries(8, [], [{ t0: 3, t1: 4.2 }], 0.8);
  assert.equal(split.length, 3);
  assert.ok(split[1] > 3 && split[1] < 4.2);
});

test('crossfade clock matches sum of durations minus fades', () => {
  const d = [10, 10, 10], f = [0, 1, 1];
  assert.deepEqual(xfadeOffsets(d, f), [9, 18]);
  const clock = chainClock(d, f);
  assert.equal(clock.dur, 28);
  assert.deepEqual(clock.rows.map(r => r.t0), [0, 9, 18]);
  assert.deepEqual(clock.rows.slice(1).map(r => r.t0), xfadeOffsets(d, f));
  const placed = placeSegments([
    { in: 0, out: 10, role: '起' },
    { in: 0, out: 10, role: '起' },
    { in: 0, out: 10, role: '承' },
  ], { transition: { cut: 1, role: 1 } });
  assert.equal(placed.dur, 28);
  assert.ok(fadeOf({ in: 0, out: 10, role: '起' }, { in: 0, out: 10, role: '起' }, { transition: { cut: 5, role: 5 } }) <= 10 / 3 + 0.001);
});

test('planner builds a 60–120s arc from a dozen shots', () => {
  const s = shots(12, 8);
  const beats = fallbackBeats(s);
  assert.equal(beats.source, 'fallback');
  assert.ok(beats.beats.every(b => ROLES.includes(b.role) && b.what && b.emotion));
  const tl = planTimeline(s, beats, cfg);
  assert.ok(tl.segments.length >= 6 && tl.segments.length <= 12);
  assert.ok(tl.dur >= 60 && tl.dur <= 120);
  assert.equal(tl.segments[0].role, '起');
  assert.equal(tl.segments.at(-1).role, '合');
  for (let i = 1; i < tl.segments.length; i++) {
    assert.ok(ROLES.indexOf(tl.segments[i].role) >= ROLES.indexOf(tl.segments[i - 1].role));
  }
  for (const r of ROLES) assert.ok(tl.segments.some(seg => seg.role === r));
  assert.ok(shotScore(s[0]) > 0);
});

test('keep:false drops a shot and bot roles stay in arc order', () => {
  const s = shots(8, 10);
  const beats = fallbackBeats(s);
  beats.beats[0].keep = false;
  const tl = planTimeline(s, beats, cfg);
  assert.ok(tl.segments.every(seg => seg.shot !== 's01'));
  const directed = fallbackBeats(s);
  directed.source = 'bot';
  directed.beats.forEach((b, i) => { b.role = i < 2 ? '起' : '合'; b.keep = true; });
  const arc = planTimeline(s, directed, cfg);
  assert.equal(arc.segments[0].role, '起');
  assert.ok(arc.segments.every(seg => seg.role === '起' || seg.role === '合'));
  assert.ok(arc.warnings.some(w => w.includes('承')));
});

test('short material still plans and says it is short', () => {
  const tl = planTimeline(shots(4, 3), null, cfg);
  assert.ok(tl.segments.length >= 1 && tl.segments.length <= 4);
  assert.ok(tl.warnings.some(w => w.includes('短')));
});

test('fallback narration is Chinese and tied to segments', () => {
  const tl = planTimeline(shots(12, 8), fallbackBeats(shots(12, 8)), cfg);
  const lines = fallbackLines(tl, fallbackBeats(shots(12, 8)));
  assert.equal(lines.lines.length, tl.segments.length);
  assert.ok(lines.lines.every(l => /[\u4e00-\u9fff]/.test(l.text) && l.segment));
  assert.equal(new Set(lines.lines.map(l => l.id)).size, lines.lines.length);
});

test('paths cannot escape the film directory', () => {
  const keynote = path.join(ROOT, 'templates/keynote');
  assert.throws(() => inside(keynote, '../core/edit/lib.mjs'));
  assert.throws(() => inside(keynote, '/etc/passwd'));
  assert.throws(() => resolveFilm('/tmp'));
  assert.equal(resolveFilm(keynote).endsWith(`${path.sep}templates${path.sep}keynote`), true);
});
