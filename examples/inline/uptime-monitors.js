step('Go to kibana uptime app', async () => {
  await page.goto('http://localhost:5601/app/uptime');
});

step('Enter username and password', async () => {
  await page.fill('input[data-test-subj=loginUsername]', 'admin');
  await page.fill('input[data-test-subj=loginPassword]', 'changeme');
});

step('submit form', async () => {
  await page.click('button[data-test-subj=loginSubmit]');
});

step('Check if there is table data', async () => {
  await page.click('[data-test-subj=uptimeOverviewPage]');
  await page.click('table');
});

step('Click on my monitor', async () => {
  await page.click('[data-test-subj=monitor-page-link-my-monitor]');
});

step('It navigates to details page', async () => {
  await page.click('[data-test-subj=uptimeMonitorPage]');
});
