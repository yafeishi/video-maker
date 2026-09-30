"""配音自检（可选，需 pip install faster-whisper）：python core/tts/asr_check.py lines.json voices_dir [--model small]
逐句转写并与原文对比（忽略标点；中文按无声调拼音比较，同音字不算错，需 pypinyin；只差一两个音节记为 NEAR，不算错）；前后补 0.6 s 静音再转写，短句不补容易听错。
lines.json 里可加 "asr" 字段覆盖期望文本（专有名词、拟声词）。
输出 voices_dir/words.json：逐词时间戳（口型、断句用）。"""
import sys, json, re, os
import numpy as np, soundfile as sf
from scipy.signal import resample_poly
from faster_whisper import WhisperModel
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from textnorm import compare

args = sys.argv[1:]; model = 'small'
if '--model' in args: i = args.index('--model'); model = args[i + 1]; del args[i:i + 2]
if len(args) < 2: sys.exit(__doc__)
data = json.load(open(args[0], encoding='utf-8')); lines = data['lines'] if isinstance(data, dict) else data
m = WhisperModel(model, device='cpu', compute_type='float32')
bad, near, words = 0, 0, {}
for L in lines:
    y, sr = sf.read(os.path.join(args[1], L['id'] + '.wav'))
    if y.ndim > 1: y = y.mean(1)
    y = resample_poly(y, 16000, sr); pad = np.zeros(int(.6 * 16000))
    lang = 'zh' if re.search(r'[\u4e00-\u9fff]', L['text']) else 'en'
    segs, _ = m.transcribe(np.concatenate([pad, y, pad]).astype(np.float32), beam_size=5, language=lang, word_timestamps=True,
                          temperature=0, condition_on_previous_text=False,
                          initial_prompt='以下是普通话的句子。' if lang == 'zh' else None)
    segs = list(segs); got = ''.join(s.text.strip() for s in segs)
    words[L['id']] = [(w.word.strip(), round(w.start - .6, 3), round(w.end - .6, 3)) for s in segs for w in s.words]
    want = L.get('asr', L['text']); r = compare(got, want, lang == 'zh'); bad += r == 'DIFF'; near += r == 'NEAR'
    print(r.ljust(4), L['id'], '|', want, '→', got)
json.dump(words, open(os.path.join(args[1], 'words.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('mismatches:', bad, ' near:', near)
