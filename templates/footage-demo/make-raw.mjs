// 生成四条色块小样到 raw/，让素材流程不用手机视频也能跑通。
// 已经有 mp4 就不动。换成实拍时，删掉这些文件，把视频放进 films/<片名>/raw/，不要堆在模板里。
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const raw = path.join(dir, 'raw');
fs.mkdirSync(raw, { recursive: true });
const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const hasFont = fs.existsSync(font);

const clips = [
  { file: 'clip-01.mp4', colors: ['0xC4493A', '0xE28A3A', '0xF2C14E'], speeds: [18, 46, 28], freq: 196, label: '1', gap: null },
  { file: 'clip-02.mp4', colors: ['0x1F6F6A', '0x2F6F8F', '0x7BA38A'], speeds: [36, 90, 24], freq: 247, label: '2', gap: [11, 12.2] },
  { file: 'clip-03.mp4', colors: ['0x5C3D8F', '0xC43D6E', '0xE8E4DC'], speeds: [70, 22, 110], freq: 330, label: '3', gap: null },
  { file: 'clip-04.mp4', colors: ['0x243044', '0xD06A2B', '0xE7B7A5'], speeds: [20, 55, 40], freq: 415, label: '4', gap: null },
];

const ready = clips.every(c => {
  const p = path.join(raw, c.file);
  return fs.existsSync(p) && fs.statSync(p).size > 10000;
});
if (ready) {
  console.log('raw/ 里已有四条小样。换成别的素材前先删掉这些 mp4。');
  process.exit(0);
}

function gen(clip) {
  const args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y'];
  const chains = [];
  clip.colors.forEach((color, i) => {
    args.push('-f', 'lavfi', '-i', `color=c=${color}:s=1280x720:r=24:d=8,format=yuv420p`);
    args.push('-f', 'lavfi', '-i', 'color=c=white:s=150x84:r=24:d=8,format=yuv420p');
    const dt = hasFont
      ? `,drawtext=fontfile=${font}:text=${clip.label}${['A', 'B', 'C'][i]}:fontsize=64:fontcolor=white:borderw=4:bordercolor=0x000000:x=40:y=36`
      : '';
    chains.push(`[${i * 2}:v][${i * 2 + 1}:v]overlay=x='24+${clip.speeds[i]}*t':y=${70 + i * 36}:shortest=1${dt}[v${i}]`);
  });
  args.push('-f', 'lavfi', '-i', `sine=frequency=${clip.freq}:sample_rate=48000:duration=24`);
  const aIn = clip.colors.length * 2;
  const audio = clip.gap
    ? `[${aIn}:a]asplit=3[s0][s1][s2];[s0]atrim=0:${clip.gap[0]},asetpts=PTS-STARTPTS[a0];[s1]atrim=0:${(clip.gap[1] - clip.gap[0]).toFixed(3)},volume=0,asetpts=PTS-STARTPTS[a1];[s2]atrim=0:${(24 - clip.gap[1]).toFixed(3)},asetpts=PTS-STARTPTS[a2];[a0][a1][a2]concat=n=3:v=0:a=1,volume=0.16[a]`
    : `[${aIn}:a]volume=0.16[a]`;
  const fc = [...chains, '[v0][v1][v2]concat=n=3:v=1:a=0[v]', audio].join(';');
  args.push('-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(raw, clip.file));
  console.log('生成', clip.file);
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

for (const clip of clips) gen(clip);
console.log('raw/ 四条色块小样（约 96 秒）。真素材放到 films/<片名>/raw/，不要提交进模板。');
