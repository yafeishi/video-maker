// 极简静态服务器（ES module 不能走 file://）
// 仓库根是服务根：页面可引用 /core/...、/node_modules/three/...
// 仓库外的影片工程挂在 /@film/ 下
import http from 'http'; import fs from 'fs'; import path from 'path';

export const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.md': 'text/markdown; charset=utf-8', '.srt': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
  '.hdr': 'application/octet-stream', '.bin': 'application/octet-stream', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary',
};

const MOUNT = '/@film/'; let filmDir = null;
export function pageURL(root, port, dir) {
  const abs = path.resolve(dir), rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) { filmDir = abs; return `http://127.0.0.1:${port}${MOUNT}index.html`; }
  return `http://127.0.0.1:${port}/${rel.split(path.sep).map(encodeURIComponent).join('/')}/index.html`;
}

// 带 Range 支持的静态文件响应（<video>/<audio> 拖动进度需要）；拒绝跳出 root 的路径
export function sendFile(req, res, root, urlPath) {
  const p = filmDir && urlPath.startsWith(MOUNT) ? path.join(filmDir, urlPath.slice(MOUNT.length)) : path.join(root, urlPath);
  const base = filmDir && urlPath.startsWith(MOUNT) ? filmDir : root;
  if (path.relative(base, p).startsWith('..')) { res.writeHead(403); res.end(); return; }
  fs.stat(p, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); res.end(); return; }
    const type = MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
    const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (m) {
      const a = m[1] ? +m[1] : Math.max(0, st.size - +m[2]), b = m[1] && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      if (a > b || a >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); res.end(); return; }
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 });
      fs.createReadStream(p, { start: a, end: b }).pipe(res);
    } else {
      res.writeHead(200, { ...head, 'Content-Length': st.size });
      if (req.method === 'HEAD') res.end(); else fs.createReadStream(p).pipe(res);
    }
  });
}

export function serve(root, port = 0, host = '127.0.0.1', handler = null) {
  return new Promise(res => {
    const s = http.createServer(async (q, r) => {
      let u;
      try { u = decodeURIComponent(q.url.split('?')[0]); } catch { r.writeHead(400); r.end(); return; }
      if (handler && await handler(q, r, u)) return;
      if (u.endsWith('/')) u += 'index.html';
      sendFile(q, r, root, u);
    });
    s.listen(port, host, () => res({ server: s, port: s.address().port }));
  });
}
