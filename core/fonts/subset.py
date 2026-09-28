"""中文字体子集化：python core/fonts/subset.py <film> [--font core/fonts/src/NotoSansSC[wght].ttf] [--name NotoSansSC]
扫描影片目录下 .js / .json / .html 里出现的所有字符（加上 ASCII 和常用中文标点），
把完整字体裁成只含这些字的 woff2，写到 <film>/fonts/<name>.woff2（保留可变字重轴）。
改了文案之后重跑一次；build.sh 已经包含这一步。完整字体由 setup.sh 下载（OFL，不进 git）。"""
import os, sys
from fontTools import subset
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[1:]
def opt(k, d):
    if k in args: i = args.index(k); v = args[i + 1]; del args[i:i + 2]; return v
    return d
font = opt('--font', os.path.join(HERE, 'src', 'NotoSansSC[wght].ttf')); name = opt('--name', 'NotoSansSC')
if not args: sys.exit(__doc__)
film = args[0]
if not os.path.exists(font): sys.exit(f'missing {font}; run: sh setup.sh fonts')

chars = set(chr(c) for c in range(0x20, 0x7f)) | set('，。、；：？！“”‘’（）《》【】—…·「」〈〉％＋－×÷°')
for dp, dn, fn in os.walk(film):
    dn[:] = [d for d in dn if d not in ('out', 'stills', 'voices', 'node_modules', 'fonts')]
    for f in fn:
        if f.endswith(('.js', '.json', '.html', '.mjs')):
            chars |= set(open(os.path.join(dp, f), encoding='utf-8', errors='ignore').read())
chars = {c for c in chars if c.isprintable() and c not in '\t\r\n'}

tt = TTFont(font)
opts = subset.Options(); opts.flavor = 'woff2'; opts.layout_features = ['*']; opts.name_IDs = ['*']; opts.notdef_outline = True
sub = subset.Subsetter(opts); sub.populate(text=''.join(sorted(chars))); sub.subset(tt)
os.makedirs(os.path.join(film, 'fonts'), exist_ok=True)
out = os.path.join(film, 'fonts', name + '.woff2'); tt.flavor = 'woff2'; tt.save(out)
print(out, len(chars), 'chars', f'{os.path.getsize(out) / 1024:.0f} KB')
