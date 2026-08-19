import { apiJourney, monitor, step, expect } from '@elastic/synthetics';

// API journeys run without launching a browser — they only use
// Playwright's APIRequestContext to hit HTTP endpoints. They are pushed
// to Kibana as HTTP-type monitors and are a good fit for OAuth-protected
// endpoints, multi-step API flows, and lightweight high-frequency checks.
//
// `params.apiUrl` is sourced from `synthetics.config.ts` and points at
// the jsonplaceholder.typicode.com demo API by default; override it for
// your own service via `--params '{"apiUrl":"..."}'` or per-environment
// in the config file.

apiJourney('My Example API Journey', ({ request, params }) => {
  // Only relevant for the push command to create
  // monitors in Kibana
  monitor.use({
    id: 'example-api-monitor',
    schedule: 10,
  });

  step('list todos', async () => {
    const res = await request.get(`${params.apiUrl}/todos`);
    expect(res.status()).toBe(200);
    const todos = await res.json();
    expect(Array.isArray(todos)).toBe(true);
    expect(todos.length).toBeGreaterThan(0);
  });

  step('fetch a single todo', async () => {
    const res = await request.get(`${params.apiUrl}/todos/1`);
    expect(res.status()).toBe(200);
    const todo = await res.json();
    expect(todo).toMatchObject({ id: 1, userId: expect.any(Number) });
  });
});
