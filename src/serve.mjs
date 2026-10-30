// Local preview of the website:  node src/serve.mjs   then open http://localhost:4173/
// Only for checking changes on this computer; the live site is served by GitHub Pages.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

http
  .createServer((req, res) => {
    let file = decodeURIComponent(req.url.split('?')[0]);
    if (file.endsWith('/')) file += 'index.html';
    const full = path.join(root, file);
    // Never serve anything outside the site folder.
    if (!full.startsWith(root)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(full, (error, data) => {
      if (error) {
        res.writeHead(404, { 'Content-Type': TYPES['.html'] });
        res.end(fs.existsSync(path.join(root, '404.html')) ? fs.readFileSync(path.join(root, '404.html')) : 'Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Preview running at http://localhost:${PORT}/  (Ctrl+C to stop)`));
