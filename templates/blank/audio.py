"""空白模板的混音：一层和弦垫 + 事件音效 + 配音，音乐在配音下自动闪避。
在影片目录里运行：python audio.py（build.sh 的 audio 步骤会调用）→ out/mix.wav
要写真正的配乐，参考 templates/keynote/audio.py（按镜头分段、鼓组、贝斯、琶音）。"""
import json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.environ.get('WORKBENCH_ROOT') or os.path.abspath(os.path.join(HERE, '..', '..')))
from core.audio import sfx, synth as S
from core.audio.mix import Bus, load_wav, compress, limit, duck_curve, write

BPM = 90; BEAT = 60 / BPM
data = json.load(open(os.path.join(HERE, 'events.json'), encoding='utf-8'))
DUR, EV = data['dur'], data['ev']

music = Bus(DUR + 3)
PROG = ['Cmaj7', 'Am7', 'Fmaj7', 'G6']
bar = 4 * BEAT
for k in range(int(DUR / bar) + 1):
    music.add(S.pad(S.chord(PROG[k % 4], 3), bar, v=.3), k * bar)

fx = Bus(DUR + 3)
for e in EV:
    if e['type'] == 'sfx':
        fx.add(sfx.make(e['name'], **({'d': e['d']} if 'd' in e else {})), e['t'], gain=e.get('gain', 1) * .6, pan=e.get('pan', 0))

vo = Bus(DUR + 3); spans = []
for e in EV:
    p = os.path.join(HERE, 'voices', f"{e.get('id')}.wav")
    if e['type'] == 'voice' and os.path.exists(p):
        y = load_wav(p); vo.add(y, e['t']); spans.append((e['t'], e['t'] + len(y) / 48000))

vox = compress(np.asarray(vo), thresh_db=-22, ratio=3.5, makeup_db=4)
master = np.asarray(music) * .35 * duck_curve(spans, DUR + 3)[:len(vox)] + np.asarray(fx) + vox
master = master[:int((DUR + .5) * 48000)]
master = limit(master / max(1e-9, np.abs(master).max()) * .7, ceiling_db=-1.5)
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
write(os.path.join(HERE, 'out', 'mix.wav'), master)
