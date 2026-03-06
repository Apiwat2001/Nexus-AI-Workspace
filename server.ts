import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import pkg from 'pg';
const { Pool } = pkg;
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPort = parseInt(process.env.DB_PORT || '5432');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: (dbPort > 0 && dbPort < 65536) ? dbPort : 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'nexus_db',
  connectionTimeoutMillis: 2000, // Short timeout for fallback
});

const sqlite = new Database("nexus.db");
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

let usePostgres = false;

// Database Abstraction
const db = {
  query: async (text: string, params?: any[]) => {
    if (usePostgres) {
      return pool.query(text, params);
    } else {
      // Convert PostgreSQL $1, $2 to SQLite ?
      const sqliteQuery = text.replace(/\$\d+/g, '?');
      if (text.trim().toUpperCase().startsWith('SELECT')) {
        const rows = sqlite.prepare(sqliteQuery).all(params || []);
        return { rows, rowCount: rows.length };
      } else {
        const result = sqlite.prepare(sqliteQuery).run(params || []);
        // Mock RETURNING for SQLite
        if (text.includes('RETURNING')) {
          const lastId = result.lastInsertRowid;
          const tableName = text.match(/INSERT INTO (\w+)/i)?.[1];
          if (tableName) {
            const row = sqlite.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(lastId);
            return { rows: [row], rowCount: 1 };
          }
        }
        return { rows: [], rowCount: result.changes };
      }
    }
  }
};

// Initialize Database
async function initDb() {
  try {
    // Test PostgreSQL connection
    await pool.query('SELECT 1');
    usePostgres = true;
    console.log("Using PostgreSQL Database");
  } catch (err) {
    console.log("PostgreSQL not available, falling back to SQLite Database");
    usePostgres = false;
  }

  try {
    if (usePostgres) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          avatar TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS projects (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS tasks (
          id SERIAL PRIMARY KEY,
          project_id INTEGER REFERENCES projects(id),
          title TEXT NOT NULL,
          status TEXT DEFAULT 'todo',
          priority TEXT DEFAULT 'medium',
          assignee TEXT,
          due_date TEXT
        );
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          user_name TEXT NOT NULL,
          content TEXT NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Ensure columns exist in PostgreSQL (migration)
      try {
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'");
        await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT");
      } catch (err) {
        console.log("PostgreSQL column migration skipped or failed (might already exist)");
      }
    } else {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          avatar TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER REFERENCES projects(id),
          title TEXT NOT NULL,
          status TEXT DEFAULT 'todo',
          priority TEXT DEFAULT 'medium',
          assignee TEXT,
          due_date TEXT
        );
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_name TEXT NOT NULL,
          content TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Ensure columns exist in SQLite (migration)
      const columns = sqlite.prepare("PRAGMA table_info(users)").all() as any[];
      const hasRole = columns.some(c => c.name === 'role');
      const hasAvatar = columns.some(c => c.name === 'avatar');
      
      if (!hasRole) {
        console.log("Adding 'role' column to SQLite users table...");
        sqlite.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
      }
      if (!hasAvatar) {
        console.log("Adding 'avatar' column to SQLite users table...");
        sqlite.exec("ALTER TABLE users ADD COLUMN avatar TEXT");
      }
    }

    // Seed data if empty
    const usersToSeed = [
      { username: 'admin', password: '120944', role: 'admin' },
      { username: 'admin1', password: '120944', role: 'admin' }
    ];

    for (const u of usersToSeed) {
      const check = await db.query("SELECT * FROM users WHERE username = $1", [u.username]);
      const hashedPassword = await bcrypt.hash(u.password, 10);
      if (check.rows.length === 0) {
        console.log(`Seeding user: ${u.username} as admin...`);
        await db.query("INSERT INTO users (username, password, role) VALUES ($1, $2, $3)", [u.username, hashedPassword, 'admin']);
      } else {
        console.log(`Ensuring user ${u.username} is admin...`);
        await db.query("UPDATE users SET role = $1, password = $2 WHERE username = $3", ['admin', hashedPassword, u.username]);
      }
    }

    // Double check admin role
    const verifyAdmins = await db.query("SELECT username, role FROM users");
    console.log("All Registered Users:", verifyAdmins.rows);

    const projectRes = await db.query("SELECT COUNT(*) as count FROM projects");
    if (parseInt(projectRes.rows[0].count) === 0) {
      const res = await db.query("INSERT INTO projects (name, description) VALUES ($1, $2) RETURNING id", ["Main Project", "The primary development workspace"]);
      const projectId = res.rows[0].id;
      await db.query("INSERT INTO tasks (project_id, title, status, priority) VALUES ($1, $2, $3, $4)", [projectId, "Setup Architecture", "done", "high"]);
      await db.query("INSERT INTO tasks (project_id, title, status, priority) VALUES ($1, $2, $3, $4)", [projectId, "Design UI Mockups", "in-progress", "medium"]);
      await db.query("INSERT INTO tasks (project_id, title, status, priority) VALUES ($1, $2, $3, $4)", [projectId, "Implement AI Service", "todo", "high"]);
    }
    console.log("Database initialized");
  } catch (err) {
    console.error("Database initialization failed:", err);
  }
}

// Middleware to verify JWT
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Access denied" });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = user;
    next();
  });
};

// Middleware to verify Admin
const isAdmin = (req: any, res: any, next: any) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: "Admin access required" });
  }
};

async function startServer() {
  await initDb();

  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  app.use(express.json());

  // Auth Routes
  app.post("/api/auth/register", async (req, res) => {
    const { username, password } = req.body;
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await db.query(
        "INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username",
        [username, hashedPassword]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      if (err.code === '23505' || err.message?.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: "Username already exists" });
      }
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    console.log(`Login attempt for: ${username}`);
    try {
      const result = await db.query("SELECT * FROM users WHERE username = $1", [username]);
      const user = result.rows[0];

      if (user) {
        // Force admin role for the 'admin' or 'admin1' user if it's somehow lost
        if ((user.username === 'admin' || user.username === 'admin1') && user.role !== 'admin') {
          console.log(`Fixing admin role for '${user.username}' user during login`);
          await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
          user.role = 'admin';
        }

        const isMatch = await bcrypt.compare(password, user.password);
        console.log(`User found: ${user.username}, Role: ${user.role}, password match: ${isMatch}`);
        if (isMatch) {
          const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
          return res.json({ token, user: { id: user.id, username: user.username, role: user.role, avatar: user.avatar } });
        }
      }
      
      console.log("Invalid credentials");
      res.status(401).json({ error: "Invalid credentials" });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Profile Update
  app.get("/api/profile", authenticateToken, async (req: any, res: any) => {
    try {
      const result = await db.query("SELECT id, username, role, avatar FROM users WHERE id = $1", [req.user.id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const user = result.rows[0];
      // Force admin role for the 'admin' or 'admin1' user if it's somehow lost
      if ((user.username === 'admin' || user.username === 'admin1') && user.role !== 'admin') {
        console.log(`Fixing admin role for '${user.username}' user during profile fetch`);
        await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
        user.role = 'admin';
      }

      console.log(`Profile requested for ${user.username}, returning role: ${user.role}`);
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  app.patch("/api/profile", authenticateToken, async (req: any, res: any) => {
    const { username, password, avatar } = req.body;
    const userId = req.user.id;
    try {
      let query = "UPDATE users SET username = COALESCE($1, username), avatar = COALESCE($2, avatar)";
      let params = [username, avatar];
      
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        query += ", password = $3 WHERE id = $4 RETURNING id, username, role, avatar";
        params.push(hashedPassword, userId);
      } else {
        query += " WHERE id = $3 RETURNING id, username, role, avatar";
        params.push(userId);
      }
      
      const result = await db.query(query, params);
      res.json(result.rows[0]);
    } catch (err) {
      console.error("Profile update error:", err);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Admin Routes
  app.get("/api/admin/users", authenticateToken, isAdmin, async (req: any, res: any) => {
    try {
      const result = await db.query("SELECT id, username, role, created_at FROM users ORDER BY id ASC");
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users", authenticateToken, isAdmin, async (req: any, res: any) => {
    const { username, password, role } = req.body;
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await db.query(
        "INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role",
        [username, hashedPassword, role || 'user']
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.patch("/api/admin/users/:id", authenticateToken, isAdmin, async (req: any, res: any) => {
    const { id } = req.params;
    const { role, password } = req.body;
    try {
      let query = "UPDATE users SET role = COALESCE($1, role)";
      let params = [role];
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        query += ", password = $2 WHERE id = $3 RETURNING id, username, role";
        params.push(hashedPassword, id);
      } else {
        query += " WHERE id = $2 RETURNING id, username, role";
        params.push(id);
      }
      const result = await db.query(query, params);
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/admin/users/:id", authenticateToken, isAdmin, async (req: any, res: any) => {
    const { id } = req.params;
    try {
      await db.query("DELETE FROM users WHERE id = $1", [id]);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // API Routes
  app.get("/api/projects", authenticateToken, async (req, res) => {
    try {
      const result = await db.query("SELECT * FROM projects");
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/tasks", authenticateToken, async (req, res) => {
    try {
      const result = await db.query("SELECT * FROM tasks");
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.get("/api/stats", authenticateToken, async (req, res) => {
    try {
      const result = await db.query("SELECT status, COUNT(*) as count FROM tasks GROUP BY status");
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.post("/api/tasks", authenticateToken, async (req, res) => {
    const { title, status, priority, project_id } = req.body;
    try {
      const result = await db.query(
        "INSERT INTO tasks (title, status, priority, project_id) VALUES ($1, $2, $3, $4) RETURNING *",
        [title, status || 'todo', priority || 'medium', project_id || 1]
      );
      const newTask = result.rows[0];
      io.emit("task:created", newTask);
      res.json(newTask);
    } catch (err) {
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status, priority } = req.body;
    try {
      const result = await db.query(
        "UPDATE tasks SET status = COALESCE($1, status), priority = COALESCE($2, priority) WHERE id = $3 RETURNING *",
        [status, priority, id]
      );
      const updatedTask = result.rows[0];
      io.emit("task:updated", updatedTask);
      res.json(updatedTask);
    } catch (err) {
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  app.get("/api/messages", authenticateToken, async (req, res) => {
    try {
      const result = await db.query(`
        SELECT m.*, u.avatar 
        FROM messages m 
        LEFT JOIN users u ON m.user_name = u.username 
        ORDER BY m.timestamp DESC 
        LIMIT 50
      `);
      res.json(result.rows.reverse());
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  app.post("/api/messages", authenticateToken, async (req, res) => {
    const { user_name, content } = req.body;
    try {
      const result = await db.query(
        "INSERT INTO messages (user_name, content) VALUES ($1, $2) RETURNING *",
        [user_name, content]
      );
      const newMessage = result.rows[0];
      
      // Fetch avatar for the new message
      const userRes = await db.query("SELECT avatar FROM users WHERE username = $1", [user_name]);
      newMessage.avatar = userRes.rows[0]?.avatar;

      io.emit("message:new", newMessage);
      res.json(newMessage);
    } catch (err) {
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.delete("/api/tasks/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
      await db.query("DELETE FROM tasks WHERE id = $1", [id]);
      io.emit("task:deleted", id);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  app.delete("/api/messages/:id", authenticateToken, isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      await db.query("DELETE FROM messages WHERE id = $1", [id]);
      io.emit("message:deleted", id);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: "Failed to delete message" });
    }
  });

  app.delete("/api/messages", authenticateToken, isAdmin, async (req, res) => {
    try {
      await db.query("DELETE FROM messages");
      io.emit("messages:cleared");
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: "Failed to clear messages" });
    }
  });

  // Socket.io logic
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    socket.on("disconnect", () => console.log("User disconnected"));
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
