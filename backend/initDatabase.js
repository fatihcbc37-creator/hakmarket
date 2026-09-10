const pool = require("./db");

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS flyers (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      valid_until DATE,
      original_name TEXT NOT NULL,
      filename TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log("Datenbank wurde initialisiert.");
}

module.exports = initDatabase;