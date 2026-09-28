"""中文（及其它语言）配音，基于 edge-tts（需联网）：
python core/tts/tts_zh.py lines.json out_dir

lines.json = [{"id": "l1", "text": "字幕文本", "say": "可选：朗读文本（数字写成汉字）",
               "voice": "zh-CN-YunxiNeural", "rate": "+0%", "pitch": "+0Hz"}, ...]
顶层也可以是 {"voice": "...", "rate": "...", "lines": [...]}，作为每句的默认值。

输出 out_dir/<id>.wav（48 kHz 单声道，去掉首尾静音）和 out_dir/dur.json。
文本和参数没变的句子不会重新合成（缓存键写在 out_dir/.cache.json）。
常用声音：zh-CN-YunxiNeural（男，叙述）、zh-CN-XiaoxiaoNeural（女，温暖）、zh-CN-YunjianNeural（男，浑厚）、
zh-CN-XiaoyiNeural（女，活泼）、en-US-AndrewNeural、en-US-AvaNeural。
商用前请确认微软的服务条款。"""
import asyncio, hashlib, json, os, subprocess, sys, tempfile
import numpy as np
import soundfile as sf

SR = 48000


def load(p):
    data = json.load(open(p, encoding='utf-8'))
    if isinstance(data, list): return {}, data
    return {k: v for k, v in data.items() if k != 'lines'}, data['lines']


def trim(a, sr):
    thr = max(np.abs(a).max() * .02, 1e-4); nz = np.where(np.abs(a) > thr)[0]
    if not len(nz): return a
    return a[max(0, nz[0] - int(.03 * sr)): nz[-1] + int(.1 * sr)]


async def synth(text, voice, rate, pitch, out_wav):
    import edge_tts
    with tempfile.TemporaryDirectory() as td:
        mp3 = os.path.join(td, 'a.mp3')
        for attempt in range(4):
            try:
                await edge_tts.Communicate(text, voice, rate=rate, pitch=pitch).save(mp3); break
            except Exception as e:
                if attempt == 3: raise
                print('  retry', e); await asyncio.sleep(2 ** attempt)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', mp3, '-ac', '1', '-ar', str(SR), out_wav], check=True)
    a, sr = sf.read(out_wav)
    sf.write(out_wav, trim(a, sr).astype(np.float32), sr)


async def main():
    if len(sys.argv) < 3: sys.exit(__doc__)
    defaults, lines = load(sys.argv[1]); out = sys.argv[2]
    os.makedirs(out, exist_ok=True)
    cache_p = os.path.join(out, '.cache.json')
    cache = json.load(open(cache_p)) if os.path.exists(cache_p) else {}
    dur = {}
    for L in lines:
        voice = L.get('voice', defaults.get('voice', 'zh-CN-YunxiNeural'))
        rate = L.get('rate', defaults.get('rate', '+0%')); pitch = L.get('pitch', defaults.get('pitch', '+0Hz'))
        text = L.get('say', L['text'])
        key = hashlib.sha1(json.dumps([text, voice, rate, pitch]).encode()).hexdigest()
        wav = os.path.join(out, L['id'] + '.wav')
        if cache.get(L['id']) != key or not os.path.exists(wav):
            await synth(text, voice, rate, pitch, wav); cache[L['id']] = key; tag = 'new '
        else:
            tag = 'keep'
        info = sf.info(wav); dur[L['id']] = round(info.frames / info.samplerate, 3)
        print(tag, L['id'], dur[L['id']], L['text'])
    json.dump(dur, open(os.path.join(out, 'dur.json'), 'w'), indent=1)
    json.dump(cache, open(cache_p, 'w'), indent=1)


asyncio.run(main())
