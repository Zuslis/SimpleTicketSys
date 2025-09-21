// tests/server.test.js
import request from 'supertest';
import { app, initDb } from '../server.js';

let tokenAdmin, tokenUser;

beforeAll(async () => {
    await initDb();
    // Login admin
    const a = await request(app).post('/api/login')
        .send({ username: 'admin', password: 'admin123' });
    tokenAdmin = a.body.token;
    // Login user
    const u = await request(app).post('/api/login')
        .send({ username: 'user', password: 'user123' });
    tokenUser = u.body.token;
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

test('user cannot patch ticket', async () => {
    // erst ein Ticket anlegen
    const t = await request(app).post('/api/tickets')
        .set('Authorization', `Bearer ${tokenUser}`)
        .send({ title: 'no-permission' });
    const id = t.body.id;

    const patch = await request(app).patch(`/api/tickets/${id}`)
        .set('Authorization', `Bearer ${tokenUser}`)
        .send({ status: 'in_progress' });
    expect(patch.statusCode).toBe(403);
});

test('admin can patch and delete', async () => {
    // Ticket anlegen als user
    const t = await request(app).post('/api/tickets')
        .set('Authorization', `Bearer ${tokenUser}`)
        .send({ title: 'admin-works' });
    const id = t.body.id;

    const patch = await request(app).patch(`/api/tickets/${id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`)
        .send({ status: 'in_progress', assignee: 'Alex' });
    expect(patch.statusCode).toBe(200);
    expect(patch.body.status).toBe('in_progress');
    expect(patch.body.assignee).toBe('Alex');

    const del = await request(app).delete(`/api/tickets/${id}`)
        .set('Authorization', `Bearer ${tokenAdmin}`);
    expect(del.statusCode).toBe(204);
});
