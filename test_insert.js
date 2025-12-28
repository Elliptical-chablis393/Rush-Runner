const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS stations (id TEXT PRIMARY KEY, name TEXT, line TEXT, lat REAL, lon REAL)");

    const stmt = db.prepare("INSERT INTO stations (id, name, line, lat, lon) VALUES (?, ?, ?, ?, ?)");
    stmt.run("test_id", "Test Station", "Test Line", 35.0, 139.0, (err) => {
        if (err) console.error("Insert error:", err);
        else console.log("Insert success");
    });
    stmt.finalize();

    db.all("SELECT * FROM stations", (err, rows) => {
        console.log("Rows:", rows);
    });
});

db.close();
