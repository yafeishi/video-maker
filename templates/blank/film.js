// 空白模板：三个镜头的最小骨架。改 SHOTS、DRAW 和 lines.json，就是一部新片。
// 页面约定（工作台和渲染器都靠它）：window.DUR / render(t) / READY，可选 EV（音效与配音事件）、CUES（字幕）、SHOTS、POSTER
import { clamp, lerp, seg, ss, eo, spring, TAU, layout, shotAt } from '/core/lib.js';

const W = 1920, H = 1080;
const C = { bg: '#f4efe6', ink: '#1d1b18', dim: '#8a8175', acc: '#e0533b' };
const ZH = '"NotoSansSC", "PingFang SC", "Microsoft YaHei", sans-serif';
const BPM = 90, BEAT = 60 / BPM;

const cv = document.getElementById('c'); cv.width = W; cv.height = H;
const g = cv.getContext('2d');

// 镜头：最短时长（秒）+ 这个镜头里的台词（at = 镜头内第几秒开口）。配音更长时镜头自动撑开
const SHOTS = [
  { id: 'open', dur: 4 * BEAT, lines: [{ id: 'l1', at: .8 }] },
  { id: 'body', dur: 8 * BEAT, lines: [{ id: 'l2', at: .5 }] },
  { id: 'end',  dur: 6 * BEAT, lines: [] },
];

async function loadJSON(p, fallback) { try { const r = await fetch(p, { cache: 'no-store' }); return r.ok ? await r.json() : fallback; } catch { return fallback; } }
const linesDoc = await loadJSON('lines.json', { lines: [] });
const TEXT = Object.fromEntries(linesDoc.lines.map(L => [L.id, L.text]));
const TL = layout(SHOTS, TEXT, await loadJSON('voices/dur.json', {}), { quant: 2 * BEAT });
const S = Object.fromEntries(TL.shots.map(s => [s.id, s]));
await Promise.all([`400 40px ${ZH}`, `700 40px ${ZH}`].map(f => document.fonts.load(f, '一')));

// 事件：音效名对应 core/audio/sfx.py 里的函数（tick key whoosh riser thump boom ding glitch shutter pop）
const EV = [];
const sfx = (t, name, gain = 1, extra = {}) => EV.push({ t, type: 'sfx', name, gain, ...extra });
for (const L of TL.lines) EV.push({ t: L.t0, type: 'voice', id: L.id, d: L.voice });
sfx(S.open.t0 + .2, 'pop', .6);
sfx(S.body.t0, 'whoosh', .5, { d: .6 });
sfx(S.end.t0 + .4, 'ding', .5);
EV.sort((a, b) => a.t - b.t);

function text(s, x, y, { size = 40, weight = 400, color = C.ink, alpha = 1, align = 'center' } = {}) {
  if (alpha <= 0) return;
  g.save(); g.globalAlpha *= alpha; g.font = `${weight} ${size}px ${ZH}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y); g.restore();
}
// 一个世界 → 屏幕的相机：所有跟随主体的效果都经过它，不手写屏幕坐标
function cam(c) { g.setTransform(1, 0, 0, 1, 0, 0); g.translate(W / 2, H / 2); g.scale(c.z, c.z); g.translate(-c.x, -c.y); }
function bg() { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = C.bg; g.fillRect(0, 0, W, H); }

const DRAW = {
  open(lt, s) {
    bg(); cam({ x: 0, y: 0, z: lerp(1, 1.06, ss(lt / s.dur)) });
    const p = spring(lt - .2, 8, .45);
    g.fillStyle = C.acc; g.beginPath(); g.arc(0, -40, 90 * clamp(p, 0, 1.2), 0, TAU); g.fill();
    text('片名', 0, 160, { size: 96, weight: 700, alpha: eo(seg(lt, .5, 1.1)) });
  },
  body(lt, s) {
    bg(); const x = lerp(-500, 500, ss(seg(lt, .3, s.dur - .3)));
    cam({ x: x * .3, y: 0, z: lerp(.95, 1.05, ss(lt / s.dur)) });
    g.strokeStyle = C.dim; g.lineWidth = 3; g.beginPath(); g.moveTo(-700, 120); g.lineTo(700, 120); g.stroke();
    g.fillStyle = C.acc; g.beginPath(); g.arc(x, 120 - 80 - 160 * Math.abs(Math.sin(lt * Math.PI * 1.5)), 50, 0, TAU); g.fill();
  },
  end(lt, s) {
    bg(); cam({ x: 0, y: 0, z: 1 });
    text('完', 0, -20, { size: 160, weight: 700, alpha: eo(seg(lt, .3, 1)) * (1 - seg(lt, s.dur - .6, s.dur)) });
  },
};

function captions(t) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  for (const L of TL.lines) {
    const a = Math.min(ss(seg(t, L.t0 - .15, L.t0 + .1)), 1 - ss(seg(t, L.t1 - .1, L.t1 + .15)));
    if (a > 0) text(L.text, W / 2, H - 100, { size: 46, alpha: a });
  }
}

window.DUR = TL.DUR;
window.EV = EV;
window.CUES = TL.lines.map(L => ({ t0: L.t0, t1: L.t1, text: L.text }));
window.SHOTS = TL.shots.map(s => ({ id: s.id, t0: s.t0, t1: s.t1 }));
window.POSTER = S.open.t0 + 2;
window.render = t => {
  t = clamp(t, 0, TL.DUR - 1e-6);
  const { shot, lt } = shotAt(TL.shots, t);
  g.save(); DRAW[shot.id](lt, shot); g.restore();
  captions(t);
};
window.render(0);
window.READY = true;
