// Run with Playwright MCP browser_run_code_unsafe(filename), serving this folder on port 8765.
async (page) => {
  const base = 'http://127.0.0.1:8765/';
  const get = async name => (await page.request.get(base + name)).text();
  const filter = await get('filter.js'), content = await get('content.js'), css = await get('content.css');
  const fixture = await page.context().newPage();
  const card = (name, tag) => `<div class="column"><div class="listing-card" style="height:100px"><div class="server-name">${name}</div><div class="server-tags"><span class="tag">${tag}</span></div></div></div>`;
  try {
    await fixture.setViewportSize({width: 1200, height: 800});
    await fixture.setContent(`<div id="listings"><div class="listing-page" data-page="1"><div class="columns">${card('A', 'ok')}${card('B', 'bad')}${card('C', 'ok')}</div></div><div class="listing-page" data-page="2"><div class="columns">${card('D', 'ok')}${card('E', 'ok')}</div></div></div>`);
    await fixture.evaluate(() => {
      window.listeners = [];
      window.chrome = {storage: {local: {get: async () => ({settings: {enabled: true, keywords: ['bad']}})}, onChanged: {addListener: fn => window.listeners.push(fn)}}};
    });
    await fixture.addStyleTag({content: css});
    await fixture.addScriptTag({content: filter});
    await fixture.addScriptTag({content});
    await fixture.waitForFunction(() => document.querySelector('.disboard-filter-hidden'));
    for (const [width, columns] of [[1200, 3], [900, 2], [500, 1]]) {
      await fixture.setViewportSize({width, height: 800});
      const positions = await fixture.evaluate(() => [...document.querySelectorAll('.listing-card:not(.disboard-filter-hidden)')].map(card => {
        const rect = card.getBoundingClientRect();
        return {name: card.querySelector('.server-name').textContent, x: rect.x, y: rect.y};
      }));
      for (let i = 1; i < positions.length; i++) {
        const first = positions[i - i % columns];
        if (positions[i].y !== first.y) throw new Error(`Gap at width ${width}, card ${positions[i].name}`);
        if (i % columns === 0 && positions[i].x !== positions[0].x) throw new Error('New row must start in first column');
      }
    }
    await fixture.evaluate(() => window.listeners.forEach(fn => fn({settings: {newValue: {enabled: false}}}, 'local')));
    await fixture.waitForFunction(() => !document.querySelector('.disboard-filter-compact') && !document.querySelector('.disboard-filter-hidden'));
    return 'PASS: cards pack across pages at three, two, and one columns; disabling restores original layout';
  } finally { await fixture.close(); }
}
