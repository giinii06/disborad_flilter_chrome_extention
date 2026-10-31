// Run with Playwright MCP browser_run_code_unsafe(filename), serving this folder on port 8765.
async (page) => {
  const base = 'http://127.0.0.1:8765/';
  const get = async name => (await page.request.get(base + name)).text();
  const filter = await get('filter.js'), content = await get('content.js'), css = await get('content.css');
  const card = id => `<div class="column"><div class="listing-card server-${id}"><div class="server-name"><a href="/ko/server/${id}">Server ${id}</a></div><div class="server-join"><a class="button-join" href="/ko/server/join/${id}" target="_blank"><span>Join ${id}</span></a></div></div></div>`;
  const fixture = await page.context().newPage();
  const second = await page.context().newPage();
  const joined = [];
  let requests = 0;
  function check(value, text) { if (!value) throw new Error(text); }
  for (const tab of [fixture, second]) {
    await tab.route('**/tests/visit-fixture*', route => {
      if (new URL(route.request().url()).searchParams.has('page')) {
        requests++;
        return route.fulfill({body: ''});
      }
      return route.fulfill({contentType: 'text/html; charset=utf-8', body: `<div id="listings"><div class="listing-page" data-page="1"><div class="columns">${card(101)}${card(102)}</div></div></div><button id="load-more">Load More</button>`});
    });
    await tab.addInitScript(() => {
      window.listeners = [];
      window.writes = [];
      const read = () => JSON.parse(localStorage.getItem('visit-test-data') || '{"settings":{"enabled":true,"keywords":[]}}');
      function notify(before, after) {
        const changes = {};
        for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
          if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes[key] = {oldValue: before[key], newValue: after[key]};
        }
        window.listeners.forEach(fn => fn(changes, 'local'));
      }
      window.chrome = {storage: {
        local: {
          get: async () => read(),
          set: async values => {
            if (window.failSave) throw new Error('Storage unavailable');
            window.writes.push(values);
            const before = read(), after = {...before, ...values};
            localStorage.setItem('visit-test-data', JSON.stringify(after));
            notify(before, after);
          },
        },
        onChanged: {addListener: fn => window.listeners.push(fn)},
      }};
      window.addEventListener('storage', event => {
        if (event.key === 'visit-test-data') notify(JSON.parse(event.oldValue || '{}'), JSON.parse(event.newValue || '{}'));
      });
    });
  }
  // Join navigation is a local fixture, never Discord.
  await page.context().route('**/ko/server/join/*', route => route.fulfill({contentType: 'text/html', body: '<p>Test join destination</p>'}));
  async function open(tab) {
    await tab.goto(base + 'tests/visit-fixture');
    await tab.addStyleTag({content: css});
    await tab.addScriptTag({content: filter});
    await tab.addScriptTag({content});
    await tab.waitForFunction(() => document.querySelector('#disboard-filter-summary'));
  }
  try {
    await fixture.goto(base + 'tests/visit-fixture');
    await fixture.evaluate(() => localStorage.removeItem('visit-test-data'));
    await open(fixture); await open(second);
    const opened = fixture.waitForEvent('popup');
    await fixture.locator('.server-101 .button-join span').click();
    joined.push(await opened);
    await fixture.waitForFunction(() => document.querySelector('.server-101 .server-name .disboard-visited-badge'));
    await second.waitForFunction(() => document.querySelector('.server-101 .disboard-visited-badge'));
    check((await fixture.evaluate(() => window.writes[0]))['visited:101'] === true, 'Store server ID independently');
    await fixture.locator('.server-101 .button-join').evaluate(link => { link.addEventListener('click', event => event.preventDefault(), {once:true}); link.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true})); });
    check(await fixture.evaluate(() => window.writes.length) === 1, 'Repeated clicks must not create duplicate records');
    await open(fixture);
    check(await fixture.locator('.server-101 .disboard-visited-badge').count() === 1, 'Visited marker must restore after reload');
    await fixture.evaluate(() => chrome.storage.local.set({settings: {enabled:true, keywords:[], excludeVisited:true}}));
    await fixture.waitForFunction(() => document.querySelector('.server-101').classList.contains('disboard-filter-hidden'));
    await fixture.waitForFunction(() => document.querySelector('#load-more').textContent === '마지막 목록');
    check(requests === 1, 'Visited exclusion must refill missing cards');
    await fixture.evaluate(() => chrome.storage.local.set({settings: {enabled:true, keywords:[], excludeVisited:false}}));
    await fixture.waitForFunction(() => !document.querySelector('.server-101').classList.contains('disboard-filter-hidden'));
    await fixture.evaluate(() => { window.failSave = true; });
    const failedJoin = fixture.waitForEvent('popup');
    await fixture.locator('.server-102 .button-join').click();
    joined.push(await failedJoin);
    await fixture.waitForFunction(() => document.querySelector('#disboard-filter-summary').textContent.includes('저장하지 못했어요'));
    check(await fixture.locator('.server-102 .disboard-visited-badge').count() === 0, 'Failed writes must not mark visited');
    await fixture.evaluate(() => { window.failSave = false; });
    const retry = fixture.waitForEvent('popup');
    await fixture.locator('.server-102 .button-join').click();
    joined.push(await retry);
    await fixture.waitForFunction(() => document.querySelector('.server-102 .disboard-visited-badge'));
    await second.waitForFunction(() => document.querySelector('.server-102 .disboard-visited-badge'));
    check(!(await fixture.locator('#disboard-filter-summary').textContent()).includes('저장하지 못했어요'), 'Successful retry clears the failure notice');
    const records = await fixture.evaluate(() => JSON.parse(localStorage.getItem('visit-test-data')));
    check(records['visited:101'] && records['visited:102'], 'New visits must preserve previous records');
    // Newly inserted cards use the same delegated handler and saved status.
    await fixture.evaluate(html => document.querySelector('.columns').insertAdjacentHTML('beforeend', html), card(101));
    await fixture.waitForFunction(() => document.querySelectorAll('.server-101 .disboard-visited-badge').length === 2);
    await fixture.evaluate(() => {
      const link = document.createElement('a');
      link.href = '/ko/server/join/103';
      link.textContent = 'Detail page join';
      link.addEventListener('auxclick', event => event.preventDefault(), {once:true});
      document.body.append(link);
      link.dispatchEvent(new MouseEvent('auxclick', {bubbles:true, cancelable:true, button:1}));
    });
    await fixture.waitForFunction(() => JSON.parse(localStorage.getItem('visit-test-data'))['visited:103'] === true);
    await fixture.screenshot({path:'/Users/xo/cod/extention_disboard/.playwright-mcp/visited.png'});
    return 'PASS: nested join click, normal navigation, per-ID persistence, cross-tab updates, reload, duplicate clicks, visited filter, refill, failure and retry, dynamic cards';
  } finally {
    await fixture.evaluate(() => localStorage.removeItem('visit-test-data'));
    for (const tab of [...joined, fixture, second]) if (!tab.isClosed()) await tab.close();
    await page.context().unroute('**/ko/server/join/*');
  }
}
