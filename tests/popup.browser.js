// Run with Playwright MCP browser_run_code_unsafe(filename) while serving this folder on port 8765.
async (page) => {
  const context = page.context();
  async function open() {
    const popup = await context.newPage();
    await popup.addInitScript(() => {
      window.chrome = { storage: { local: {
        get: async () => JSON.parse(localStorage.getItem('filter-test-settings') || '{}'),
        set: async value => {
          if (window.failSave) throw new Error('Storage unavailable');
          localStorage.setItem('filter-test-settings', JSON.stringify({...JSON.parse(localStorage.getItem('filter-test-settings') || '{}'), ...value}));
        },
      } } };
    });
    await popup.goto('http://127.0.0.1:8765/popup.html');
    await popup.waitForFunction(() => !document.querySelector('#fields').disabled);
    return popup;
  }
  function check(value, text) { if (!value) throw new Error(text); }
  async function saved(popup) {
    await popup.waitForFunction(() => !document.querySelector('#fields').disabled);
    return popup.evaluate(() => JSON.parse(localStorage.getItem('filter-test-settings')).settings);
  }
  let popup = await open();
  try {
    await popup.evaluate(() => localStorage.setItem('filter-test-settings', JSON.stringify({settings: {enabled: true, keywords: ['대리']}})));
    await popup.reload();
    await popup.getByRole('button', {name: '대리 수정', exact: true}).waitFor();
    await popup.locator('#keywords').fill('홍보, NSFW');
    await popup.getByRole('button', {name: '키워드 추가', exact: true}).click();
    check((await saved(popup)).keywords.join(',') === '대리,홍보,nsfw', 'Adding must preserve saved keywords');
    await popup.close();
    popup = await open();
    check(await popup.locator('#keyword-list li').count() === 3, 'Reopening must restore the saved list');
    await popup.getByRole('button', {name: '대리 수정', exact: true}).click();
    await popup.locator('#keywords').fill('광고');
    await popup.getByRole('button', {name: '수정 저장', exact: true}).click();
    check((await saved(popup)).keywords.join(',') === '광고,홍보,nsfw', 'Editing must preserve other entries');
    await popup.getByRole('button', {name: '홍보 삭제', exact: true}).click();
    check((await saved(popup)).keywords.join(',') === '광고,nsfw', 'Deleting must preserve other entries');
    await popup.locator('#keywords').fill('ＮＳＦＷ');
    await popup.getByRole('button', {name: '키워드 추가', exact: true}).click();
    check((await popup.locator('#status').textContent()).includes('이미 저장된'), 'Duplicates must be rejected');
    await popup.getByRole('button', {name: '광고 수정', exact: true}).click();
    await popup.locator('#keywords').fill('변경');
    await popup.evaluate(() => { window.failSave = true; });
    await popup.getByRole('button', {name: '수정 저장', exact: true}).click();
    check((await saved(popup)).keywords.join(',') === '광고,nsfw', 'Failed save must retain stored data');
    check(await popup.locator('#keywords').inputValue() === '변경', 'Failed save must retain input');
    await popup.evaluate(() => { window.failSave = false; });
    await popup.getByRole('button', {name: '취소', exact: true}).click();
    await popup.locator('#enabled').uncheck();
    check((await saved(popup)).enabled === false, 'Filter toggle must persist');
    await popup.close();
    popup = await open();
    check(!(await popup.locator('#enabled').isChecked()), 'Reopening must restore disabled filter');
    check(await popup.locator('#keyword-list li').count() === 2, 'Reopening must retain edited list');
    await popup.screenshot({path: '/Users/xo/cod/extention_disboard/.playwright-mcp/saved-keywords.png'});
    await popup.locator('#import-file').setInputFiles('/Users/xo/cod/extention_disboard/tests/fixtures/keywords.json');
    check((await saved(popup)).keywords.length === 4, 'Import merges and deduplicates existing keywords');
    check(await popup.locator('#keyword-list img').count() === 0, 'Imported keywords must render as text');
    const beforeInvalid = JSON.stringify((await saved(popup)).keywords);
    await popup.locator('#import-file').setInputFiles('/Users/xo/cod/extention_disboard/tests/fixtures/invalid.json');
    await popup.waitForFunction(() => document.querySelector('#status').dataset.error === 'true');
    check(JSON.stringify((await saved(popup)).keywords) === beforeInvalid, 'Invalid import must preserve existing keywords');
    await popup.evaluate(() => { const original = URL.createObjectURL; URL.createObjectURL = blob => { window.exportedBlob = blob; return original(blob); }; });
    const downloaded = popup.waitForEvent('download');
    await popup.locator('#export-keywords').click();
    const download = await downloaded;
    check(download.suggestedFilename() === 'disboard-backup.json', 'Export must download JSON');
    const exported = await popup.evaluate(async () => JSON.parse(await window.exportedBlob.text()));
    check(JSON.stringify(exported.settings.keywords) === beforeInvalid, 'Export must contain the saved keyword list');
    await popup.screenshot({path: '/Users/xo/cod/extention_disboard/.playwright-mcp/discord-ui.png'});
    await popup.locator('.extra-filters summary').click();
    await popup.locator('#min-online').fill('100');
    await popup.locator('#max-online').fill('50');
    await popup.getByRole('button', {name: '인원 범위 저장'}).click();
    check((await popup.locator('#status').textContent()).includes('최소 인원'), 'Reversed range must not save');
    await popup.locator('#max-online').fill('500');
    await popup.getByRole('button', {name: '인원 범위 저장'}).click();
    check((await saved(popup)).minOnline === 100 && (await saved(popup)).maxOnline === 500, 'Online range persists');
    await popup.locator('#exclude-reviewed').check(); await saved(popup);
    await popup.locator('#exclude-han').check(); await saved(popup);
    await popup.locator('#exclude-visited').check(); await saved(popup);
    await popup.locator('#exclude-new').check(); await saved(popup);
    await popup.close();
    popup = await open();
    check((await saved(popup)).excludeReviewed === true && (await saved(popup)).excludeHan === true, 'Criteria persist across reopen');
    check((await saved(popup)).excludeVisited === true && await popup.locator('#exclude-visited').isChecked(), 'Visited toggle restores across reopen');
    check((await saved(popup)).excludeNew === true && await popup.locator('#exclude-new').isChecked(), 'New exclusion restores across reopen');
    check(await popup.locator('#min-online').inputValue() === '100', 'Range restores across reopen');
    await popup.locator('.extra-filters summary').click();
    await popup.evaluate(() => { window.failSave = true; });
    await popup.locator('#exclude-reviewed').evaluate(input => input.click());
    await saved(popup);
    check(await popup.locator('#exclude-reviewed').isChecked(), 'Failed save must restore criterion toggle');
    await popup.screenshot({path: '/Users/xo/cod/extention_disboard/.playwright-mcp/criteria.png', fullPage: true});
    await popup.evaluate(() => { window.failSave = false; const data=JSON.parse(localStorage.getItem('filter-test-settings'));data['visited:999']=true;localStorage.setItem('filter-test-settings',JSON.stringify(data)); });
    const beforeFailedImport=await popup.evaluate(()=>localStorage.getItem('filter-test-settings'));
    await popup.evaluate(()=>{window.failSave=true;});
    await popup.locator('#import-file').setInputFiles('/Users/xo/cod/extention_disboard/tests/fixtures/full-backup.json');
    await popup.waitForFunction(()=>document.querySelector('#status').dataset.error==='true' && !document.querySelector('#fields').disabled);
    check(await popup.evaluate(()=>localStorage.getItem('filter-test-settings'))===beforeFailedImport, 'Failed import preserves both settings and visits');
    await popup.evaluate(()=>{window.failSave=false;});
    await popup.locator('#import-file').setInputFiles('/Users/xo/cod/extention_disboard/tests/fixtures/full-backup.json');
    const restored=await saved(popup);
    check(restored.minOnline===20 && restored.maxOnline===80 && restored.excludeNew===true && restored.enabled===false, 'Full backup restores settings');
    check(restored.keywords.includes('복원키워드') && restored.keywords.includes('광고'), 'Full backup merges keywords');
    const all=await popup.evaluate(()=>JSON.parse(localStorage.getItem('filter-test-settings')));
    check(all['visited:101']&&all['visited:202']&&all['visited:999'], 'Full backup merges visited records');
    const beforeBad=JSON.stringify(all);
    await popup.locator('#import-file').setInputFiles('/Users/xo/cod/extention_disboard/tests/fixtures/invalid-backup.json');
    await popup.waitForFunction(()=>document.querySelector('#status').dataset.error==='true');
    check(await popup.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('filter-test-settings'))))===beforeBad, 'Invalid backup preserves all existing data');
    await popup.evaluate(() => { const original=URL.createObjectURL; URL.createObjectURL=blob=>{window.exportedBlob=blob;return original(blob);}; });
    await popup.locator('#export-keywords').click();
    await popup.waitForFunction(()=>document.querySelector('#status').textContent.includes('전체 백업'));
    const full=await popup.evaluate(async()=>JSON.parse(await window.exportedBlob.text()));
    check(full.version===2 && full.visitedServers.includes('999') && full.settings.excludeNew===true, 'Full export includes settings and visits');
    return 'PASS: full backup restore and merge, legacy import, settings and visits export, invalid file preservation, New toggle, online range, range validation, review and Han persistence, failure rollback, old data, add, reopen, edit, delete, duplicates, failed save, toggle, JSON import merge, invalid import, safe text, export download';
  } finally {
    if (!popup.isClosed()) {
      await popup.evaluate(() => localStorage.removeItem('filter-test-settings'));
      await popup.close();
    }
  }
}
