const http = require('http');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const url = require('url');
const https = require('https'); // Added https
const { API_ACCESS_TOKEN } = require('./config');

const port = 5173;
const root = __dirname;
const db = new sqlite3.Database(path.join(root, 'database.sqlite'));

/**
 * ODPT APIにリクエストを送信する汎用関数
 */
function apiRequest(path, params) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams({
      ...params,
      'acl:consumerKey': API_ACCESS_TOKEN
    }).toString();

    const options = {
      hostname: 'api.odpt.org',
      port: 443,
      path: `${path}?${query}`,
      method: 'GET'
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('APIレスポンスのJSONパースに失敗しました。'));
          }
        } else {
          reject(new Error(`APIリクエストエラー: ステータスコード ${res.statusCode} `));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`APIリクエストに失敗しました: ${e.message} `));
    });

    req.end();
  });
}

const mime = {
  '.html': 'text/html',
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

const server = http.createServer(async (req, res) => { // Made the callback async
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

        // Get unique directions for this station
        const directions = [...new Set(rows.map(r => r.direction))];

        // Build timetable grouped by direction
        const timetableByDirection = {};
        directions.forEach(dir => {
          timetableByDirection[dir] = {
            weekday: [],
            holiday: []
          };
        });

        rows.forEach(row => {
          if (timetableByDirection[row.direction]) {
            timetableByDirection[row.direction][row.day_type].push({
              type: row.type,
              destination: row.destination,
              hour: row.hour,
              minute: row.minute
            });
          }
        });

        const response = {
          stationName: stationRow.name,
          line: stationRow.line,
          lineName: stationRow.line.replace('odpt.Railway:', ''),
          latitude: stationRow.lat,
          longitude: stationRow.lon,
          directions: directions,
          timetableByDirection: timetableByDirection,
          // Legacy: first direction's timetable for backwards compatibility
          timetable: timetableByDirection[directions[0]] || { weekday: [], holiday: [] }
        };

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

  // --- 運行情報取得API ---
  if (urlPath === '/api/info') {
    const railway = parsedUrl.query.railway;
    if (!railway) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Missing railway parameter' }));
    }

    try {
      console.log(`Fetching train info for ${railway}...`);
      const data = await apiRequest('/api/v4/odpt:TrainInformation', {
        'odpt:railway': railway
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (error) {
      console.error('Error fetching train info:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to fetch train info' }));
    }
    return;
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