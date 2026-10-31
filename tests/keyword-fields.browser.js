// Run with Playwright MCP browser_run_code_unsafe(filename), serving this folder on port 8765.
async (page) => {
  const base='http://127.0.0.1:8765/';
  const get=async name=>(await page.request.get(base+name)).text();
  const filter=await get('filter.js'),content=await get('content.js'),css=await get('content.css');
  const fixture=await page.context().newPage();
  const card=(id,name,tag,description)=>`<div class="column"><div class="listing-card server-${id}"><div class="server-name"><a>${name}</a></div><div class="server-tags"><span class="tag">${tag}</span></div><div class="server-description">${description}</div></div></div>`;
  try {
    await fixture.setContent(`<div id="listings"><div class="listing-page"><div class="columns">${card(101,'일반','차단','소개')}${card(102,'일반','태그','차단 소개')}${card(103,'차단 서버','태그','소개')}${card(104,'일반','태그','소개')}${card(105,'방문함','태그','소개')}</div></div></div>`);
    await fixture.evaluate(()=>{window.listeners=[];window.chrome={storage:{local:{get:async()=>({settings:{enabled:true,keywords:['차단']},'visited:104':true})},onChanged:{addListener:fn=>window.listeners.push(fn)}}};});
    await fixture.addStyleTag({content:css});await fixture.addScriptTag({content:filter});await fixture.addScriptTag({content});
    await fixture.waitForFunction(()=>document.querySelectorAll('.listing-card.disboard-filter-hidden').length===3);
    for(const id of [101,102,103]) if(!await fixture.locator(`.server-${id}`).evaluate(el=>getComputedStyle(el.parentElement).display==='none')) throw new Error('Matching field must collapse card and column');
    await fixture.evaluate(()=>window.listeners.forEach(fn=>fn({settings:{newValue:{enabled:true,keywords:['방문함']}}},'local')));
    await fixture.waitForFunction(()=>document.querySelector('.server-105').classList.contains('disboard-filter-hidden'));
    if(await fixture.locator('.server-104').evaluate(el=>el.classList.contains('disboard-filter-hidden'))) throw new Error('Injected badge is not a server name');
    await fixture.evaluate(html=>document.querySelector('.columns').insertAdjacentHTML('beforeend',html),card(106,'차단 새 서버','태그','소개'));
    await fixture.evaluate(()=>window.listeners.forEach(fn=>fn({settings:{newValue:{enabled:true,keywords:['차단']}}},'local')));
    await fixture.waitForFunction(()=>document.querySelectorAll('.listing-card.disboard-filter-hidden').length===4);
    await fixture.evaluate(()=>window.listeners.forEach(fn=>fn({settings:{newValue:{enabled:false,keywords:['차단']}}},'local')));
    await fixture.waitForFunction(()=>!document.querySelector('.disboard-filter-hidden'));
    return 'PASS: tag-only, description-only, name-only matches, visited badge ignored, real name preserved, dynamic cards, disabling restores all';
  } finally {await fixture.close();}
}
