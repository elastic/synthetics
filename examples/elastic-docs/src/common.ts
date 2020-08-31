import { step } from 'elastic-synthetics';

export const goToElasticHome = () => {
    step("go to elastic homepage", async (page) => {
        await page.goto("https://www.elastic.co")
    });
}

export const goToDocsHome = () => {
    step("go to elastic homepage", async (page) => {
        await page.goto("https://www.elastic.co/guide/index.html")
    });
}