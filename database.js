import sqlite3 from "sqlite3";
sqlite3.verbose();

const db = new sqlite3.Database("./autohide.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS shops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_domain TEXT UNIQUE,
      access_token TEXT,
      hide_variants INTEGER DEFAULT 0,
      send_low_stock_email INTEGER DEFAULT 0,
      threshold INTEGER DEFAULT 3
    )
  `);
});

export default db;