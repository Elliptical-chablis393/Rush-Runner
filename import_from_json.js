const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DB_FILE = './database.sqlite';
const STATIONS_JSON = './stations.json';

const db = new sqlite3.Database(DB_FILE);

async function importFromJson() {
    const data = JSON.parse(fs.readFileSync(STATIONS_JSON, 'utf8'));

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run("BEGIN TRANSACTION");

            const stationStmt = db.prepare("INSERT OR REPLACE INTO stations (id, name, line, lat, lon) VALUES (?, ?, ?, ?, ?)");
            const timetableStmt = db.prepare("INSERT OR REPLACE INTO timetables (station_id, day_type, hour, minute, type, destination) VALUES (?, ?, ?, ?, ?, ?)");

            for (const id in data) {
                const s = data[id];
                // 駅情報を保存 (IDはJSONのキーを使用)
                stationStmt.run(id, s.stationName, s.lineName, s.latitude, s.longitude);

                // 時刻表を保存
                if (s.timetable) {
                    if (s.timetable.weekday) {
                        s.timetable.weekday.forEach(t => {
                            timetableStmt.run(id, 'weekday', t.hour, t.minute, t.type, t.destination);
                        });
                    }
                    if (s.timetable.holiday) {
                        s.timetable.holiday.forEach(t => {
                            timetableStmt.run(id, 'holiday', t.hour, t.minute, t.type, t.destination);
                        });
                    }
                }
            }

            db.run("COMMIT", (err) => {
                if (err) {
                    db.run("ROLLBACK");
                    reject(err);
                } else {
                    stationStmt.finalize();
                    timetableStmt.finalize();
                    console.log('Import from stations.json completed!');
                    resolve();
                }
            });
        });
    });
}

importFromJson().then(() => db.close()).catch(err => console.error(err));
