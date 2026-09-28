"""导出字幕：python core/render/srt.py <events.json | cues.json> out.srt
输入可以是 events.mjs 导出的 events.json（读其中的 cues），也可以直接是 [{"t0", "t1", "text"}] 列表。
重叠的相邻字幕自动截断到下一条开始。"""
import sys, json

if len(sys.argv) < 3: sys.exit(__doc__)
data = json.load(open(sys.argv[1], encoding='utf-8'))
cues = sorted(data['cues'] if isinstance(data, dict) else data, key=lambda c: c['t0'])
for k in range(len(cues) - 1): cues[k]['t1'] = min(cues[k]['t1'], cues[k + 1]['t0'])


def fmt(s):
    ms = int(round(s * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


out = '\n'.join(f"{k + 1}\n{fmt(c['t0'])} --> {fmt(c['t1'])}\n{c['text']}\n" for k, c in enumerate(cues))
open(sys.argv[2], 'w', encoding='utf-8').write(out); print(sys.argv[2], len(cues), 'cues')
