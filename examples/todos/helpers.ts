import { step, Page, expect } from '@elastic/synthetics';

export const loadAppStep = (page: Page, url: string) => {
  step('launch app', async () => {
    await page.goto(url);
  });
};

export const addTaskStep = (page: Page, task: string) => {
  step(`add task ${task}`, async () => {
    const input = await page.$('input.new-todo');
    await input.type(task);
    await input.press('Enter');
  });
};

const todosSelector = 'ul.todo-list li.todo';

export const findTask = async (page: Page, task: string) => {
  return await page.waitForSelector(`${todosSelector} >> text="${task}"`);
};

export const assertTaskListSizeStep = async (page: Page, size: number) => {
  step(`check that task list has exactly ${size} elements`, async () => {
    expect((await page.$$(todosSelector)).length).toBe(size);
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
    const li = await label.$('xpath=ancestor::li[1]');
    const destroyButton = await li.$('button');

    // The destroy button is not visible until hovered. Setup a click test which
    // will wait up to 30s for the button to be visible.
    const clickFuture = destroyButton.click();
    // now hover, making the destroy button clickable
    li.hover();
    // now we are done
    await clickFuture;
  });
};
