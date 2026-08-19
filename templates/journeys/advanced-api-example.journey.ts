import { apiJourney, monitor, step, expect } from '@elastic/synthetics';
import {
  listTodosStep,
  createTodoStep,
  deleteTodoStep,
} from './advanced-api-example-helpers';

// This file demonstrates the recommended shape for non-trivial API
// monitors: small, named, reusable step builders, with shared state
// passed by reference between steps so later steps can act on data
// produced by earlier ones (e.g. a token from `/auth`, an id from
// `/create`, etc.).
//
// Each step gets its own entry in the reporter output, so you get
// per-request status, latency, and (for HTTPS) TLS / remote-address
// telemetry — same as a browser journey's network waterfall.
//
// Note on execution order: the journey callback below runs once at
// *registration* time and every `step(...)` call enqueues a step body
// that executes later, in order. We register all steps unconditionally
// at the top level and read `state` only inside step bodies — by the
// time a step body runs, the steps before it have already populated
// the shared object. If any prerequisite step fails, the runner skips
// the rest of the journey, so guards inside later steps are kept
// minimal.

apiJourney('todos API: list and round-trip a todo', ({ request, params }) => {
  monitor.use({
    id: 'todos-api-roundtrip',
    schedule: 10,
    tags: ['api', 'todos'],
  });

  // Shared state populated by earlier steps and consumed by later ones.
  const state: { ids: number[]; createdId?: number } = { ids: [] };

  listTodosStep(request, params.apiUrl, state);
  createTodoStep(request, params.apiUrl, 'synthetic check', state);

  // Inline step that reads `state` populated by `listTodosStep`. The
  // body runs after the previous steps have completed, so by this
  // point `state.ids` is populated.
  step('fetch first todo from list', async () => {
    expect(state.ids.length).toBeGreaterThan(0);
    const id = state.ids[0];
    const res = await request.get(`${params.apiUrl}/todos/${id}`);
    expect(res.status()).toBe(200);
    expect((await res.json()).id).toBe(id);
  });

  deleteTodoStep(request, params.apiUrl, () => state.createdId);
});
