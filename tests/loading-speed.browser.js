// Compare only the removed delay; both runs use 12 mock pages, 24 cards per page, 100ms responses.
async (page) => {
  const base = 'http://127.0.0.1:8765/';
  const get = async name => (await page.request.get(base + name)).text();
  const filter = await get('filter.js'), content = await get('content.js'), css = await get('content.css');
  if (!content.includes('setTimeout(loadMore, 350)')) throw new Error('Expected current paced loader');
  async function run(source) {
    const fixture = await page.context().newPage();
    let requests = 0, concurrent = 0, maxConcurrent = 0;
    const cards = n => Array.from({length:24}, (_,i)=>`<div class="column"><div class="listing-card server-${n * 24 + i}"><div class="server-tags"><span class="tag">bad</span></div></div></div>`).join('');
    await fixture.route('**/tests/speed-fixture*', async route => {
      const n = new URL(route.request().url()).searchParams.get('page');
      if (!n) return route.fulfill({contentType:'text/html; charset=utf-8',body:`<div id="listings"><div class="listing-page" data-page="1"><div class="columns">${cards(1)}</div></div></div><button id="load-more">More</button>`});
      requests++; concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(resolve=>setTimeout(resolve,100));
      await route.fulfill({contentType:'text/html; charset=utf-8',body:Number(n)<=13 ? cards(Number(n)) : ''});
      concurrent--;
    });
    try {
      await fixture.goto(base+'tests/speed-fixture');
      await fixture.evaluate(()=>{window.chrome={storage:{local:{get:async()=>({settings:{enabled:true,keywords:['bad']}})},onChanged:{addListener:()=>{}}}};});
      await fixture.addStyleTag({content:css});
      await fixture.addScriptTag({content:filter});
      const start = Date.now();
      await fixture.addScriptTag({content:source});
      await fixture.waitForFunction(()=>document.querySelector('#load-more').textContent==='마지막 목록',null,{timeout:25000});
      const ms = Date.now()-start;
      if (requests!==13 || maxConcurrent!==1) throw new Error('Requests must be sequential and stop on empty page');
      return {ms,requests,maxConcurrent,cards:await fixture.locator('.listing-card').count()};
    } finally { await fixture.close(); }
  }
  const after = await run(content);
  const before = await run(content.replace('setTimeout(loadMore, 350)', 'setTimeout(loadMore, 750)'));
  if (before.cards!==after.cards) throw new Error('Both runs must produce the same cards');
  if (before.ms-after.ms<3000) throw new Error('Expected removal of repeated delay');
  return {mock:'12 pages, 24 cards/page, 100ms response, then empty response',before,after,speedup:Number((before.ms/after.ms).toFixed(2))};
}
