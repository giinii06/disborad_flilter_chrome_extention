// Run with Playwright MCP browser_run_code_unsafe(filename), serving this folder on port 8765.
async (page) => {
  const base = 'http://127.0.0.1:8765/';
  const get = async name => (await page.request.get(base + name)).text();
  const filter = await get('filter.js'), content = await get('content.js'), css = await get('content.css');
  const card = (tag, description, id = '', online = 100, name = '일반', review = false) => `<div class="column"><div class="listing-card ${id ? 'server-' + id : ''} ${review ? 'has-review' : ''}"><span class="server-online">${online}</span><div class="server-name">${name}</div><div class="server-tags"><a class="tag">${tag}</a></div><div class="server-description">${description}</div></div></div>`;
  const initial = `<div id="listings"><div class="listing-page" data-page="1"><div class="columns">${card('bad', 'hello', '123', 10)}${card('ok', 'bad description', '', 100, '東京')}${card('ok', 'safe', '', 100, '리뷰 서버', true)}${card('ok', 'safe', '', 300)}</div></div></div><button id="load-more">Load More</button>`;
  function check(value, text) { if (!value) throw new Error(text); }
  const fixture = await page.context().newPage();
  let requests = 0, mode = 'success';
  await fixture.route('**/tests/filter-fixture*', async route => {
    if (!new URL(route.request().url()).searchParams.has('page')) {
      return route.fulfill({contentType: 'text/html; charset=utf-8', body: initial});
    }
    requests++;
    if (mode === 'error') return route.fulfill({status: 403, body: 'Forbidden'});
    if (mode === 'empty') return route.fulfill({body: ''});
    if (mode === 'all-hidden') return route.fulfill({body: card('bad', 'safe')});
    return route.fulfill({contentType: 'text/html; charset=utf-8', body: card('ok', 'safe') + card('ok', 'safe') + card('bad', 'hello', '123')});
  });
  async function start(settings = {enabled: true, keywords: ['bad']}) {
    await fixture.goto(base + 'tests/filter-fixture');
    await fixture.evaluate(settings => {
      window.listeners = [];
      window.chrome = {storage: {local: {get: async () => ({settings})}, onChanged: {addListener: fn => window.listeners.push(fn)}}};
    }, settings);
    await fixture.addStyleTag({content: css});
    await fixture.addScriptTag({content: filter});
    await fixture.addScriptTag({content});
  }
  let stage = 'initial';
  try {
    await start();
    await fixture.waitForFunction(() => document.querySelectorAll('.listing-card').length === 6);
    await fixture.waitForTimeout(1000);
    check(requests === 1, 'Stop fetching once visible list is filled');
    check(await fixture.locator('.column.disboard-filter-hidden').count() === 2, 'Hide tags and descriptions with their layout columns');
    check(await fixture.locator('.server-123').count() === 1, 'Skip servers duplicated by changing rankings');
    await fixture.evaluate(() => window.listeners.forEach(fn => fn({settings: {newValue: {enabled: false, keywords: ['bad']}}}, 'local')));
    await fixture.waitForFunction(() => !document.querySelector('.disboard-filter-hidden'));
    mode = 'empty';
    await fixture.locator('#load-more').click();
    await fixture.waitForFunction(() => document.querySelector('#load-more').textContent === '마지막 목록');
    check((await fixture.locator('#load-more').textContent()) === '마지막 목록', 'Empty page stops pagination');
    stage = 'error';
    mode = 'error'; requests = 0;
    await start();
    await fixture.waitForFunction(() => document.querySelector('#disboard-filter-summary')?.textContent.includes('HTTP 403'));
    await fixture.waitForTimeout(1200);
    check(requests === 1, 'HTTP errors must not trigger automatic retries');
    mode = 'empty';
    await fixture.locator('#load-more').click();
    await fixture.waitForFunction(() => document.querySelector('#load-more').textContent === '마지막 목록');
    check(requests === 2, 'User can retry a failed request');
    stage = 'all-hidden';
    mode = 'all-hidden'; requests = 0;
    await start();
    await fixture.waitForFunction(() => document.querySelector('#disboard-filter-summary')?.textContent.includes('100페이지를 확인'), null, {timeout: 45000});
    await fixture.waitForTimeout(1000);
    check(requests === 100, 'Stop after one hundred batches when every new card is filtered');
    stage = 'criteria';
    mode = 'empty'; requests = 0;
    const criteria = {enabled: true, keywords: [], minOnline: 50, maxOnline: 200};
    await start(criteria);
    stage = 'range match';
    await fixture.waitForFunction(() => document.querySelectorAll('.listing-card:not(.disboard-filter-hidden)').length === 2, null, {timeout: 4000});
    await fixture.waitForFunction(() => document.querySelector('#load-more').textContent === '마지막 목록');
    stage = 'Han';
    check(requests === 1, 'Extra criteria must refill even without any keywords');
    await fixture.evaluate(settings => window.listeners.forEach(fn => fn({settings: {newValue: settings}}, 'local')), {...criteria, excludeHan: true});
    await fixture.waitForFunction(() => document.querySelectorAll('.listing-card:not(.disboard-filter-hidden)').length === 1, null, {timeout: 4000});
    stage = 'reviews';
    await fixture.evaluate(settings => window.listeners.forEach(fn => fn({settings: {newValue: settings}}, 'local')), {...criteria, excludeHan: true, excludeReviewed: true});
    await fixture.waitForFunction(() => document.querySelectorAll('.listing-card:not(.disboard-filter-hidden)').length === 0);
    await fixture.evaluate(() => window.listeners.forEach(fn => fn({settings: {newValue: {enabled: false}}}, 'local')));
    await fixture.waitForFunction(() => document.querySelectorAll('.listing-card:not(.disboard-filter-hidden)').length === 4);
    return 'PASS: online range, review toggle, Han toggle, refill without keywords, description match, column collapse, fill target, end of list, HTTP error stop, manual retry, hundred-batch limit';
  } catch (error) { throw new Error(stage + ': ' + error.message); } finally { await fixture.close(); }
}
