const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
    db.all("SELECT id, name FROM stations LIMIT 10", (err, rows) => {
        if (err) {
            console.error("Error selecting stations:", err);
        } else {
            console.log("Stations count:", rows.length);
            console.log("Stations:", rows);
        }
    });

    db.get("SELECT count(*) as count FROM stations", (err, row) => {
        if (err) console.error("Count error:", err);
        else console.log("Total stations in DB:", row ? row.count : 0);
    });

    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
        console.log("Tables:", tables);
    });
});

// db.close() is called automatically when script ends, or we can call it explicitly but we need to wait for queries.
// sqlite3 usually queues them.
