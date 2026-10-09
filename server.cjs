'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const instance = createHash('sha256').update(__dirname).digest('hex');
const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/index.html', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/core.js', ['core.js', 'text/javascript']],
  ['/radar.js', ['radar.js', 'text/javascript']],
  ['/pta.js', ['pta.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']]
]);
function createServer() {
const server = http.createServer(async (req, res) => {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  };
  if (req.headers.host !== `127.0.0.1:${server.address().port}`) {
    res.writeHead(403, headers).end('Invalid host'); return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, {...headers, Allow:'GET, HEAD'}).end(); return;
  }
  const pathname = new URL(req.url, 'http://127.0.0.1:18763').pathname;
  if (pathname === '/health') {
    res.writeHead(200, {...headers, 'Content-Type':'application/json; charset=utf-8'});
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({app:'study-desk', instance})); return;
  }
  const file = files.get(pathname);
  if (!file) { res.writeHead(404, headers).end('Not found'); return; }
  try {
    const bytes = await fs.readFile(path.join(__dirname, file[0]));
    res.writeHead(200, {...headers, 'Content-Type':file[1]+'; charset=utf-8'});
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(500, headers).end('Unable to read application file');
  }
});
return server;
}
module.exports = {createServer};
if (require.main === module) {
const server = createServer();
server.on('error', err => { console.error(err.message); process.exitCode = 1; });
server.listen(18763, '127.0.0.1', () => console.log('Study Desk: http://127.0.0.1:18763'));

}
