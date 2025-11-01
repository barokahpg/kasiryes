const http = require('http');
const fs = require('fs');
const path = require('path');
const port = process.env.PORT || 3002;

const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  try {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(__dirname, reqPath);
    if (!filePath.startsWith(__dirname)) {
      res.statusCode = 400;
      res.end('Bad request');
      return;
    }
    fs.stat(filePath, (err, stats) => {
      if (err) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      if (stats.isDirectory()) {
        res.statusCode = 302;
        res.setHeader('Location', '/index.html');
        res.end();
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      const type = mime[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', type + '; charset=utf-8');
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
      stream.on('error', () => {
        res.statusCode = 500;
        res.end('Server error');
      });
    });
  } catch (e) {
    res.statusCode = 500;
    res.end('Server error');
  }
});

server.listen(port, () => {
  console.log(`Static server running at http://localhost:${port}`);
});
