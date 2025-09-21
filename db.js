// db.js – Postgres via env/DATABASE_URL (Render-ready)
import pkg from 'pg';
const { Pool } = pkg;

const connectionString = process.env.DATABASE_URL || null;
const useSSL = String(process.env.DB_SSL || 'false').toLowerCase() === 'true';

export const pool = connectionString
    ? new Pool({ connectionString, ssl: useSSL ? { rejectUnauthorized: false } : undefined })
    : new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'ticketdb',
        user: process.env.DB_USER || 'ticket',
        password: process.env.DB_PASS || 'secret',
        ssl: useSSL ? { rejectUnauthorized: false } : undefined,
    });

export async function initDb() {
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user','admin'))
  )`);

    await pool.query(`CREATE TABLE IF NOT EXISTS tickets (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    assignee TEXT,
    createdby TEXT,
    createdAt TIMESTAMPTZ NOT NULL,
    updatedAt TIMESTAMPTZ NOT NULL
  )`);
}

// 👉 für Tests: Pool sauber schließen (sonst bleibt Jest „offen“)
export async function closeDb() {
    try { await pool.end(); } catch { }
}

// 👉 optional für Tests: alles zurücksetzen
export async function resetDb() {
    await pool.query('TRUNCATE tickets, users RESTART IDENTITY CASCADE;');
}
