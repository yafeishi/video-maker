"""禁用词检查：python3 core/article/lint.py article.md  （命中则退出码 1）"""
import sys, re
BAN = '不仅 不只是 总而言之 综上所述 总的来说 值得一提的是 值得注意的是 让我们 一起来看看 赋能 抓手 闭环 底层逻辑 颗粒度 打通 助力 深耕 全方位 多维度 无缝 极致 革命性 颠覆 重磅 干货满满 建议收藏 不难发现 毋庸置疑 显而易见 至关重要 扮演着 新篇章 揭秘 一文读懂 宝子们 家人们 绝绝子 如图所示 笔者 小编 首先 其次 随着'.split()
t = open(sys.argv[1]).read(); body = re.sub(r'!\[[^]]*\]\([^)]*\)', '', t); bad = 0
for w in BAN:
    for m in re.finditer(re.escape(w), body): bad += 1; print(f'BAN {w}: …{body[max(0,m.start()-12):m.end()+12]}…'.replace('\n', ' '))
emo = re.findall(r'[\U0001F300-\U0001FAFF\u2600-\u27BF]', body); n_ex = body.count('！') + body.count('!')
if emo: bad += 1; print('EMOJI', ''.join(emo))
if n_ex > 2: bad += 1; print('感叹号过多', n_ex)
cn = len(re.findall(r'[\u4e00-\u9fff]', body)); print(f'OK 汉字 {cn}，禁用词/格式问题 {bad} 处' if not bad else f'FAIL {bad} 处，汉字 {cn}')
sys.exit(1 if bad else 0)
