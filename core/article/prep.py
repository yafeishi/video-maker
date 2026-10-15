"""视频 → 文章素材：下载/字幕/转写/镜头检测/候选帧。
python3 core/article/prep.py <url|file> <run_dir>
产出：video.mp4 transcript.srt transcript.txt([mm:ss] 文本) scenes.json contact.jpg meta.json"""
import sys, os, json, subprocess, glob, re
src, out = sys.argv[1], os.path.abspath(sys.argv[2]); os.makedirs(out, exist_ok=True); os.chdir(out)
def sh(*a, check=True): subprocess.run(a, check=check)
meta = {}
if re.match(r'https?://', src):
    if not os.path.exists('video.mp4'):
        sh('yt-dlp', '-q', '--no-warnings', '--js-runtimes', 'node', '-f', 'bv*[vcodec^=avc1][height<=720]+ba[ext=m4a]/b[vcodec^=avc1]/bv*[height<=720]+ba',
           '--merge-output-format', 'mp4', '-o', 'video.%(ext)s', '--write-subs', '--write-auto-subs',
           '--sub-langs', os.environ.get('SUB_LANGS','en'), '--ignore-errors', '--convert-subs', 'srt', '--write-info-json', src, check=False)
elif not os.path.exists('video.mp4'):
    os.symlink(os.path.abspath(src), 'video.mp4')
if os.path.exists('video.info.json'):
    info = json.load(open('video.info.json')); meta = {k: info.get(k) for k in ('title', 'uploader', 'upload_date', 'duration', 'webpage_url')}
subs = sorted(glob.glob('video.*.srt'))
if subs and not os.path.exists('transcript.srt'): os.rename(subs[0], 'transcript.srt'); meta['transcript'] = 'subtitles'
if not os.path.exists('transcript.srt'):
    from faster_whisper import WhisperModel
    segs, _ = WhisperModel(os.environ.get('WHISPER_MODEL', 'small'), device='cpu', compute_type='int8').transcribe('video.mp4', vad_filter=True)
    f = lambda t: '%02d:%02d:%02d,%03d' % (t // 3600, t % 3600 // 60, t % 60, t * 1000 % 1000)
    with open('transcript.srt', 'w') as o:
        for i, s in enumerate(segs, 1): o.write(f'{i}\n{f(s.start)} --> {f(s.end)}\n{s.text.strip()}\n\n')
    meta['transcript'] = 'whisper'
# srt → 去重的 [mm:ss] 文本（自动字幕会滚动重复）
lines, last = [], ''
for blk in open('transcript.srt').read().split('\n\n'):
    p = blk.strip().split('\n')
    if len(p) < 3: continue
    h, m, s = p[1][:8].split(':'); t = int(h) * 3600 + int(m) * 60 + int(s)
    for txt in p[2:]:
        txt = re.sub(r'<[^>]+>', '', txt).replace('\\h', ' ').strip()
        if txt and txt != last and txt not in last: lines.append(f'[{t//60:02d}:{t%60:02d}] {txt}'); last = txt
open('transcript.txt', 'w').write('\n'.join(lines))
from scenedetect import detect, ContentDetector
sc = [(a.seconds, b.seconds) for a, b in detect('video.mp4', ContentDetector(threshold=27))]
json.dump(sc, open('scenes.json', 'w'))
if len(sc) < 20:  # 动画/长镜头视频镜头切换少：退化为每 N 秒取样
    import math; dur = float(subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0','video.mp4'],capture_output=True,text=True).stdout); st = max(8, dur / 72)
    sc = [(i * st, (i + 1) * st) for i in range(int(dur // st))]
# 联系表：每个镜头中点一帧，带时间，便于挑图
import shutil; shutil.rmtree('cand', ignore_errors=True); os.makedirs('cand')
for a, b in sc[:120]:
    t = (a + b) / 2; sh('ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.2f}', '-i', 'video.mp4', '-frames:v', '1', '-vf',
                       f"scale=320:-2,drawtext=text='{int(t)//60:02d}\\:{int(t)%60:02d}':x=6:y=6:fontsize=22:fontcolor=yellow:box=1:boxcolor=black", f'cand/{t:07.2f}.jpg')
c = sorted(glob.glob('cand/*.jpg'))
if c: sh('ffmpeg', '-v', 'error', '-y', '-pattern_type', 'glob', '-i', 'cand/*.jpg', '-vf', 'tile=6x%d' % ((len(c) + 5) // 6), '-frames:v', '1', 'contact.jpg')
meta['scenes'] = len(sc); json.dump(meta, open('meta.json', 'w'), ensure_ascii=False, indent=1); print(json.dumps(meta, ensure_ascii=False))
