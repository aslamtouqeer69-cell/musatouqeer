const Database = require("better-sqlite3");
const db = new Database("./portfolio.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    demo_url TEXT DEFAULT '',
    github_url TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const count = db.prepare("SELECT COUNT(*) AS total FROM projects").get().total;

if (count === 0) {
  const insert = db.prepare(
    "INSERT INTO projects (title, category, description) VALUES (?, ?, ?)"
  );

  insert.run("Nexora Digital", "Web Design", "A modern landing-page concept for a digital brand.");
  insert.run("The Tool Room", "Content", "A technology-content brand focused on useful digital tools.");
  insert.run("Search-Ready Pages", "SEO", "A practice project exploring SEO-friendly page structure.");
}

console.log(db.prepare("SELECT id, title, category FROM projects").all());
db.close();
