// tests/server.test.js
import request from 'supertest';
import { app, initDb } from '../server.js';
import { pool, closeDb } from '../db.js';

let tokenAdmin, tokenUser;

beforeAll(async () => {
    // DB-Struktur sicherstellen
    await initDb();

    // saubere Ausgangslage für die Tests
    await pool.query('TRUNCATE tickets RESTART IDENTITY CASCADE;');

    // Seed-User sicherstellen (falls leer/fehlt)
    const bcrypt = (await import('bcryptjs')).default;
    const adminHash = await bcrypt.hash('admin123', 10);
    const userHash = await bcrypt.hash('user123', 10);

    await pool.query(
        `INSERT INTO users (username, passwordHash, role) VALUES
      ('admin', $1, 'admin'),
      ('user',  $2, 'user')
     ON CONFLICT (username) DO NOTHING;`,
        [adminHash, userHash]
    );

    // Login-Tokens holen
    tokenAdmin = (await request(app).post('/api/login')
        .send({ username: 'admin', password: 'admin123' })).body.token;

    tokenUser = (await request(app).post('/api/login')
        .send({ username: 'user', password: 'user123' })).body.token;
});

test('user can create and list tickets', async () => {
    const create = await request(app).post('/api/tickets')
        .set('Authorization', `Bearer ${tokenUser}`)
        .send({ title: 'Test von user', description: 'Desc' });
    expect(create.statusCode).toBe(201);

    const list = await request(app).get('/api/tickets')
        .set('Authorization', `Bearer ${tokenUser}`);
    expect(list.statusCode).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
});

test('user cannot patch ticket (status)', async () => {
    // Ticket als user anlegen
    const t = await request(app).post('/api/tickets')
        .set('Authorization', `Bearer ${tokenUser}`)
        .send({ title: 'no-permission' });
    const id = t.body.id;

    // user darf Status NICHT frei ändern
    const patch = await request(app).patch(`/api/tickets/${id}`)
        .set('Authorization', `Bearer ${tokenUser}`)
        .send({ status: 'in_progress' });
    expect(patch.statusCode).toBe(403);
});

test('admin can patch and delete', async () => {
    // Ticket anlegen (als user)
    const t = await request(app).post('/api/tickets')
        .set('Authorization', `Bearer ${tokenUser}`)
        .send({ title: 'admin-works' });
    const id = t.body.id;

    // admin darf status/assignee setzen
    const patch = await request(app).patch(`/api/tickets/${id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ status: 'in_progress', assignee: 'Alex' });
    expect(patch.statusCode).toBe(200);
    expect(patch.body.status).toBe('in_progress');
    expect(patch.body.assignee).toBe('Alex');

    // admin darf löschen
    const del = await request(app).delete(`/api/tickets/${id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(del.statusCode).toBe(204);
});

// ➜ WICHTIG: Pool schließen, damit Jest sauber beendet
afterAll(async () => {
    await closeDb();
});
