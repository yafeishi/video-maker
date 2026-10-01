// 给影片打开「结尾互动」：node tools/add-cta.mjs films/<片名>
// 在 lines.json 里写入默认的 "cta" 块和 cta1 / cta2 两句台词（已有的不覆盖）。之后按题目改问题和选项。
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { CTA_DEFAULT } from '../core/cta.js';

export function addCTA(filmDir) {
  const p = path.join(filmDir, 'lines.json');
  const doc = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { lines: [] };
  const lines = Array.isArray(doc) ? doc : (doc.lines ||= []);
  const out = Array.isArray(doc) ? { lines } : doc;
  out.cta ||= structuredClone(CTA_DEFAULT.cta);
  for (const L of CTA_DEFAULT.lines) if (!lines.some(x => x.id === L.id)) lines.push({ ...L });
  fs.writeFileSync(p, JSON.stringify(out, null, 2) + '\n');
  return p;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(path.join(dir, 'index.html'))) { console.error('用法：node tools/add-cta.mjs films/<片名>'); process.exit(2); }
  console.log('✓ 结尾互动已打开：' + addCTA(dir) + '（改 "cta" 里的问题和选项，以及 cta1 / cta2 两句台词）');
}
