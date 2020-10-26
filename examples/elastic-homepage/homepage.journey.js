const { step, journey } = require('@elastic/synthetics');

journey("Load the Elastic Homepage", ({page}) => {
    step("load it", async () => {
        await page.goto("https://www.elastic.co");
    });
});