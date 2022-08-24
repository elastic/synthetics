import { journey } from '@elastic/synthetics';
import {
  loadAppStep,
  addTaskStep,
  assertTaskListCountStep,
  checkForTaskStep,
  destroyTaskStep,
} from './advanced-example-helpers';

// This file shows the use of re-usable functions, imported from
// `advanced-example-helpers.ts` to make writing tests that perform
// different combinations of similar functions simpler and with less
// duplication.

journey('addition and completion of single task', ({ page, params }) => {
  const testText = "Don't put salt in your eyes";

  loadAppStep(page, params.url);
  addTaskStep(page, testText);
  assertTaskListCountStep(page, 1);
  checkForTaskStep(page, testText);
  destroyTaskStep(page, testText);
  assertTaskListCountStep(page, 0);
});

journey('adding and removing multiple tasks', ({ page, params }) => {
  const testTasks = ['Task 1', 'Task 2', 'Task 3'];

  loadAppStep(page, params.url);
  testTasks.forEach(t => {
    addTaskStep(page, t);
  });

  assertTaskListCountStep(page, 3);

  // remove the middle task and check that it worked
  destroyTaskStep(page, testTasks[1]);
  assertTaskListCountStep(page, 2);

  // add a new task and check it exists
  addTaskStep(page, 'Task 4');
  assertTaskListCountStep(page, 3);
});
