import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { usersApp } from './routes/users';
import { authMiddleware } from './middleware/auth';

type Bindings = {
  DB: D1Database;
  API_VERSION: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Global middleware
app.use('*', logger());
app.use('*', cors());
app.use('*', prettyJSON());

// Health check
app.get('/', (c) => {
  return c.json({
    message: 'My Hono API',
    version: c.env.API_VERSION,
  });
});

// Protected routes
app.use('/api/*', authMiddleware);
app.route('/api/users', usersApp);

export default app;
