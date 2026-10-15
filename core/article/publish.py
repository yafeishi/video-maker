"""发布一篇已存在的草稿（freepublish/submit）。必须显式给 media_id 和 --confirm，不在默认流程里。绝不群发。
python3 core/article/publish.py <draft_media_id> --confirm"""
import sys, os, time, json, requests
if len(sys.argv) < 3 or sys.argv[2] != '--confirm': sys.exit('需要: publish.py <media_id> --confirm（每篇发布前须用户单独同意）')
mid = sys.argv[1]
env = dict(l.strip().split('=', 1) for l in open(os.path.expanduser('~/.secrets/wechat_mp.env')) if '=' in l and not l.startswith('#'))
API = 'https://api.weixin.qq.com/cgi-bin'
j = requests.post(f'{API}/stable_token', json={'grant_type': 'client_credential', 'appid': env['WECHAT_APPID'], 'secret': env['WECHAT_APPSECRET']}, timeout=20).json()
if 'access_token' not in j: sys.exit(f'token 失败 {j.get("errcode")} {j.get("errmsg")}')
tok = j['access_token']
r = requests.post(f'{API}/freepublish/submit?access_token={tok}', json={'media_id': mid}, timeout=30).json()
print('submit', json.dumps(r, ensure_ascii=False))
if r.get('errcode'): sys.exit(1)
pid = r['publish_id']
for _ in range(40):
    time.sleep(6)
    g = requests.post(f'{API}/freepublish/get?access_token={tok}', json={'publish_id': pid}, timeout=30).json()
    st = g.get('publish_status')
    if st in (1,): continue  # 发布中
    print('get', json.dumps(g, ensure_ascii=False)); break
else: print('超时仍在发布中 publish_id', pid)
