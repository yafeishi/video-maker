"""把 article.html 存进公众号草稿箱（只建草稿，绝不调用 freepublish / 群发）。
python3 core/article/draft.py <run>/article [--author Hobson小党] [--source-url URL]
凭据：~/.secrets/wechat_mp.env（WECHAT_APPID / WECHAT_APPSECRET），不打印。"""
import sys, os, re, json, requests
d = os.path.abspath(sys.argv[1]); a = sys.argv[2:]
opt = lambda k, dv: a[a.index(k) + 1] if k in a else dv
env = dict(l.strip().split('=', 1) for l in open(os.path.expanduser('~/.secrets/wechat_mp.env')) if '=' in l and not l.startswith('#'))
API = 'https://api.weixin.qq.com/cgi-bin'
def chk(r, what):
    j = r.json()
    if j.get('errcode'): sys.exit(f'{what} 失败 errcode={j["errcode"]} errmsg={j.get("errmsg")}')
    return j
tok = chk(requests.post(f'{API}/stable_token', json={'grant_type': 'client_credential', 'appid': env['WECHAT_APPID'], 'secret': env['WECHAT_APPSECRET']}, timeout=20), 'token')['access_token']
html = open(f'{d}/article.html').read(); md = open(f'{d}/article.md').read()
body = re.search(r'<section id="wx">(.*)</section></div>', html, re.S)[1]
for src in sorted(set(re.findall(r'<img src="(img/[^"]+)"', body))):
    with open(f'{d}/{src}', 'rb') as f:
        url = chk(requests.post(f'{API}/media/uploadimg?access_token={tok}', files={'media': (os.path.basename(src), f, 'image/jpeg')}, timeout=60), 'uploadimg ' + src)['url']
    body = body.replace(f'src="{src}"', f'src="{url}"'); print('img ok', src)
body = re.sub(r'<h1[^>]*>.*?</h1>', '', body, count=1, flags=re.S)  # 标题由 title 字段给
with open(f'{d}/cover.jpg', 'rb') as f:
    thumb = chk(requests.post(f'{API}/material/add_material?access_token={tok}&type=image', files={'media': ('cover.jpg', f, 'image/jpeg')}, timeout=60), 'cover')['media_id']
print('cover ok')
title = re.search(r'^# (.+)$', md, re.M)[1].strip()
src_url = opt('--source-url', (re.search(r'(https?://\S+|youtube\.com/watch\?v=[\w-]+)', md) or [''])[0])
if src_url and not src_url.startswith('http'): src_url = 'https://www.' + src_url
paras = [re.sub(r'!\[.*?\]\(.*?\)', '', l).strip() for l in md.split('\n') if l.strip() and not re.match(r'[#>!▲^<-]', l.strip())]
digest = paras[0][:54] if paras else ''
art = {'title': title, 'author': opt('--author', 'Hobson小党'), 'digest': digest, 'content': body,
       'content_source_url': src_url, 'thumb_media_id': thumb, 'need_open_comment': 1, 'only_fans_can_comment': 0}
r = requests.post(f'{API}/draft/add?access_token={tok}', data=json.dumps({'articles': [art]}, ensure_ascii=False).encode(), headers={'Content-Type': 'application/json'}, timeout=60)
mid = chk(r, 'draft/add')['media_id']; json.dump({'draft_media_id': mid, 'thumb_media_id': thumb, 'title': title}, open(f'{d}/draft.json', 'w'), ensure_ascii=False)
print('draft media_id', mid)
