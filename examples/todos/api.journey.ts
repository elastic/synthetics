import { apiJourney, monitor, step, expect } from '@elastic/synthetics';

/**
 * Example API journey. Unlike a browser journey, no Chromium is launched —
 * the journey only uses Playwright's `APIRequestContext` to hit HTTP
 * endpoints. Each API journey gets its own isolated request context with
 * an independent cookie jar.
 *
 * Pushed to Kibana as an HTTP-type monitor.
 */
apiJourney('todos public API', ({ request, params }) => {
  monitor.use({
    id: 'todos-api-health',
    schedule: 1,
    tags: ['api', 'todos'],
  });

  step('list todos', async () => {
    const res = await request.get(`${params.url}/api/todos`);
    expect(res.status()).toBe(200);
    const todos = await res.json();
    expect(Array.isArray(todos)).toBe(true);
  });

  step('round-trip a todo', async () => {
    const created = await request.post(`${params.url}/api/todos`, {
      data: { title: 'synthetic check', completed: false },
    });
    expect(created.status()).toBe(201);
    const { id } = await created.json();

    const fetched = await request.get(`${params.url}/api/todos/${id}`);
    expect(fetched.status()).toBe(200);
    expect((await fetched.json()).title).toBe('synthetic check');

    const deleted = await request.delete(`${params.url}/api/todos/${id}`);
    expect(deleted.status()).toBe(204);
  });
});
