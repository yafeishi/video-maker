# video-maker 云电脑部署说明

Path: `/workspace/video-maker`

## 当前地址

| 类型 | URL |
|------|-----|
| **公网 HTTPS（固定）** | https://video.danghb.cn |
| 本机 | http://127.0.0.1:4400 |
| 监听 | `0.0.0.0:4400`（`STUDIO_HOST` / `STUDIO_PORT`） |

公网经 Cloudflare **命名隧道** `video-workbench`（id `ced49ad4-e91e-4a31-83a7-8b4c2bce0055`），主机名 `video.danghb.cn`。配置：`/home/box/.cloudflared/config.yml`。

## 进程

- studio: `logs/studio.pid`，端口 **4400**
- named cloudflared: `logs/cloudflared-named.pid`，日志 `logs/cloudflared-named.log`

## 启动 studio（重启后）

```bash
cd /workspace/video-maker && STUDIO_HOST=0.0.0.0 STUDIO_PORT=4400 setsid nohup node studio/server.mjs >> logs/studio.log 2>&1 < /dev/null & echo $! > logs/studio.pid
```

## 重启命名隧道

沙箱 DNS 会把 `*.argotunnel.com` 指到假 IP `198.18.0.1`，导致 connector 起不来（公网 530 / CF 1033）。重启前先把边缘 IP 钉进 `/etc/hosts`，并用 `http2`：

```sh
# 若 hosts 尚无钉住（DoH 可再核真实 IP）
grep -q 'region1.v2.argotunnel.com' /etc/hosts || sudo tee -a /etc/hosts >/dev/null <<'EOF'
198.41.192.37 region1.v2.argotunnel.com
198.41.200.53 region2.v2.argotunnel.com
198.41.192.77 cfd-features.argotunnel.com
EOF

kill "$(cat /workspace/video-maker/logs/cloudflared-named.pid 2>/dev/null)" 2>/dev/null || pkill -f 'cloudflared tunnel .* run video-workbench' || true
nohup /home/box/.local/bin/cloudflared tunnel --config /home/box/.cloudflared/config.yml --no-autoupdate --protocol http2 run video-workbench \
  >> /workspace/video-maker/logs/cloudflared-named.log 2>&1 &
echo $! > /workspace/video-maker/logs/cloudflared-named.pid
sleep 5
curl -s -o /dev/null -w 'https %{http_code}\n' https://video.danghb.cn/
```

