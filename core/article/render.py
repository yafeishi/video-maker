"""article.md → 可直接粘贴进公众号编辑器的 article.html（全部内联样式，图片相对路径 img/）。
python3 core/article/render.py <run>/article/article.md
约定：# 标题；> 引用=金句（下一行 —— 讲者）；图片下一行以 ▲ 开头=图注；## 小标题。"""
import sys, re, html, os
md = open(sys.argv[1]).read().strip().split('\n'); out = []; title = ''
ACC = '#b8860b'  # 唯一强调色：只给小标题和金句
P = 'margin:0 0 1.5em;font-size:16px;line-height:1.75;color:#333;letter-spacing:0.3px;text-align:justify'
def inl(s): return re.sub(r'\*\*(.+?)\*\*', r'<strong style="color:#222">\1</strong>', html.escape(s))
i = 0
while i < len(md):
    l = md[i].rstrip()
    if l.startswith('# '): title = l[2:]; out.append(f'<h1 style="font-size:22px;line-height:1.4;color:#222;margin:0 0 0.6em">{inl(title)}</h1>')
    elif l.startswith('## '): out.append(f'<h2 style="font-size:18px;color:#222;margin:2em 0 1em;padding-left:10px;border-left:3px solid '+ACC+'">{inl(l[3:])}</h2>')
    elif m := re.match(r'!\[(.*?)\]\((.+?)\)', l): out.append(f'<p style="margin:1.5em 0 0.4em"><img src="{m[2]}" alt="{html.escape(m[1])}" style="display:block;width:100%;height:auto"></p>')
    elif l.startswith('^^'): out.append(f'<p style="margin:0 0 1.8em;font-size:12px;line-height:1.6;color:#999">{inl(l[2:].strip())}</p>')
    elif l.startswith('▲'): out.append(f'<p style="margin:0 0 1.6em;font-size:12px;line-height:1.6;color:#999;text-align:center">{inl(l)}</p>')
    elif l.startswith('>'):
        q = []
        while i < len(md) and md[i].startswith('>'): q.append(inl(md[i].lstrip('> ').strip())); i += 1
        out.append('<blockquote style="margin:1.8em 0;padding:0.2em 0 0.2em 14px;border-left:3px solid '+ACC+'">' + ''.join(
            f'<p style="margin:0.3em 0;font-size:15px;line-height:1.75;color:{"#999" if x.startswith("——") else ACC}">{x}</p>' for x in q) + '</blockquote>'); continue
    elif l.startswith('- '):
        it = []
        while i < len(md) and md[i].startswith('- '): it.append(f'<li style="margin:0.4em 0">{inl(md[i][2:])}</li>'); i += 1
        out.append(f'<ul style="margin:0 0 1.5em;padding-left:1.2em;font-size:16px;line-height:1.75;color:#333">' + ''.join(it) + '</ul>'); continue
    elif l.startswith('<!--'): pass
    elif l.strip(): out.append(f'<p style="{P}">{inl(l)}</p>')
    i += 1
body = '\n'.join(out)
import shutil
src = open(sys.argv[1]).read(); cm = re.search(r'<!--\s*cover:\s*(\S+)\s*-->', src) or re.search(r'!\[[^]]*\]\((\S+?)\)', src)
d = os.path.dirname(os.path.abspath(sys.argv[1]))
if cm: shutil.copy(os.path.join(d, cm[1]), os.path.join(d, 'cover.jpg')); print('cover', cm[1])
doc = f'''<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>{html.escape(title)}</title></head>
<body style="margin:0;background:#ededed"><div style="max-width:640px;margin:0 auto;background:#fff;padding:24px 12px 48px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif">
<!-- 复制下面 section 内容粘贴到公众号编辑器 -->
<section id="wx">{body}</section></div></body></html>'''
open(os.path.join(os.path.dirname(sys.argv[1]), 'article.html'), 'w').write(doc); print('ok', len(out), 'blocks')
