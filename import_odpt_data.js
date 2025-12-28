
// import_odpt_data.js
const https = require('https');
const { API_ACCESS_TOKEN } = require('./config');
const sqlite3 = require('sqlite3').verbose();

const DB_FILE = './database.sqlite';
const TARGET_OPERATOR = 'odpt.Operator:TokyoMetro';
const TARGET_RAILWAY = 'odpt.Railway:TokyoMetro.Ginza';

// --- グローバル変数 ---
const db = new sqlite3.Database(DB_FILE);

/**
 * ODPT APIにリクエストを送信する汎用関数
 * @param {string} path APIのエンドポイントパス (例: /api/v4/odpt:Station)
 * @param {Object} params クエリパラメータ
 * @returns {Promise<Object>} APIからのレスポンス(JSON)
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
                    reject(new Error(`APIリクエストエラー: ステータスコード ${res.statusCode}`));
                }
            });
        });

        req.on('error', (e) => {
            reject(new Error(`APIリクエストに失敗しました: ${e.message}`));
        });

        req.end();
    });
}

/**
 * データベースのテーブルをクリアする
 */
function clearDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            console.log('既存のデータをクリアします...');
            db.run("DELETE FROM timetables", (err) => {
                if (err) return reject(err);
            });
            db.run("DELETE FROM stations", (err) => {
                if (err) return reject(err);
                console.log('データクリア完了。');
                resolve();
            });
        });
    });
}

/**
 * 駅情報をAPIから取得し、DBに保存する
 */
async function fetchAndSaveStations() {
    console.log('駅情報の取得を開始します...');
    const stations = await apiRequest('/api/v4/odpt:Station', {
        'odpt:operator': TARGET_OPERATOR,
        'odpt:railway': TARGET_RAILWAY
    });

    console.log(`${stations.length}件の駅情報を取得しました。データベースに保存します...`);

    const stmt = db.prepare("INSERT OR REPLACE INTO stations (id, name, line, lat, lon) VALUES (?, ?, ?, ?, ?)");

    return new Promise((resolve, reject) => {
        const promises = stations.map(station => {
            return new Promise((res, rej) => {
                const lat = station['geo:lat'] || 0.0;
                const lon = station['geo:long'] || 0.0;

                if (!station['geo:lat']) {
                    console.warn(`[警告] 駅「${station['dc:title']}」の緯度・経度情報が見つからないため、0.0を使用します。`);
                }

                stmt.run(
                    station['owl:sameAs'],
                    station['dc:title'],
                    station['odpt:railway'],
                    lat,
                    lon,
                    (err) => {
                        if (err) {
                            console.error(`Error inserting station ${station['dc:title']}:`, err.message);
                            res();
                        } else {
                            console.log(`Inserted station ${station['dc:title']}`);
                            res();
                        }
                    }
                );
            });
        });

        Promise.all(promises)
            .then(() => {
                stmt.finalize();
                console.log('駅情報の保存が完了しました。');
                resolve();
            })
            .catch(err => {
                console.error("Error in saving stations:", err);
                reject(err);
            });
    });
}

/**
 * 時刻表情報をAPIから取得し、DBに保存する
 */
async function fetchAndSaveTimetables() {
    console.log('時刻表情報の取得を開始します...');

    const stations = await new Promise((resolve, reject) => {
        db.all("SELECT id FROM stations", (err, rows) => {
            if (err) return reject(err);
            console.log(`fetchAndSaveTimetables: Found ${rows.length} stations in DB.`);
            resolve(rows); // DEBUG: Reverted to process all stations
        });
    });

    const stmt = db.prepare("INSERT OR REPLACE INTO timetables (station_id, day_type, hour, minute, type, destination) VALUES (?, ?, ?, ?, ?, ?)");

    // Promise.allを使用して、すべての駅の時刻表取得を並列実行
    const timetablePromises = stations.map(async (station) => {
        const stationId = station.id;
        console.log(` -> ${stationId} の時刻表を取得中...`);
        const timetables = await apiRequest('/api/v4/odpt:StationTimetable', {
            'odpt:station': stationId
        });
        return { stationId, timetables };
    });

    const results = await Promise.all(timetablePromises);
    console.log('すべての駅の時刻表データを取得しました。データベースに保存します...');


    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            for (const result of results) {
                const { stationId, timetables } = result;
                if (timetables.length > 0) {
                    console.log(`[DEBUG] Keys of first timetable for ${stationId}:`, Object.keys(timetables[0]));
                    console.log(`[DEBUG] Calendar value:`, timetables[0]['odpt:calendar']);
                }
                for (const timetable of timetables) {
                    const calendar = timetable['odpt:calendar']; // odpt.Calendar:Weekday, etc.
                    // 平日かそれ以外（土休日）かで判定
                    const dayType = (calendar && calendar.includes('Weekday')) ? 'weekday' : 'holiday';

                    const timetableObjects = timetable['odpt:stationTimetableObject'];
                    if (!timetableObjects) continue;

                    for (const obj of timetableObjects) {
                        if (!obj['odpt:departureTime']) continue;

                        const [hour, minute] = obj['odpt:departureTime'].split(':').map(Number);

                        // IDから末尾の名称のみを抽出してシンプルに保存（例: odpt.TrainType:JR-East.Local -> Local）
                        // 必要に応じて日本語変換もできるが、まずは動くことを優先してID末尾を使用
                        const trainType = obj['odpt:trainType']
                            ? obj['odpt:trainType'].split('.').pop()
                            : '各停';

                        const destination = obj['odpt:destinationStation']
                            ? obj['odpt:destinationStation'][0].split('.').pop()
                            : '不明';

                        stmt.run(stationId, dayType, hour, minute, trainType, destination);
                    }
                }
            }

            db.run("COMMIT", (err) => {
                if (err) {
                    db.run("ROLLBACK"); // エラーがあればロールバック
                    return reject(err);
                }
                stmt.finalize((finalizeErr) => {
                    if (finalizeErr) return reject(finalizeErr);
                    console.log('全ての時刻表情報の保存が完了しました。');
                    resolve();
                });
            });
        });
    });
}


/**
 * メイン処理
 */
async function main() {
    if (API_ACCESS_TOKEN === 'YOUR_ACCESS_TOKEN') {
        console.error('エラー: アクセストークンが設定されていません。');
        console.error('import_odpt_data.js ファイルを編集して、API_ACCESS_TOKEN を設定してください。');
        return;
    }

    try {
        // await clearDatabase();
        await fetchAndSaveStations();
        await fetchAndSaveTimetables();
        console.log('🎉 データのインポートがすべて完了しました！');
    } catch (error) {
        console.error('処理中にエラーが発生しました:', error);
    } finally {
        db.close();
    }
}

main();
