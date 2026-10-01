// 简报与任务状态：只校验、补默认值。不读影片画面，不改 film.js / lines.json。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const catalog = JSON.parse(fs.readFileSync(path.join(HERE, 'catalog.json'), 'utf8'));

const LINES = catalog.lines;
const PLATFORMS = catalog.platforms.map(p => p.id);
const STAGE_IDS = catalog.stages.map(s => s.id);
const OPS_STAGES = new Set(['交审', 'P0过', '改点中']);
const PUFF_CONSTRAINTS = '定版比熊泡芙，角色锁定。不要用实拍照片轮播冒充动画。';

function asText(v, max, label) {
  if (v == null || v === '') return '';
  if (typeof v !== 'string') throw new Error(`${label}要是文字`);
  const s = v.trim();
  if (s.length > max) throw new Error(`${label}太长（最多 ${max} 字）`);
  return s;
}
function parseDuration(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && !v.trim()) return null;
  if (typeof v !== 'number' && typeof v !== 'string') throw new Error('时长要是 1–600 的整数秒');
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 600) throw new Error('时长要是 1–600 的整数秒');
  return n;
}
function packsFor(line) {
  return catalog.stylePacks.filter(p => p.line === line);
}
function packById(line, id) {
  return packsFor(line).find(p => p.id === id) || null;
}
function voiceById(id) {
  return catalog.voices.find(v => v.id === id) || null;
}
export function lineDefaults(line) {
  const d = catalog.lineDefaults[line];
  if (!d) throw new Error('线路只能是「科普」或「泡芙」');
  return d;
}
export function defaultOwner(stageId, line) {
  const stage = catalog.stages.find(s => s.id === stageId);
  if (!stage) return '';
  if (stage.owner && typeof stage.owner === 'object') return stage.owner[line] || '';
  return stage.owner || '';
}
function normalizeRate(raw, fallback) {
  const s = raw == null || raw === '' ? fallback : String(raw).trim();
  if (!/^[-+]?\d{1,2}%$/.test(s)) throw new Error('语速写成 -5% 这种');
  const n = parseInt(s, 10);
  if (n < -50 || n > 50) throw new Error('语速要在 -50% 到 +50%');
  if (n === 0) return '+0%';
  return n > 0 ? `+${n}%` : `${n}%`;
}
function resolvePack(line, raw) {
  const packs = packsFor(line);
  const fallback = packs.find(p => p.id === lineDefaults(line).stylePack) || packs.find(p => p.default) || packs[0];
  const id = asText(raw.stylePack, 64, '风格包') || asText(raw.visualStyle, 64, '风格包');
  const style = asText(raw.style, 80, '风格');
  const preset = asText(raw.puffPreset, 80, '定版');
  if (line === '泡芙') {
    if (id) {
      const pack = packById(line, id);
      if (!pack) throw new Error('泡芙风格包只能是「定版日常」或「出行墨镜」');
      if (style && style !== pack.style && style !== pack.id) throw new Error('泡芙的 style 和风格包要一致');
      if (preset && preset !== pack.style && preset !== pack.id) throw new Error('泡芙的 puffPreset 和风格包要一致');
      return pack;
    }
    const label = style || preset;
    if (!label) return fallback;
    const pack = packs.find(p => p.style === label || p.id === label);
    if (!pack) throw new Error('泡芙不能用科普风格，定版只能是「定版日常」或「出行墨镜」');
    if (style && preset && style !== preset) throw new Error('泡芙的 style 和 puffPreset 要一致');
    return pack;
  }
  if (preset) throw new Error('科普简报不要带泡芙定版');
  if (id) {
    const pack = packById(line, id);
    if (!pack) throw new Error('科普风格包不在目录里');
    if (style && pack.id !== 'custom' && style !== pack.style && style !== pack.id) throw new Error('风格和风格包不一致');
    return pack;
  }
  if (!style) return fallback;
  const pack = packs.find(p => p.style === style || p.id === style);
  if (!pack) throw new Error('科普风格只能是「信息卡+字幕」「动画讲解」「纪录片旁白」或「其他自定义」');
  return pack;
}

export function normalizeBrief(raw) {
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('简报格式不对');
  const line = raw.line == null || raw.line === '' ? '科普' : raw.line;
  if (typeof line !== 'string' || !LINES.includes(line)) throw new Error('线路只能是「科普」或「泡芙」');
  if (raw.style != null && raw.style !== '' && typeof raw.style !== 'string') throw new Error('风格要是文字');
  const pack = resolvePack(line, raw);
  const defaults = lineDefaults(line);
  const brief = { line, style: pack.style, stylePack: pack.id };
  if (line === '泡芙') brief.puffPreset = pack.style;
  else if (pack.id === 'custom') {
    const styleCustom = asText(raw.styleCustom, 80, '自定义风格');
    if (styleCustom) brief.styleCustom = styleCustom;
  }
  brief.topic = asText(raw.topic, 200, '题目');
  brief.durationSec = parseDuration(raw.durationSec);
  brief.audience = asText(raw.audience, 120, '受众');
  if (raw.platforms != null && !Array.isArray(raw.platforms)) throw new Error('平台要是列表');
  const picked = raw.platforms || [];
  if (picked.some(p => typeof p !== 'string' || !PLATFORMS.includes(p))) throw new Error('平台只能选视频号、抖音、X、小红书');
  const platforms = PLATFORMS.filter(p => picked.includes(p));
  brief.platforms = platforms;
  const language = asText(raw.language, 32, '语言') || 'zh-CN';
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(language)) throw new Error('语言写成 zh-CN、en 这种代码');
  brief.language = language;
  const voiceId = raw.voice == null || raw.voice === '' ? defaults.voice : asText(raw.voice, 64, '音色');
  if (!voiceById(voiceId)) throw new Error('音色不在可选列表里');
  brief.voice = voiceId;
  brief.voiceRate = normalizeRate(raw.voiceRate, defaults.voiceRate);
  const watermark = raw.watermark == null ? defaults.watermark : asText(raw.watermark, 40, '水印');
  const banned = catalog.forbiddenWatermark[line] || [];
  if (watermark && banned.includes(watermark)) throw new Error(`「${watermark}」不能作为${line}线的水印`);
  brief.watermark = watermark;
  const aspect = raw.aspect == null || raw.aspect === '' ? defaults.aspect : raw.aspect;
  if (typeof aspect !== 'string' || !catalog.aspects.some(a => a.id === aspect)) throw new Error('画幅只能是竖屏 9:16 或横屏 16:9');
  brief.aspect = aspect;
  brief.notes = asText(raw.notes, 2000, '备注');
  if (raw.cta != null && typeof raw.cta !== 'boolean') throw new Error('CTA 只能是勾选或不勾选');
  brief.cta = raw.cta === true;
  if (line === '泡芙') {
    brief.character = '比熊泡芙';
    brief.constraints = PUFF_CONSTRAINTS;
  }
  const flags = {};
  if (platforms.includes('视频号')) flags['视频号'] = line === '泡芙' ? '宠物向，与科普模板分开' : '微信增长';
  if (platforms.includes('X')) flags['X'] = line === '泡芙' ? '宠物钩子，与科普英文模板分开' : '英文钩子，封面少字或无字';
  if (Object.keys(flags).length) brief.platformFlags = flags;
  return brief;
}

function emptyPublish() {
  return Object.fromEntries(PLATFORMS.map(id => [id, { status: '草稿', notes: '', updatedAt: null }]));
}
export function defaultStatus(line) {
  const stage = '选题';
  return {
    stage,
    owner: defaultOwner(stage, line),
    ownerLocked: false,
    ops: '未交审',
    handoff: '待拷发',
    publish: emptyPublish(),
    notes: '',
    updatedAt: null,
  };
}
function asUpdatedAt(v) {
  return typeof v === 'string' && v ? v : null;
}
export function normalizeStatus(raw, { line = '', prev = null, stamp = false } = {}) {
  const base = defaultStatus(line);
  if (raw == null) return base;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('任务状态格式不对');
  const stage = raw.stage == null || raw.stage === '' ? base.stage : raw.stage;
  if (typeof stage !== 'string' || !STAGE_IDS.includes(stage)) throw new Error('阶段不在生命周期里');
  const ops = raw.ops == null || raw.ops === '' ? base.ops : raw.ops;
  if (typeof ops !== 'string' || !catalog.ops.includes(ops)) throw new Error('运营态只能是未交审、交审、P0过、改点中');
  const handoff = raw.handoff == null || raw.handoff === '' ? base.handoff : raw.handoff;
  if (typeof handoff !== 'string' || !catalog.handoff.includes(handoff)) throw new Error('拷发只能是待拷发或已拷发给用户');
  const ownerLocked = raw.ownerLocked === true;
  let owner = raw.owner == null ? '' : asText(raw.owner, 40, '责任人');
  if (!owner && !ownerLocked) owner = defaultOwner(stage, line);
  const notes = asText(raw.notes, 2000, '任务备注');
  const src = raw.publish && typeof raw.publish === 'object' && !Array.isArray(raw.publish) ? raw.publish : {};
  const now = new Date().toISOString();
  const publish = {};
  for (const id of PLATFORMS) {
    const cell = src[id] && typeof src[id] === 'object' && !Array.isArray(src[id]) ? src[id] : {};
    let status = cell.status == null || cell.status === '' ? '草稿' : cell.status;
    if (typeof status !== 'string' || !catalog.publishStatus.includes(status)) throw new Error(`${id}的发布态只能是草稿、文案已交、已发、待复盘`);
    const pnotes = asText(cell.notes, 200, `${id}备注`);
    const old = prev?.publish?.[id];
    let updatedAt = asUpdatedAt(cell.updatedAt);
    if (stamp) {
      const changed = !old || old.status !== status || (old.notes || '') !== pnotes;
      updatedAt = changed ? (status === '草稿' && !pnotes && !old ? null : now) : asUpdatedAt(old?.updatedAt);
    }
    publish[id] = { status, notes: pnotes, updatedAt };
  }
  return {
    stage, owner, ownerLocked, ops, handoff, publish, notes,
    updatedAt: stamp ? now : asUpdatedAt(raw.updatedAt),
  };
}
export function opsForStage(stage) {
  return OPS_STAGES.has(stage) ? stage : null;
}
