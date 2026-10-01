import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { generate } from '../core/publish/copy.mjs';
import { catalog, defaultOwner, defaultStatus, lineDefaults, normalizeBrief, normalizeStatus } from './config.mjs';

const kepu = lineDefaults('科普');
const puff = lineDefaults('泡芙');

test('科普默认是 danghb-kepu + 云扬 -5% + Hobson 水印', () => {
  const b = normalizeBrief({ line: '科普' });
  assert.equal(b.stylePack, 'danghb-kepu');
  assert.equal(b.style, '动画讲解');
  assert.equal(b.voice, 'zh-CN-YunyangNeural');
  assert.equal(b.voiceRate, '-5%');
  assert.equal(b.watermark, 'Hobson 小党');
  assert.equal(b.aspect, '9:16');
  assert.equal(kepu.voice, b.voice);
});

test('泡芙默认不定云扬、不打 Hobson 水印，定版只有日常和出行墨镜', () => {
  const b = normalizeBrief({ line: '泡芙' });
  assert.equal(b.stylePack, 'puff-daily');
  assert.equal(b.style, '定版日常');
  assert.equal(b.puffPreset, '定版日常');
  assert.notEqual(b.voice, 'zh-CN-YunyangNeural');
  assert.equal(b.voice, puff.voice);
  assert.equal(b.voice, 'zh-CN-XiaoxiaoNeural');
  assert.notEqual(b.voiceRate, '-5%');
  assert.equal(b.watermark, '');
  assert.equal(b.character, '比熊泡芙');
  const ids = catalog.stylePacks.filter(p => p.line === '泡芙').map(p => p.style);
  assert.deepEqual(ids, ['定版日常', '出行墨镜']);
});

test('两条线的风格包不混用', () => {
  const science = new Set(catalog.stylePacks.filter(p => p.line === '科普').map(p => p.id));
  const pets = new Set(catalog.stylePacks.filter(p => p.line === '泡芙').map(p => p.id));
  for (const id of science) assert.equal(pets.has(id), false);
  assert.throws(() => normalizeBrief({ line: '泡芙', style: '动画讲解' }), /泡芙不能用科普风格/);
  assert.throws(() => normalizeBrief({ line: '科普', puffPreset: '定版日常' }), /不要带泡芙定版/);
  assert.throws(() => normalizeBrief({ line: '泡芙', stylePack: 'danghb-kepu' }), /定版日常/);
  assert.throws(() => normalizeBrief({ line: '泡芙', watermark: 'Hobson 小党' }), /水印/);
});

test('风格、音色、语速、水印、画幅可以分开改，旧风格名仍能读', () => {
  const b = normalizeBrief({
    line: '科普', style: '纪录片旁白', voice: 'zh-CN-YunxiNeural', voiceRate: '+5%',
    watermark: '', aspect: '16:9', topic: '旧片',
  });
  assert.equal(b.stylePack, 'doc-narration');
  assert.equal(b.style, '纪录片旁白');
  assert.equal(b.voice, 'zh-CN-YunxiNeural');
  assert.equal(b.voiceRate, '+5%');
  assert.equal(b.watermark, '');
  assert.equal(b.aspect, '16:9');
  const legacy = normalizeBrief({ line: '科普', style: '动画讲解' });
  assert.equal(legacy.stylePack, 'danghb-kepu');
  assert.equal(legacy.voice, 'zh-CN-YunyangNeural');
});

test('泡芙可以手选云扬，但那不是默认', () => {
  const b = normalizeBrief({ line: '泡芙', stylePack: 'puff-sunglasses', voice: 'zh-CN-YunyangNeural', voiceRate: '-5%' });
  assert.equal(b.style, '出行墨镜');
  assert.equal(b.voice, 'zh-CN-YunyangNeural');
  assert.notEqual(puff.voice, 'zh-CN-YunyangNeural');
});

test('目录里云扬标成科普默认', () => {
  const yunyang = catalog.voices.find(v => v.id === 'zh-CN-YunyangNeural');
  const puffVoice = catalog.voices.find(v => v.puffDefault);
  assert.equal(yunyang.scienceDefault, true);
  assert.notEqual(puffVoice.id, yunyang.id);
  assert.equal(catalog.copyTemplates['科普'].X.id, 'kepu-x');
  assert.equal(catalog.copyTemplates['泡芙'].X.id, 'puff-x');
  assert.notEqual(catalog.copyTemplates['科普'].X.note, catalog.copyTemplates['泡芙'].X.note);
});

test('任务阶段按线路给责任人，发布态不代填播放数', () => {
  const kepuTask = defaultStatus('科普');
  const puffTask = defaultStatus('泡芙');
  assert.equal(kepuTask.stage, '选题');
  assert.equal(kepuTask.owner, '总管家');
  assert.equal(puffTask.owner, '泡芙');
  assert.equal(kepuTask.ops, '未交审');
  assert.equal(kepuTask.publish['视频号'].status, '草稿');
  assert.equal(kepuTask.publish['视频号'].notes, '');
  assert.equal(kepuTask.publish.X.notes, '');
  assert.equal(defaultOwner('制作', '科普'), '视频制作');
  assert.equal(defaultOwner('交审', '泡芙'), '自媒体运营');
  assert.equal(defaultOwner('改点中', '科普'), '自媒体运营');
  assert.equal(defaultOwner('拷发就绪', '泡芙'), '用户');
  assert.equal(defaultOwner('待复盘', '科普'), '用户');
  const saved = normalizeStatus({
    stage: '交审', owner: '自媒体运营', ops: '交审',
    publish: { '视频号': { status: '文案已交', notes: '用户贴：播放 1200' }, X: { status: '草稿', notes: '' } },
  }, { line: '科普', stamp: true });
  assert.equal(saved.publish['视频号'].notes, '用户贴：播放 1200');
  assert.equal(saved.publish['抖音'].status, '草稿');
  assert.equal(saved.publish['抖音'].notes, '');
  assert.ok(saved.publish['视频号'].updatedAt);
  assert.equal(saved.publish['抖音'].updatedAt, null);
});

test('手改的责任人会留下，未知阶段会被拒绝', () => {
  const saved = normalizeStatus({ stage: '分镜', owner: '阿宁', ownerLocked: true, ops: '改点中' }, { line: '科普' });
  assert.equal(saved.owner, '阿宁');
  assert.equal(saved.ownerLocked, true);
  assert.equal(saved.ops, '改点中');
  assert.throws(() => normalizeStatus({ stage: '已上线' }, { line: '科普' }), /生命周期/);
  assert.throws(() => normalizeStatus({ publish: { X: { status: '已代发' } } }, { line: '泡芙' }), /发布态/);
});

function filmDir(brief) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>门口那只</title>');
  fs.writeFileSync(path.join(dir, 'lines.json'), JSON.stringify({ lines: [{ text: '它在门口等你。' }] }));
  if (brief) fs.writeFileSync(path.join(dir, 'brief.json'), JSON.stringify(brief));
  return dir;
}

test('视频号和 X 的文案模板按线路分开，且不写播放数', () => {
  const plain = generate(filmDir(null));
  const science = generate(filmDir({ line: '科普', stylePack: 'danghb-kepu' }));
  const pet = generate(filmDir({ line: '泡芙', stylePack: 'puff-daily' }));
  const pick = (data, id) => data.platforms.find(p => p.id === id);
  assert.equal(pick(plain, 'x').template, 'x');
  assert.equal(pick(science, 'channels').template, 'kepu-channels');
  assert.equal(pick(science, 'x').template, 'kepu-x');
  assert.match(pick(science, 'x').notes.join('\n'), /科普 X/);
  assert.match(pick(science, 'x').body, /explainer|short/i);
  assert.doesNotMatch(pick(science, 'x').body, /pet short/);
  assert.equal(pick(pet, 'channels').template, 'puff-channels');
  assert.equal(pick(pet, 'x').template, 'puff-x');
  assert.match(pick(pet, 'channels').body, /^泡芙｜/);
  assert.match(pick(pet, 'x').body, /pet short/);
  assert.match(pick(pet, 'x').notes.join('\n'), /宠物钩子/);
  for (const data of [plain, science, pet]) {
    for (const p of data.platforms) assert.doesNotMatch(p.body, /播放|曝光|万/);
  }
});
