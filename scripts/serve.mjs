import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const port = Number(process.env.PORT || 4173);
const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/src/app.js', ['src/app.js', 'text/javascript']],
  ['/src/core.js', ['src/core.js', 'text/javascript']],
  ['/src/style.css', ['src/style.css', 'text/css']],
]);
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  const path = (req.url || '/').split('?')[0];
  if (path === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const file = files.get(path);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const data = await readFile(new URL(file[0], root));
    res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(500); res.end('Unable to read app file'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Redirect Guard: http://127.0.0.1:${port}\nSource: ${fileURLToPath(root)}`));
