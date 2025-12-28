const http = require('http');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const url = require('url');

const port = process.env.PORT || 5173;
const root = __dirname;
const db = new sqlite3.Database(path.join(root, 'database.sqlite'));

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const urlPath = decodeURIComponent(parsedUrl.pathname);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // API: Station Search
  if (urlPath === '/api/stations') {
    const query = parsedUrl.query.name || '';
    db.all("SELECT id, name, line FROM stations WHERE name LIKE ? LIMIT 10", [`%${query}%`], (err, rows) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(rows));
    });
    return;
  }

  // API: Timetable by Station ID
  const timetableMatch = urlPath.match(/^\/api\/timetable\/(.+)/);
  if (timetableMatch) {
    const stationId = timetableMatch[1];
    db.all("SELECT * FROM timetables WHERE station_id = ? ORDER BY hour, minute", [stationId], (err, rows) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
      
      db.get("SELECT name, line, lat, lon FROM stations WHERE id = ?", [stationId], (stationErr, stationRow) => {
        if (stationErr) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: stationErr.message }));
        }
        if (!stationRow) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'Station not found' }));
        }

        const response = {
            stationName: stationRow.name,
            lineName: stationRow.line.replace('odpt.Railway:JR-East.',''),
            latitude: stationRow.lat,
            longitude: stationRow.lon,
            timetable: {
                weekday: [],
                holiday: []
            }
        };

        rows.forEach(row => {
            response.timetable[row.day_type].push({
                type: row.type,
                destination: row.destination,
                hour: row.hour,
                minute: row.minute
            });
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      });
    });
    return;
  }

  // Static file serving
  let filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not Found');
    }

    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(500);
        return res.end('Server Error');
      }
      const ext = path.extname(filePath).toLowerCase();
      const headers = {
        'Content-Type': mime[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache'
      };
      res.writeHead(200, headers);
      res.end(data);
    });
  });
});

server.listen(port, () => {
  console.log(`RushRunner dev server running at http://localhost:${port}`);
});