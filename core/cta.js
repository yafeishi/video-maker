// 结尾互动（评论区引导）：一个问题 + 可选的选项格子 + 一个正在打字的评论框
// 在影片 lines.json 里写 "cta" 块就启用（字段见 docs/technique.md「结尾互动」），两句配音用 id cta1 / cta2。
// 用法（模板里已经接好）：
//   const CTA = makeCTA(linesDoc.cta, { beat: BEAT, voiceDur: VDUR, text: TEXT, style });
//   SHOTS.push(CTA.shot);  …layout…  CTA.bind(TL); CTA.events(sfx);
//   DRAW.cta = (lt, s) => { 背景; 相机; CTA.draw(g, lt, s); }
// 所有时间点都按两句配音的时长比例算，换了台词不用改代码。
import { clamp, lerp, seg, ss, eo, spring, hash, TAU } from './lib.js';

const DIGITS = /^[\d\s·.:\-–/]+$/;

export function makeCTA(cfg, { beat = .6, voiceDur = {}, text: TEXT = {}, style = {} } = {}) {
  const st = { bg: '#07090d', ink: '#e9edf3', dim: '#667085', line: '#2a3345', acc: '#46f0c4', zh: 'sans-serif', mono: 'monospace', ...style };
  const c = { button: '评论', footer: '评论区见', placeholder: '写下你的想法', typed: '我觉得……', options: [], legend: [], ...cfg };
  const est = id => voiceDur[id] ?? Math.max(1.2, (TEXT[id] || '').length / 4.2);
  const d1 = est('cta1'), d2 = est('cta2');
  const at1 = .9, at2 = at1 + d1 + .45;
  const shot = { id: 'cta', dur: Math.ceil((at2 + d2 + 2.2) / beat) * beat, lines: [{ id: 'cta1', at: at1 }, { id: 'cta2', at: at2 }] };
  let T = null;

  function bind(TL) {
    const s = TL.shots.find(x => x.id === 'cta'), L = Object.fromEntries(TL.lines.map(x => [x.id, x]));
    const l1 = L.cta1 ? L.cta1.t0 : s.t0 + at1, l2 = L.cta2 ? L.cta2.t0 : s.t0 + at2;
    T = {
      t0: s.t0, box: l2,
      chip: i => l1 + d1 * .65 + i * .12,
      type: l2 + d2 * .45, per: .12,
      send: l2 + d2 * .8,
    };
    return T;
  }
  function events(sfx) {
    sfx(T.t0 + .05, 'whoosh', .2, { d: .8, lo: 300, hi: 1500 });
    c.options.forEach((_, i) => sfx(T.chip(i), 'pop', .28, { pan: -.5 + i / Math.max(1, c.options.length - 1) }));
    for (let i = 0; i < c.typed.length; i++) sfx(T.type + i * T.per, 'key', .18 + .08 * hash(i + 70), { pan: -.2 + i * .04 });
    sfx(T.send, 'ding', .22, { f: 1318, pan: .3 });
  }

  // 在当前相机下画（原点 = 画面中心）；背景和上一镜的淡出由影片自己画
  function draw(g, lt, s) {
    const t = s.t0 + lt, has = c.options.length > 0;
    const txt = (str, x, y, { size = 40, font = st.zh, weight = 400, color = st.ink, align = 'center', alpha = 1, spacing = 0 } = {}) => {
      if (alpha <= 0) return;
      g.save(); g.globalAlpha *= alpha; g.font = `${weight} ${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
      g.letterSpacing = spacing + 'px'; g.fillText(str, x, y); g.restore();
    };
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
    const mark = (m, x, y, r, a = 1) => {
      if (!m || a <= 0) return;
      g.save(); g.globalAlpha *= a;
      if (m === 'dot') { g.fillStyle = st.acc; g.shadowColor = st.acc; g.shadowBlur = 12; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
      else { g.strokeStyle = st.ink; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); }
      g.restore();
    };
    const pop = t0 => t < t0 ? 0 : clamp(spring(t - t0, 9, .5), 0, 1.3);

    const qa = ss(seg(lt, .4, 1.0));
    const qy = has ? -300 : -190, by = has ? 90 : 40;
    txt(c.question, 0, qy + 40 * (1 - qa), { size: 72, weight: 800, alpha: qa, spacing: 6 });

    if (has) {
      const font = o => DIGITS.test(o.label) ? st.mono : st.zh;
      g.save(); const ws = c.options.map(o => { g.font = `700 38px ${font(o)}`; g.letterSpacing = '0px'; return Math.max(150, g.measureText(o.label).width + (o.mark ? 96 : 60)); }); g.restore();
      const gap = 26, total = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1), sc = Math.min(1, 1600 / total);
      const last = T.chip(c.options.length - 1), scan = t - (last + .35);
      const hi = scan > 0 && scan < c.options.length * .22 ? Math.floor(scan / .22) : -1;
      g.save(); g.scale(sc, sc);
      let x = -total / 2;
      c.options.forEach((o, i) => {
        const w = ws[i], cx = x + w / 2; x += w + gap;
        const p = clamp(pop(T.chip(i))); if (p <= 0) return;
        const on = i === hi, ch = 84;
        g.save(); g.globalAlpha *= p; g.translate(cx, -150 / sc + 14 * (1 - p)); g.scale(lerp(.8, 1, p), lerp(.8, 1, p));
        rr(-w / 2, -ch / 2, w, ch, 14);
        if (on) { g.save(); g.globalAlpha *= .12; g.fillStyle = st.acc; g.fill(); g.restore(); }
        g.strokeStyle = on ? st.acc : st.line; g.lineWidth = 2; g.stroke();
        mark(o.mark, -w / 2 + 41, 0, 9);
        txt(o.label, o.mark ? 18 : 0, 1, { size: 38, font: font(o), weight: 700, color: on ? st.ink : st.dim });
        g.restore();
      });
      g.restore();
      const la = ss(seg(t, last, last + .4));
      if (c.legend.length) {
        g.save(); g.font = `400 22px ${st.zh}`; const lw = c.legend.map(l => g.measureText(l.label).width + 34); g.restore();
        const lt2 = lw.reduce((a, b) => a + b, 0) + 40 * (lw.length - 1); let lx = -lt2 / 2;
        c.legend.forEach((l, i) => { mark(l.mark, lx + 6, -76, 6, la); txt(l.label, lx + 20, -76, { size: 22, color: st.dim, align: 'left', alpha: la }); lx += lw[i] + 40; });
      }
    }

    const bp = eo(seg(t, T.box - .2, T.box + .4));
    if (bp <= 0) return;
    const bw = 1200, bh = 150, y = by + 30 * (1 - bp);
    g.save(); g.globalAlpha *= bp;
    rr(-bw / 2, y - bh / 2, bw, bh, 22); g.strokeStyle = st.line; g.lineWidth = 2; g.stroke();
    const ax = -bw / 2 + 70;
    g.strokeStyle = st.dim; g.lineWidth = 2.5; g.beginPath(); g.arc(ax, y, 38, 0, TAU); g.stroke();
    g.fillStyle = st.dim; g.beginPath(); g.arc(ax, y - 9, 12, 0, TAU); g.fill();
    g.beginPath(); g.arc(ax, y + 26, 22, Math.PI * 1.15, Math.PI * 1.85); g.fill();
    g.restore();
    const n = clamp(Math.floor((t - T.type) / T.per) + 1, 0, c.typed.length), tx = ax + 70;
    txt(c.placeholder, tx, y, { size: 36, color: st.dim, align: 'left', alpha: bp * .7 * (n === 0) });
    if (n > 0) txt(c.typed.slice(0, n), tx, y, { size: 40, align: 'left', alpha: bp });
    g.save(); g.font = `400 40px ${st.zh}`; g.letterSpacing = '0px';
    const cx = tx + (n > 0 ? g.measureText(c.typed.slice(0, n)).width + 6 : 0); g.restore();
    if (((t % 1) + 1) % 1 < .6 || (n > 0 && n < c.typed.length)) { g.save(); g.globalAlpha *= bp; g.fillStyle = st.acc; g.fillRect(cx, y - 26, 4, 52); g.restore(); }
    const sp = eo(seg(t, T.send - .05, T.send + .25)), bx = bw / 2 - 120;
    g.save(); g.globalAlpha *= bp; rr(bx - 80, y - 34, 160, 68, 34);
    if (sp > 0) { g.save(); g.fillStyle = st.acc; g.globalAlpha *= .9 * sp; g.fill(); g.restore(); g.shadowColor = st.acc; g.shadowBlur = 24 * sp; }
    g.strokeStyle = st.acc; g.lineWidth = 2.5; g.stroke(); g.restore();
    txt(c.button, bx, y + 1, { size: 32, weight: 700, color: sp > .5 ? st.bg : st.acc, alpha: bp, spacing: 4 });
    txt(c.footer, 0, y + 172, { size: 32, color: st.dim, spacing: 14, alpha: ss(seg(t, T.send + .2, T.send + .7)) });
  }

  return { shot, bind, events, draw, config: c };
}

// 新建影片时写进 lines.json 的默认内容：导演要按题目改成具体的问题
export const CTA_DEFAULT = {
  cta: { question: '你怎么看？', options: [], legend: [], placeholder: '写下你的想法', typed: '我觉得……', button: '评论', footer: '评论区见' },
  lines: [
    { id: 'cta1', text: '你怎么看？' },
    { id: 'cta2', text: '在评论区说说你的想法吧。' },
  ],
};
