import {
  step,
  APIRequestContext,
  APIResponse,
  expect,
} from '@elastic/synthetics';

// Helpers for `advanced-api-example.journey.ts` — same idea as
// `advanced-example-helpers.ts` for browser journeys, but operating on
// `APIRequestContext` instead of `Page`. Wrapping each call in a `step`
// gives you per-request timing, status, and error attribution in the
// reporter output.

/**
 * Generic "assert this call returns the expected status" wrapper. Useful
 * when a step is just a single request with a known good status code
 * and you don't need to inspect the body.
 */
export const expectStatusStep = (
  name: string,
  call: () => Promise<APIResponse>,
  expectedStatus = 200
) => {
  step(name, async () => {
    const res = await call();
    expect(res.status()).toBe(expectedStatus);
  });
};

export const listTodosStep = (
  request: APIRequestContext,
  apiUrl: string,
  state: { ids: number[] }
) => {
  step('list todos', async () => {
    const res = await request.get(`${apiUrl}/todos?_limit=5`);
    expect(res.status()).toBe(200);
    const todos: Array<{ id: number }> = await res.json();
    expect(todos.length).toBeGreaterThan(0);
    state.ids = todos.map(t => t.id);
  });
};

export const createTodoStep = (
  request: APIRequestContext,
  apiUrl: string,
  title: string,
  state: { createdId?: number }
) => {
  step(`create todo "${title}"`, async () => {
    const res = await request.post(`${apiUrl}/todos`, {
      data: { title, completed: false, userId: 1 },
    });
    expect(res.status()).toBe(201);
    const created = await res.json();
    expect(created).toMatchObject({ title, completed: false });
    state.createdId = created.id;
  });
};

/**
 * Delete a todo whose id is produced by an earlier step. The id is
 * supplied as a thunk so the step builder can be registered up-front
 * but resolve the actual id lazily, at execution time, after the
 * earlier step has populated state.
 */
export const deleteTodoStep = (
  request: APIRequestContext,
  apiUrl: string,
  getId: () => number | undefined
) => {
  step('delete created todo', async () => {
    const id = getId();
    if (id == null) return; // earlier step didn't produce an id; skip silently
    const res = await request.delete(`${apiUrl}/todos/${id}`);
    // jsonplaceholder returns 200 for DELETE; real APIs typically 204.
    expect([200, 204]).toContain(res.status());
  });
};
