**Note: This is my no means the final DSL, It just serves as a starting point for us to dig deeper in to DSL space and analyse all the pros & cons of the approach**

### Common Functionalities

- Navigate
- Click
- Type (Form or search)
- find elements by id, class, tag, etc
- Asserting elements
- Screenshot (Implied - will be captured by the agent for each step regardless)

### Must haves - Design

- Error recovery from any point in time. We should be able to recover from any kind of user/server level errors
- Debug logs for every step
- Retry should be baked in (querying elements should always get the element, users shouldn't need to call `wait` or some other similar form to wait for element's existence, this would make us support more commands).

### DSL for common flows

1. Typical search page in e-commerce

```
navigate('example.com')
type('#search', 't-shirt')
click('.submit')
contains('some text') // elements as well
screenshot()  // implied
```

2.  Login flow

```
navigate('example.com')
type('#username', 'test')
type('#password', env['password'])
click('#element')
contains('some text')
```

Most of the inspiration for the DSL is from Cypress, WebpageTest and Siteepeed.io.

### Extensibility

One advantage of the approach is the ease of adding new commands. If we want to add support for capturing performance metrics, we could simple add a new DSL for that

```
metrics('paint') // this would capture all of the paint related metrics like FCP, LCP.

metrics('web-vitals')

```

### Transformation

Each of the commands in the DSL would translate in to the puppeteer script that looks similar to this

```
navigate -> page.goto
click -> page.click
type -> page.type
contains -> page.waitForSelector, waitForTarget // this depends on our retry strategy like waiting for particular CLASS, TAG or ID.
screenshot -> page.screenshot
```

### Questions

- Do we allow the user to get cookie information? Helps with doing A/B testing user journeys
- Mobile emulation / View port controls?
- Should we allow users to find element by XPath - Ron suggested an nice library for doing this https://github.com/cyluxx/robula-plus
- Should we allow user to add meta information for the synthetic steps (like APM labels) ?

### Can we extend Cypress?

Cypress has a plugin architecture that would let users write arbitrary commands which would accomplish all of the above code without having to do much from our side.

Cons

- Cypress can become a paid product at some point in future and might change the licensing (MIT right now).
- Cypress controls the full flow of launching browsers and communicating back and forth with the forked browser process.

I am looking more in to Cypress internal architecture, will follow up in the same thread with more details.
