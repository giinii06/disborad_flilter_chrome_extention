// Run with Playwright MCP browser_run_code_unsafe(filename), serving this folder on port 8765.
async (page) => {
  const base='http://127.0.0.1:8765/';
  const get=async name=>(await page.request.get(base+name)).text();
  const filter=await get('filter.js'),content=await get('content.js'),css=await get('content.css');
  const fixture=await page.context().newPage();
  try {
    await fixture.setContent('<div id="listings"><div class="listing-page"><div class="columns"><div class="column"><div class="listing-card is-new"><div class="server-name">Class marker</div></div></div><div class="column"><div class="listing-card"><div class="server-newborn">New!</div><div class="server-name">Badge marker</div></div></div><div class="column"><div class="listing-card"><div class="server-name">New Server</div><div class="server-description">New! in description</div></div></div></div></div></div>');
    await fixture.evaluate(()=>{window.listeners=[];window.chrome={storage:{local:{get:async()=>({settings:{enabled:true,keywords:[],excludeNew:true}})},onChanged:{addListener:fn=>window.listeners.push(fn)}}};});
    await fixture.addStyleTag({content:css});await fixture.addScriptTag({content:filter});await fixture.addScriptTag({content});
    await fixture.waitForFunction(()=>document.querySelectorAll('.listing-card.disboard-filter-hidden').length===2);
    if(await fixture.locator('.listing-card:not(.disboard-filter-hidden) .server-name').textContent()!=='New Server') throw new Error('Only actual New markers should be filtered');
    await fixture.evaluate(()=>window.listeners.forEach(fn=>fn({settings:{newValue:{enabled:true,keywords:[],excludeNew:false}}},'local')));
    await fixture.waitForFunction(()=>!document.querySelector('.disboard-filter-hidden'));
    return 'PASS: New class and badge markers, ordinary New text allowed, disabling restores cards';
  } finally {await fixture.close();}
}
