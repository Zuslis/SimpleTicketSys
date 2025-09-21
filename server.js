import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool, initDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const nowISO = () => new Date().toISOString();

// --- Auth helpers ---
function signToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '12h' }
    );
}

// JWT aus Header (optional)
app.use((req, res, next) => {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
        try { req.user = jwt.verify(auth.slice(7), JWT_SECRET); } catch { }
    }
    next();
});

function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    next();
}
function requireAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
    next();
}

// --- Auth ---
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body || {};
        if (!username || !password) return res.status(400).json({ error: 'username and password required' });

        const { rows } = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
        const user = rows[0];
        if (!user) return res.status(401).json({ error: 'invalid credentials' });

        const ok = await bcrypt.compare(password, user.passwordhash);
        if (!ok) return res.status(401).json({ error: 'invalid credentials' });

        const token = signToken(user);
        res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: { id: req.user.id, username: req.user.username, role: req.user.role } });
});

// --- Tickets ---
app.get('/api/tickets', requireAuth, async (req, res) => {
    try {
        const { status, q } = req.query;
        const where = []; const params = [];
        if (status) { where.push(`status = $${params.length + 1}`); params.push(status); }
        if (q) {
            where.push(`(title ILIKE $${params.length + 1} OR description ILIKE $${params.length + 2})`);
            params.push(`%${q}%`, `%${q}%`);
        }
        const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const { rows } = await pool.query(
            `SELECT id, title, description, status, assignee,
              createdby AS "createdBy",
              createdat AS "createdAt",
              updatedat AS "updatedAt"
         FROM tickets
         ${whereSql}
         ORDER BY updatedat DESC`,
            params
        );
        res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// create: jeder eingeloggte
app.post('/api/tickets', requireAuth, async (req, res) => {
    try {
        const { title, description } = req.body || {};
        if (!title) return res.status(400).json({ error: 'title required' });
        const ts = nowISO();
        const result = await pool.query(
            `INSERT INTO tickets (title, description, status, assignee, createdby, createdat, updatedat)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, title, description, status, assignee,
                 createdby AS "createdBy", createdat AS "createdAt", updatedat AS "updatedAt"`,
            [title, description || '', 'open', null, req.user.username, ts, ts]
        );
        res.status(201).json(result.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * update/close:
 * - admin: volle Rechte (title, description, status beliebig, assignee)
 * - user:  darf NUR title/description ändern und status -> 'closed' setzen
 *          (kein assignee; und nur eigene Tickets; ABER: Bestand mit createdBy NULL erlauben)
 */
app.patch('/api/tickets/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const body = req.body || {};
        const { rows: exRows } = await pool.query('SELECT * FROM tickets WHERE id=$1', [id]);
        if (!exRows.length) return res.status(404).json({ error: 'not found' });
        const existing = exRows[0];

        // ⬇️ Anpassung: Wenn createdby NULL ist (Altbestand), erlauben
        const isOwnerOrUnset = !existing.createdby || existing.createdby === req.user.username;

        if (req.user.role !== 'admin' && !isOwnerOrUnset) {
            return res.status(403).json({ error: 'forbidden' });
        }

        let next = {
            title: body.title ?? existing.title,
            description: body.description ?? existing.description,
            status: existing.status,
            assignee: existing.assignee,
            updatedAt: nowISO()
        };

        if (req.user.role === 'admin') {
            // Admin: alles frei
            if (body.status !== undefined) next.status = body.status;
            if (body.assignee !== undefined) next.assignee = body.assignee;
        } else {
            // User: kein assignee, Status nur -> 'closed'
            if (body.assignee !== undefined) return res.status(403).json({ error: 'forbidden: assignee' });
            if (body.status !== undefined && body.status !== 'closed') {
                return res.status(403).json({ error: 'forbidden: status' });
            }
            if (body.status === 'closed') next.status = 'closed';
        }

        const { rows } = await pool.query(
            `UPDATE tickets
          SET title=$1, description=$2, status=$3, assignee=$4, updatedat=$5
        WHERE id=$6
        RETURNING id, title, description, status, assignee,
                  createdby AS "createdBy", createdat AS "createdAt", updatedat AS "updatedAt"`,
            [next.title, next.description, next.status, next.assignee, next.updatedAt, id]
        );

        res.json(rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// delete: nur admin
app.delete('/api/tickets/:id', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM tickets WHERE id=$1', [id]);
        res.status(204).end();
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

// SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Migration + Seed
async function migrateAddCreatedBy() {
    await pool.query(`DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='tickets' AND column_name='createdby'
    ) THEN
      ALTER TABLE tickets ADD COLUMN createdby TEXT;
    END IF;
  END $$;`);
}

async function seedUsers() {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM users');
    if (rows[0].c > 0) return;
    const adminHash = await bcrypt.hash('admin123', 10);
    const userHash = await bcrypt.hash('user123', 10);
    await pool.query('INSERT INTO users (username, passwordHash, role) VALUES ($1,$2,$3)', ['admin', adminHash, 'admin']);
    await pool.query('INSERT INTO users (username, passwordHash, role) VALUES ($1,$2,$3)', ['user', userHash, 'user']);
    console.log('👤 Seeded users: admin/admin123, user/user123');
}

if (process.env.NODE_ENV !== 'test') {
    const PORT = process.env.PORT || 3000;
    initDb()
        .then(migrateAddCreatedBy)
        .then(seedUsers)
        .then(() => app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`)))
        .catch(err => { console.error('DB init failed:', err); process.exit(1); });
}

export { app, initDb };
