// init_db.js
const sqlite3 = require('sqlite3').verbose();

// データベースファイル。なければ新規作成される。
const dbFile = './database.sqlite';

// データベースに接続
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    return console.error('データベース接続に失敗しました:', err.message);
  }
  console.log('データベースに正常に接続しました。');
});

// テーブルを作成するSQL
const createStationsTable = `
CREATE TABLE IF NOT EXISTS stations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    line TEXT,
    lat REAL NOT NULL,
    lon REAL NOT NULL
);`;

const createTimetablesTable = `
CREATE TABLE IF NOT EXISTS timetables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    station_id TEXT NOT NULL,
    day_type TEXT NOT NULL, -- 'weekday' or 'holiday'
    hour INTEGER NOT NULL,
    minute INTEGER NOT NULL,
    type TEXT,
    destination TEXT,
    FOREIGN KEY (station_id) REFERENCES stations (id)
);`;

// SQLを実行してテーブルを作成
db.serialize(() => {
  db.run(createStationsTable, (err) => {
    if (err) {
      return console.error('stationsテーブルの作成に失敗しました:', err.message);
    }
    console.log('stationsテーブルを正常に作成（または確認）しました。');
  });

  db.run(createTimetablesTable, (err) => {
    if (err) {
      return console.error('timetablesテーブルの作成に失敗しました:', err.message);
    }
    console.log('timetablesテーブルを正常に作成（または確認）しました。');
  });
});

// データベース接続を閉じる
db.close((err) => {
  if (err) {
    return console.error('データベース切断に失敗しました:', err.message);
  }
  console.log('データベースとの接続を正常に切断しました。');
});
