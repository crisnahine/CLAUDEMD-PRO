import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
});

type Bindings = {
  DB: D1Database;
};

export const usersApp = new Hono<{ Bindings: Bindings }>();

usersApp.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, email, name FROM users ORDER BY created_at DESC'
  ).all();
  return c.json(results);
});

usersApp.get('/:id', async (c) => {
  const id = c.req.param('id');
  const user = await c.env.DB.prepare(
    'SELECT id, email, name FROM users WHERE id = ?'
  ).bind(id).first();

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }
  return c.json(user);
});

usersApp.post(
  '/',
  zValidator('json', createUserSchema),
  async (c) => {
    const { email, name } = c.req.valid('json');
    const result = await c.env.DB.prepare(
      'INSERT INTO users (email, name) VALUES (?, ?) RETURNING id, email, name'
    ).bind(email, name).first();

    return c.json(result, 201);
  }
);

usersApp.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return c.json({ message: 'User deleted' });
});
