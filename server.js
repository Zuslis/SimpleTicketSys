// server.js
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- DB Setup (SQLite) ---
let db;
async function initDb() {
    db = await open({ filename: path.join(__dirname, 'db.sqlite'), driver: sqlite3.Database });
    await db.exec(`CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    assignee TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );`);
}

const nowISO = () => new Date().toISOString();

// --- Rollen / Auth (Minimal) ---
// Sende für Admin-Aktionen den Header: x-role: admin
function requireAdmin(req, res, next) {
    if (req.headers['x-role'] === 'admin') return next();
    return res.status(403).json({ error: 'forbidden' });
}

// --- API ---
// Liste: alle dürfen
app.get('/api/tickets', async (req, res) => {
    try {
        const { status, q } = req.query;
        const where = [];
        const params = [];
        if (status) { where.push('status = ?'); params.push(status); }
        if (q) { where.push('(title LIKE ? OR description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
        const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const rows = await db.all(`SELECT * FROM tickets ${whereSql} ORDER BY updatedAt DESC`, params);
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Erstellen: alle dürfen
app.post('/api/tickets', async (req, res) => {
    try {
        const { title, description } = req.body;
        if (!title) return res.status(400).json({ error: 'title required' });
        const ts = nowISO();
        const result = await db.run(
            'INSERT INTO tickets (title, description, status, assignee, createdAt, updatedAt) VALUES (?, ?, "open", NULL, ?, ?)',
            [title, description || '', ts, ts]
        );
        const ticket = await db.get('SELECT * FROM tickets WHERE id = ?', [result.lastID]);
        res.status(201).json(ticket);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ändern: nur Admin
app.patch('/api/tickets/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, status, assignee } = req.body;

        const existing = await db.get('SELECT * FROM tickets WHERE id = ?', [id]);
        if (!existing) return res.status(404).json({ error: 'not found' });

        const next = {
            title: title ?? existing.title,
            description: description ?? existing.description,
            status: status ?? existing.status,
            assignee: assignee === undefined ? existing.assignee : assignee,
            updatedAt: nowISO()
        };

        await db.run(
            'UPDATE tickets SET title = ?, description = ?, status = ?, assignee = ?, updatedAt = ? WHERE id = ?',
            [next.title, next.description, next.status, next.assignee, next.updatedAt, id]
        );

        const ticket = await db.get('SELECT * FROM tickets WHERE id = ?', [id]);
        res.json(ticket);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Löschen: nur Admin
app.delete('/api/tickets/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await db.run('DELETE FROM tickets WHERE id = ?', [id]);
        res.status(204).end();
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// SPA-Fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start
const PORT = process.env.PORT || 3000;
initDb().then(() => {
    app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
});
