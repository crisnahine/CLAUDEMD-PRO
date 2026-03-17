import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';

export const authMiddleware = createMiddleware(async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    // In a real app, verify JWT token here
    if (!token) {
      return c.json({ error: 'Invalid token' }, 401);
    }

    c.set('userId', 'user-from-token');
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
});
