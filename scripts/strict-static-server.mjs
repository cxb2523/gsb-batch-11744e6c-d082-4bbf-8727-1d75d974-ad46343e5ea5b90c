// Minimal strict static file server for verification: missing paths return a
// real HTTP 404 (no SPA fallback), so the missing-URL -> FetchFailed path can
// be exercised end-to-end. Serves the directory passed as argv[2].
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] || 'public');
const port = Number(process.argv[3]) || 4199;
const mime = { '.html': 'text/html', '.splat': 'application/octet-stream', '.json': 'application/json' };

createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const filePath = normalize(join(root, urlPath));
    if (!filePath.startsWith(root + sep) && filePath !== root) {
        res.writeHead(403);
        return res.end('forbidden');
    }
    stat(filePath, (err, st) => {
        if (err || !st.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
            return res.end('not found');
        }
        readFile(filePath, (e, data) => {
            if (e) {
                res.writeHead(500, { 'Access-Control-Allow-Origin': '*' });
                return res.end('error');
            }
            res.writeHead(200, {
                'Content-Type': mime[extname(filePath)] || 'application/octet-stream',
                'Content-Length': st.size,
                'Access-Control-Allow-Origin': '*',
            });
            res.end(data);
        });
    });
}).listen(port, () => console.log(`strict static server on ${port} serving ${root}`));
