
const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection
const db = new Database(path.join(__dirname, "portfolio.db"));

// Projects table
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

  CREATE TABLE IF NOT EXISTS enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    service TEXT DEFAULT '',
    message TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add sample projects only if the table is empty
const projectCount = db.prepare(
  "SELECT COUNT(*) AS total FROM projects"
).get().total;

if (projectCount === 0) {
  const insert = db.prepare(`
    INSERT INTO projects
    (title, category, description)
    VALUES (?, ?, ?)
  `);

  insert.run(
    "Nexora Digital",
    "Web Design",
    "A modern landing-page concept for a digital brand."
  );

  insert.run(
    "The Tool Room",
    "Content",
    "A technology-content brand focused on useful digital tools."
  );

  insert.run(
    "Search-Ready Pages",
    "SEO",
    "A practice project exploring SEO-friendly page structure."
  );
}

// Get projects from database
app.get("/api/projects", (req, res) => {
  try {
    const projects = db.prepare(`
      SELECT id, title, category, description, demo_url, github_url, created_at
      FROM projects
      ORDER BY id DESC
    `).all();

    res.json({
      success: true,
      projects
    });
  } catch (error) {
    console.error("Projects API error:", error);
    res.status(500).json({
      success: false,
      message: "Projects load nahi ho sake."
    });
  }
});

// Website pages
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "musavibe.html"));
});

app.get("/musavibe.html", (req, res) => {
  res.sendFile(path.join(__dirname, "musavibe.html"));
});

// Save contact enquiries
app.post("/api/contact", (req, res) => {
  try {
    const { name, email, service = "", message } = req.body;

    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof message !== "string" ||
      !name.trim() ||
      !email.trim() ||
      !message.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Name, email aur message zaroori hain."
      });
    }

    const result = db.prepare(`
      INSERT INTO enquiries (name, email, service, message)
      VALUES (?, ?, ?, ?)
    `).run(
      name.trim(),
      email.trim(),
      String(service).trim(),
      message.trim()
    );

    res.json({
      success: true,
      message: "Your enquiry has been saved successfully!",
      id: result.lastInsertRowid
    });
  } catch (error) {
    console.error("Contact form error:", error);
    res.status(500).json({
      success: false,
      message: "Enquiry save nahi ho saki."
    });
  }
});

// Serve CSS, JavaScript and other static files
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Musa Portfolio running at http://localhost:${PORT}`);
  console.log("SQLite database connected successfully.");
});

