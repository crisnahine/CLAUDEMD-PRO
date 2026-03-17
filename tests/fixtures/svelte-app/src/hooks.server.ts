import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // Add request timing
  const start = performance.now();

  const response = await resolve(event);

  const duration = performance.now() - start;
  response.headers.set('X-Response-Time', `${duration.toFixed(2)}ms`);

  return response;
};
