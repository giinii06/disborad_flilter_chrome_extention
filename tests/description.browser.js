// Run with Playwright MCP browser_run_code_unsafe(filename), serving this folder on port 8765.
async (page) => {
  const base = 'http://127.0.0.1:8765/';
  const get = async name => (await page.request.get(base + name)).text();
  const filter = await get('filter.js'), content = await get('content.js'), css = await get('content.css');
  const fixture = await page.context().newPage();
  const lines = Array(25).fill('Long server description').join('<br>');
  const card = (id, body) => `<div class="column"><div class="listing-card server-${id}"><div class="server-name">Server ${id}</div><div class="server-description is-elastic-text" style="line-height:24px"><div class="elastic-text-inner">${body}</div></div></div></div>`;
  function check(value, text) { if (!value) throw new Error(text); }
  try {
    await fixture.setViewportSize({width:1200,height:800});
    await fixture.setContent(`<div id="listings"><div class="listing-page"><div class="columns">${card(1, lines)}</div></div><div class="listing-page disboard-filter-loaded"><div class="columns">${card(2, lines)}${card(3, 'Short')}</div></div></div>`);
    await fixture.evaluate(() => {
      window.listeners = [];
      window.chrome = {storage: {local: {get: async () => ({settings:{enabled:true, keywords:[]}})}, onChanged:{addListener:fn => window.listeners.push(fn)}}};
    });
    await fixture.addStyleTag({content:css});
    await fixture.addScriptTag({content:filter});
    await fixture.addScriptTag({content});
    const button = fixture.locator('.server-2 .disboard-description-toggle');
    await button.waitFor({state:'visible'});
    check(await fixture.locator('.server-1 .disboard-description-toggle').count() === 0, 'Keep original page controls intact');
    check(await fixture.locator('.server-3 .disboard-description-toggle').count() === 0, 'Short description needs no toggle');
    const description = fixture.locator('.server-2 .server-description');
    check(await description.evaluate(el=>el.clientHeight) === 160, 'Preview must be collapsed');
    await button.click();
    check(await button.getAttribute('aria-expanded') === 'true', 'Announce expansion');
    check(await description.evaluate(el=>el.clientHeight >= el.scrollHeight) === true, 'Full text must be visible');
    await button.click();
    check(await button.textContent() === '설명 더보기', 'Collapse restores button label');
    check(await description.evaluate(el=>el.clientHeight) === 160, 'Collapse restores preview height');
    await button.focus(); await fixture.keyboard.press('Enter');
    check(await button.getAttribute('aria-expanded') === 'true', 'Keyboard must expand the description');
    await fixture.evaluate(() => window.listeners.forEach(fn=>fn({settings:{newValue:{enabled:true,keywords:['Long']}}}, 'local')));
    await fixture.waitForFunction(()=>document.querySelector('.server-2').classList.contains('disboard-filter-hidden'));
    await fixture.evaluate(() => window.listeners.forEach(fn=>fn({settings:{newValue:{enabled:true,keywords:[]}}}, 'local')));
    await button.waitFor({state:'visible'});
    check(await fixture.locator('.server-2 .disboard-description-toggle').count() === 1, 'Refilter must not duplicate the toggle');
    await fixture.evaluate(html=>document.querySelector('.disboard-filter-loaded .columns').insertAdjacentHTML('beforeend',html),card(4,lines));
    await fixture.locator('.server-4 .disboard-description-toggle').waitFor({state:'visible'});
    return 'PASS: long and short descriptions, expand, collapse, keyboard, filter restoration, no duplicate controls, dynamic cards';
  } finally { await fixture.close(); }
}
