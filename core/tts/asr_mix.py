"""成片混音里的配音可懂度检查（可选，需 faster-whisper）：
python core/tts/asr_mix.py <film>/out/mix.wav <film>/events.json [--model small]
按 events.json 里每个 voice 事件截出混音片段（前后各留 0.4 s）转写，与对应字幕比较。
音乐或音效把某句盖住时会显示 DIFF。"""
import sys, json, re
import numpy as np, soundfile as sf
from scipy.signal import resample_poly
from faster_whisper import WhisperModel
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from textnorm import norm

args = sys.argv[1:]; model = 'small'
if '--model' in args: i = args.index('--model'); model = args[i + 1]; del args[i:i + 2]
if len(args) < 2: sys.exit(__doc__)
y, sr = sf.read(args[0]); y = y.mean(1) if y.ndim > 1 else y
y = resample_poly(y, 16000, sr).astype(np.float32)
ev = json.load(open(args[1], encoding='utf-8'))
cues = ev.get('cues', [])
m = WhisperModel(model, device='cpu', compute_type='int8')
bad = 0
for e in (x for x in ev['ev'] if x['type'] == 'voice'):
    want = next((c['text'] for c in cues if abs(c['t0'] - e['t']) < .05), e['id'])
    a, b = max(0, int((e['t'] - .4) * 16000)), int((e['t'] + e.get('d', 2) + .4) * 16000)
    lang = 'zh' if re.search(r'[\u4e00-\u9fff]', want) else 'en'
    segs, _ = m.transcribe(y[a:b], beam_size=5, language=lang, initial_prompt='以下是普通话的句子。' if lang == 'zh' else None)
    got = ''.join(s.text.strip() for s in segs)
    ok = norm(got, lang == 'zh') == norm(want, lang == 'zh'); bad += not ok
    print(('OK  ' if ok else 'DIFF'), f"{e['t']:6.2f}", want, '→', got)
print('mismatches:', bad)
