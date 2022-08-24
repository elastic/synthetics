import { step, Page, expect } from '@elastic/synthetics';

// This file contains helper files for advanced-example.journey.ts
// The functions here let you write more concise tests  and re-use functionality
// across tests.

export const loadAppStep = (page: Page, url: string) => {
  step('launch app', async () => {
    await page.goto(url);
  });
};

export const addTaskStep = (page: Page, task: string) => {
  step(`add task ${task}`, async () => {
    const input = await page.locator('input.new-todo');
    await input.type(task);
    await input.press('Enter');
  });
};

const todosSelector = 'ul.todo-list li.todo';

export const findTask = async (page: Page, task: string) => {
  return await page.locator(`${todosSelector} >> text="${task}"`);
};

export const assertTaskListCountStep = async (page: Page, count: number) => {
  step(`check that task list has exactly ${count} elements`, async () => {
    const tasks = await page.locator(todosSelector);
    expect(await tasks.count()).toBe(count);
  });
};

export const checkForTaskStep = async (page: Page, task: string) => {
  step(`check for task '${task}' in list`, async () => {
    return findTask(page, task);
  });
};

export const destroyTaskStep = async (page: Page, task: string) => {
  step(`destroy task '${task}'`, async () => {
    const label = await findTask(page, task);
    // xpath indexes arrays starting at 1!!! Easy to forget!
    const li = await label.locator('xpath=ancestor::li[1]');
    const destroyButton = await li.locator('button');
    // The destroy button is not visible until hovered. Setup a click test which
    // will wait up to 30s for the button to be visible.
    const clickFuture = destroyButton.click();
    // now hover, making the destroy button clickable
    await li.hover();
    // now we are done
    await clickFuture;
  });
};
