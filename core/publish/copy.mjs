// 多平台发布文案：node core/publish/copy.mjs <film> → <film>/out/copy.json + out/copy-<平台>.md
// 纯模板、离线、确定性：同样的素材每次出同样的文案，不调用任何在线模型
// 素材（有哪个用哪个）：publish.json（手写覆盖）、TREATMENT.md（片名、一句话、起承转合）、lines.json（台词）、
//   STYLE.md（风格名与气质）、CREDITS、events.json（时长）、index.html <title>
// 平台：视频号 channels、X x、小红书 xhs、抖音 douyin
import fs from 'fs'; import path from 'path';

const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const len = s => [...s].length;
// X 的计数：中日韩字符算 2，链接一律按 23
const xLen = s => { let n = 0; s = s.replace(/https?:\/\/\S+/g, () => { n += 23; return ''; }); for (const c of s) n += CJK.test(c) ? 2 : 1; return n; };
const clip = (s, n, f = len) => { if (f(s) <= n) return s; let o = ''; for (const c of s) { if (f(o + c + '…') > n) break; o += c; } return o.replace(/[，,、；：\s]+$/, '') + '…'; };
const md = s => s.replace(/\*\*|__/g, '').replace(/`([^`]*)`/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
const sentences = s => (s.match(/[^。！？!?]+[。！？!?]?/g) || []).map(x => x.trim()).filter(Boolean);
const tag = t => '#' + t.replace(/^#/, '').replace(/\s+/g, '');
const uniq = a => [...new Set(a.filter(Boolean))];

// 广告法极限词和引流话术：出现在文案里就提示（视频号、小红书、抖音会限流或判违规）
const RISKY = ['最好', '最佳', '最强', '最低价', '第一', '唯一', '顶级', '国家级', '万能', '100%', '绝对', '必看', '震惊', '免费领', '加微信', '加V', '私信我', '点赞关注', '求关注', '转发抽奖'];

export function collect(dir) {
  const read = f => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
  const readJSON = f => { try { return JSON.parse(read(f)); } catch { return null; } };
  const used = [];
  const mark = (f, v) => { if ((Array.isArray(v) ? v.length : v) && !used.includes(f)) used.push(f); return v; };
  const pub = mark('publish.json', readJSON('publish.json')) || {};
  const treat = read('TREATMENT.md'), style = read('STYLE.md'), credits = read('CREDITS');
  const html = read('index.html'), ev = readJSON('events.json'), lj = readJSON('lines.json');

  const htmlTitle = ((/<title>([^<]*)<\/title>/.exec(html) || [])[1] || '').trim();
  const title = pub.title || mark('TREATMENT.md', (/^#\s*《([^》]+)》/m.exec(treat) || [])[1])
    || mark('STYLE.md', (/示例片[：:]\s*《([^》]+)》/.exec(style) || [])[1]) || htmlTitle.split(/\s+[·|｜-]\s+/)[0] || path.basename(dir);
  const oneLiner = pub.hook || mark('TREATMENT.md', md((/\*\*一句话\*\*\s*[：:]\s*(.+)/.exec(treat) || [, ''])[1]));
  const beats = [...treat.matchAll(/^-\s*(起|承|转|合)[：:]\s*(.+)$/gm)].map(m => ({ k: m[1], text: md(m[2]) }));
  const lines = mark('lines.json', (lj?.lines || []).map(l => (l.text || '').trim()).filter(Boolean));
  const vo = sentences(lines.join(''));

  const sh = /^#\s*(.+)$/m.exec(style);
  const [styleZh, styleEn] = sh ? mark('STYLE.md', sh[1]).split(/\s*·\s*/) : [(htmlTitle.split(/\s+·\s+/)[1] || ''), ''];
  const styleIntro = md((style.split(/\n\s*\n/).find((p, i) => i > 0 && !p.startsWith('#')) || '').replace(/\n/g, ''));
  const tone = pub.tone || (/发布会|技术|数据|代码|产品|讲解/.test(style + treat) ? 'tech' : /温情|生活|故事|童|家/.test(style + treat) ? 'warm' : 'plain');
  const creditLines = mark('CREDITS', credits.split('\n').filter(l => /^(画面|配音|配乐|音效)[：:]/.test(l)).map(l => l.trim()));
  const dur = +(ev?.dur || pub.dur || 0) || null; if (ev?.dur) mark('events.json', 1);
  const zh = CJK.test(title + lines.join('') + oneLiner);

  return {
    name: path.basename(dir), title, titleEn: pub.titleEn || '', oneLiner, hookEn: pub.hookEn || '', beats, lines, vo,
    styleZh: (styleZh || '').trim(), styleEn: (styleEn || '').trim(), styleIntro, tone, creditLines, dur, zh,
    tags: pub.tags || [], tagsEn: pub.tagsEn || [], link: pub.link || '', over: pub.platforms || {}, used,
  };
}

const durZh = d => d ? `${Math.round(d)} 秒` : '';
const durEn = d => d ? `${Math.round(d)}s` : '';
const EMOJI = { tech: ['🎬', '💡', '⚙️', '🎧', '✨'], warm: ['🎬', '🌿', '☕️', '🎧', '✨'], plain: ['🎬', '📌', '🎞️', '🎧', '✨'] };

function channels(s) {
  const tags = uniq([...s.tags.slice(0, 2), s.styleZh || '短片']).slice(0, 3).map(tag);
  const cand = [s.styleZh && `${s.title}｜${s.styleZh}`, `《${s.title}》${durZh(s.dur).replace(' ', '')}短片`, s.title].filter(Boolean);
  const title = cand.find(t => len(t) >= 6 && len(t) <= 16) || clip(s.title, 16);
  const quote = s.vo.slice(0, 2).concat(s.vo.length > 3 ? [s.vo[s.vo.length - 1]] : []);
  const body = [
    `《${s.title}》${s.dur ? `· ${durZh(s.dur)}短片` : ''}`,
    s.oneLiner,
    quote.length ? quote.map(q => `「${q}」`).join('\n') : '',
    s.creditLines[0] || '',
    tags.join(' '),
  ].filter(Boolean).join('\n\n');
  return { title, body, tags, limits: { title: [6, 16], body: 1000 }, notes: ['短标题 6–16 字，不堆符号', '正文不放外链、不写「点赞关注」类引导'] };
}

function x(s) {
  const tags = uniq([...(s.tagsEn.length ? s.tagsEn : s.tags).slice(0, 2)]).map(tag);
  const head = s.titleEn ? `${s.titleEn} / 《${s.title}》` : `《${s.title}》`;
  const en = s.hookEn || (s.zh && s.styleEn ? `A ${durEn(s.dur) ? durEn(s.dur) + ' ' : ''}${s.styleEn.toLowerCase()} short.` : '');
  const hook = s.vo[0] && s.vo[1] ? s.vo[0] + s.vo[1] : s.vo[0] || s.oneLiner;
  const tail = [tags.join(' '), s.link].filter(Boolean).join(' ');
  const build = h => [head + (s.dur ? ` · ${durEn(s.dur)}` : ''), h, en, tail].filter(Boolean).join('\n\n');
  let text = build(hook);
  if (xLen(text) > 280) { const room = 280 - xLen(build('')) - 2; text = build(room > 10 ? clip(hook, room, xLen) : ''); }
  return { title: head, body: text, tags, limits: { body: 280 }, count: xLen, notes: ['X 计数：汉字算 2、链接算 23，上限 280', s.zh && !s.hookEn ? '想要完整英文句子，在 publish.json 写 hookEn / titleEn' : ''].filter(Boolean) };
}

function xhs(s) {
  const [e0, e1, e2, e3, e4] = EMOJI[s.tone] || EMOJI.plain;
  const tags = uniq([...s.tags, s.styleZh, '短片', s.tone === 'tech' ? '创意编程' : s.tone === 'warm' ? '生活记录' : '原创视频', '灵感']).slice(0, 8).map(tag);
  const cand = [s.dur && `${e0}${Math.round(s.dur)}秒看完《${s.title}》`, s.styleZh && `${e0}《${s.title}》｜${s.styleZh}`, `${e0}《${s.title}》`].filter(Boolean);
  const title = cand.find(t => len(t) <= 20) || clip(`${e0}${s.title}`, 20);
  const hook = s.tone === 'tech' ? '做了一支小短片，想把一个概念讲清楚👇' : s.tone === 'warm' ? '把一段小日子剪成了短片，分享给你👇' : '分享一支自己做的小短片👇';
  const flow = s.beats.map(b => `${b.k}｜${b.text}`);
  const body = [
    hook,
    s.oneLiner ? `${e1} 一句话：${s.oneLiner}` : '',
    flow.length ? `${e2} 看点\n` + flow.map(l => `· ${l}`).join('\n') : '',
    s.vo.length ? `${e3} 片中台词\n` + s.vo.slice(0, 3).map(l => `「${l}」`).join('\n') : '',
    s.creditLines.length ? `${e4} 幕后\n` + s.creditLines.slice(0, 3).map(l => `· ${l}`).join('\n') : '',
    '你想先看哪一段？评论区聊聊～',
    tags.join(' '),
  ].filter(Boolean).join('\n\n');
  return { title, body: clip(body, 1000), tags, limits: { title: 20, body: 1000 }, notes: ['标题 20 字内带钩子，正文分段 + emoji，话题 5–8 个', '不放外链和联系方式'] };
}

function douyin(s) {
  const tags = uniq([...s.tags.slice(0, 3), s.styleZh, '短片']).slice(0, 5).map(tag);
  const title = clip(s.vo[0] ? `${s.title}：${s.vo[0].replace(/[，,。]$/, '')}` : s.title, 30);
  const body = [s.vo.slice(0, 2).join('') || s.oneLiner, s.vo.length > 2 ? s.vo[s.vo.length - 1] : '', tags.join(' ')].filter(Boolean).join('\n');
  return { title, body, tags, limits: { title: 30, body: 1000 }, notes: ['标题 30 字内，描述短、话题 3–5 个'] };
}

const PLATFORMS = [['channels', '视频号', channels], ['x', 'X / Twitter', x], ['xhs', '小红书', xhs], ['douyin', '抖音', douyin]];

export function generate(dir) {
  const s = collect(dir);
  const platforms = PLATFORMS.map(([id, name, fn]) => {
    const p = { ...fn(s), ...(s.over[id] || {}) };
    const count = p.count || len; delete p.count;
    const text = id === 'x' ? p.body : [p.title, p.body].filter(Boolean).join('\n\n');
    const warnings = RISKY.filter(w => text.includes(w)).map(w => `含「${w}」，平台可能判为极限词或引流`);
    if (p.limits.body && count(p.body) > p.limits.body) warnings.push(`正文 ${count(p.body)} 超过 ${p.limits.body}`);
    const tl = p.limits.title; if (tl && p.title && len(p.title) > (Array.isArray(tl) ? tl[1] : tl)) warnings.push(`标题 ${len(p.title)} 字超过上限`);
    return { id, name, title: p.title, body: p.body, tags: p.tags, text, counts: { title: len(p.title || ''), body: count(p.body) }, limits: p.limits, notes: p.notes, warnings };
  });
  return {
    version: 1, film: s.name, generated: new Date().toISOString(),
    source: { title: s.title, oneLiner: s.oneLiner, style: [s.styleZh, s.styleEn].filter(Boolean).join(' · '), tone: s.tone, dur: s.dur, lines: s.lines.length, files: s.used },
    platforms,
  };
}

export function write(dir, data) {
  const out = path.join(dir, 'out'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'copy.json'), JSON.stringify(data, null, 1));
  for (const p of data.platforms) {
    const doc = [`# ${p.name} · 《${data.source.title}》`, p.title && p.id !== 'x' ? `## 标题\n\n${p.title}` : '', `## ${p.id === 'x' ? '推文' : '正文'}\n\n${p.body}`,
      p.warnings.length ? `## 注意\n\n${p.warnings.map(w => `- ${w}`).join('\n')}` : ''].filter(Boolean).join('\n\n');
    fs.writeFileSync(path.join(out, `copy-${p.id}.md`), doc + '\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) { console.error('usage: node core/publish/copy.mjs <film>'); process.exit(2); }
  const data = generate(path.resolve(dir)); write(path.resolve(dir), data);
  console.log(`素材：${data.source.files.join('、') || '（只有 index.html）'}${data.source.dur ? `，时长 ${data.source.dur.toFixed(1)}s` : '（还没有 events.json，文案里不写时长）'}`);
  for (const p of data.platforms) console.log(`${p.name.padEnd(12)} 标题 ${p.counts.title} 字 · 正文 ${p.counts.body}${p.id === 'x' ? '/280' : ' 字'}${p.warnings.length ? ' · ⚠ ' + p.warnings.join('；') : ''}  → out/copy-${p.id}.md`);
  console.log('out/copy.json');
}
