// 数据驱动镜头（core/deck.js）的镜头类型表。core/deck.js 按它排时间，tools/check-lines.mjs 按它检查 lines.json。
// 字段类型：str 文字、num 数字（或数字字符串）、strs 文字列表、events 时间线条目、bars 柱状图条目；带 ! 的必填。
// max：显示文字的建议最多字数（超了会自动缩小字号，但读起来吃力）；items：条目数上下限。
// music：配乐角色（core/audio/deck.py）：calm 安静铺垫、hit 静默后砸下、groove 律动（越往后越满）、finale 收束高潮。
export const BPM = 100, BEAT = 60 / BPM;

export const KINDS = {
  title: {
    zh: '片名卡', beats: 8, first: 1.0, music: 'calm',
    fields: { title: 'str!', kicker: 'str', sub: 'str' },
    max: { title: 10, kicker: 20, sub: 24 },
  },
  question: {
    zh: '问题', beats: 8, first: 1.2, music: 'calm',
    fields: { big: 'str', sub: 'str' },
    max: { big: 12, sub: 24 },
  },
  answer: {
    zh: '一句话答案', beats: 8, first: .5, music: 'hit',
    fields: { big: 'str!', hit: 'str', unit: 'str', tag: 'str' },
    max: { big: 6, unit: 8, tag: 10 },
  },
  stat: {
    zh: '大数字', beats: 8, first: .5, music: 'hit',
    fields: { value: 'num!', unit: 'str', label: 'str', hit: 'str' },
    max: { unit: 8, label: 22 },
  },
  point: {
    zh: '要点', beats: 10, first: .7, music: 'groove',
    fields: { title: 'str!', kicker: 'str', items: 'strs' },
    max: { title: 12, kicker: 8, items: 16 }, items: [0, 3],
  },
  timeline: {
    zh: '时间线', beats: 12, first: .7, music: 'groove', tail: 2.8,
    fields: { title: 'str', items: 'events!' },
    max: { title: 14, year: 6, label: 9 }, items: [2, 8],
  },
  bars: {
    zh: '柱状图', beats: 12, first: .7, music: 'groove', tail: 1.6,
    fields: { title: 'str', unit: 'str', highlight: 'str', items: 'bars!' },
    max: { title: 14, unit: 16, label: 6 }, items: [2, 8],
  },
  quote: {
    zh: '引语', beats: 8, first: .6, music: 'calm',
    fields: { quote: 'str!', by: 'str' },
    max: { quote: 40, by: 24 },
  },
  recap: {
    zh: '收束', beats: 12, first: 2 * BEAT + .5, music: 'finale',
    fields: { title: 'str!', sub: 'str' },
    max: { title: 10, sub: 24 },
  },
};

// 一句台词在字幕里一行放得下的字数
export const CAPTION_MAX = 34;
