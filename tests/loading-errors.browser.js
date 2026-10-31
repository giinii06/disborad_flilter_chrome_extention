// Run with Playwright MCP browser_run_code_unsafe(filename), serving this folder on port 8765.
async (page) => {
  const base='http://127.0.0.1:8765/';
  const get=async name=>(await page.request.get(base+name)).text();
  const filter=await get('filter.js'), content=await get('content.js'), css=await get('content.css');
  const card='<div class="column"><div class="listing-card server-101"><div class="server-tags"><span class="tag">bad</span></div></div></div>';
  const results=[];
  async function run(mode,expected) {
    const fixture=await page.context().newPage();
    let requests=0,concurrent=0,maxConcurrent=0;
    const times=[];
    await fixture.route('**/tests/error-fixture*',async route=>{
      if (!new URL(route.request().url()).searchParams.has('page')) {
        const max=mode==='known-limit' ? '<script>window.disboard={};window.disboard.maxPage = 50;</script>' : '';
        return route.fulfill({contentType:'text/html; charset=utf-8',body:`${max}<div id="listings"><div class="listing-page" data-page="${mode==='known-limit'?50:14}"><div class="columns">${card}</div></div></div><button id="load-more">More</button>`});
      }
      requests++;concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent);times.push(Date.now());
      let options={body:''};
      if(mode==='403') options={status:403,body:'Forbidden'};
      if(mode==='429') options={status:429,headers:{'Retry-After':'0'},body:'Too many requests'};
      if(mode==='recover429'&&requests===1) options={status:429,headers:{'Retry-After':'1'},body:'Too many requests'};
      if(mode==='503'&&requests<3) options={status:503,headers:{'Retry-After':'0'},body:'Unavailable'};
      if(mode==='limit-body') options={body:'<p>Sorry, DISBOARD does not serve more than 50 pages for any query</p>'};
      await route.fulfill(options);concurrent--;
    });
    try {
      await fixture.goto(base+'tests/error-fixture');
      await fixture.evaluate(()=>{window.listeners=[];window.chrome={storage:{local:{get:async()=>({settings:{enabled:true,keywords:['bad']}})},onChanged:{addListener:fn=>window.listeners.push(fn)}}};});
      await fixture.addStyleTag({content:css});await fixture.addScriptTag({content:filter});await fixture.addScriptTag({content});
      await fixture.waitForFunction(text=>document.querySelector('#disboard-filter-summary')?.textContent.includes(text),expected,{timeout:8000});
      await fixture.waitForTimeout(500);
      const expectedRequests={'403':1,'429':3,recover429:2,'503':3,'known-limit':0,'limit-body':1}[mode];
      if(requests!==expectedRequests||maxConcurrent>1) throw new Error(mode+': unexpected retry count or concurrency '+requests);
      if(mode==='recover429'&&times[1]-times[0]<1000) throw new Error('Retry-After must be respected');
      results.push({mode,requests,summary:await fixture.locator('#disboard-filter-summary').textContent()});
    } finally {await fixture.close();}
  }
  await run('403','HTTP 403, 15페이지');
  await run('429','요청 횟수 제한이 계속');
  await run('recover429','마지막 목록이에요');
  await run('503','마지막 목록이에요');
  await run('known-limit','마지막 목록(50페이지)');
  await run('limit-body','마지막 목록(50페이지)');
  return results;
}
