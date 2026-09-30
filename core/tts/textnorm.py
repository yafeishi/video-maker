"""转写比对用的文本归一化：去标点、阿拉伯数字转汉字读法、中文按无声调拼音比较（装了 pypinyin 时）。
这样「帧 / 真」「它 / 他」「24 / 二十四」这类同音或写法差异不会被当成读错。"""
import re

try:
    from pypinyin import lazy_pinyin
except ImportError:
    lazy_pinyin = None

_D = '零一二三四五六七八九'


def _num(n):
    if n < 10: return _D[n]
    if n < 20: return '十' + (_D[n % 10] if n % 10 else '')
    if n < 100: return _D[n // 10] + '十' + (_D[n % 10] if n % 10 else '')
    if n < 1000: return _D[n // 100] + '百' + ('' if n % 100 == 0 else ('零' if n % 100 < 10 else '') + (_num(n % 100) if n % 100 >= 10 else _D[n % 10]))
    if n < 10000: return _D[n // 1000] + '千' + ('' if n % 1000 == 0 else ('零' if n % 1000 < 100 else '') + _num(n % 1000))
    return ''.join(_D[int(c)] for c in str(n))


# whisper 偶尔输出繁体；拼音库对个别繁体字给的是旧读音，这里先转成简体
TRAD = str.maketrans({'幀': '帧', '著': '着', '妳': '你', '祂': '他', '裡': '里', '後': '后', '乾': '干'})


def norm(s, zh=True):
    s = s.lower().translate(TRAD)
    if zh:
        s = re.sub(r'(\d{4})\s*(?=年)', lambda m: ''.join(_D[int(c)] for c in m[1]), s)
        s = re.sub(r'(\d+)\s*%', lambda m: '百分之' + _num(int(m[1])), s)
        s = re.sub(r'\d+', lambda m: _num(int(m[0])), s)
    s = re.sub(r'[\W_]+', '', s)
    if zh and lazy_pinyin: return ' '.join(lazy_pinyin(s))
    return s


def _tokens(s, zh):
    n = norm(s, zh)
    return n.split(' ') if zh and lazy_pinyin else list(n)


def _dist(a, b):
    row = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        prev, row[0] = row[0], i
        for j, y in enumerate(b, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (x != y))
    return row[-1]


def compare(got, want, zh=True):
    """'OK' 完全一致；'NEAR' 只差一两个音节（多半是识别模型听错，人耳听一下即可）；'DIFF' 对不上。"""
    a, b = _tokens(got, zh), _tokens(want, zh)
    if a == b: return 'OK'
    return 'NEAR' if _dist(a, b) <= max(1, len(b) // 12) else 'DIFF'
