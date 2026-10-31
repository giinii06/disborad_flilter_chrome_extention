(() => {
  const { keywordsFrom, settingsFrom, backupFromStorage, importBackup } = globalThis.DisboardFilter;
  const fields = document.querySelector('#fields');
  const form = document.querySelector('#keyword-form');
  const enabled = document.querySelector('#enabled');
  const keywords = document.querySelector('#keywords');
  const list = document.querySelector('#keyword-list');
  const status = document.querySelector('#status');
  const submit = document.querySelector('#save-keywords');
  const cancel = document.querySelector('#cancel-edit');
  const minOnline = document.querySelector('#min-online');
  const maxOnline = document.querySelector('#max-online');
  const excludeReviewed = document.querySelector('#exclude-reviewed');
  const excludeHan = document.querySelector('#exclude-han');
  const excludeVisited = document.querySelector('#exclude-visited');
  const excludeNew = document.querySelector('#exclude-new');
  let settings = settingsFrom();
  let editing = null;

  function message(text, error = false) {
    status.dataset.error = String(error);
    status.textContent = text;
  }

  function resetEditor() {
    editing = null;
    keywords.value = '';
    submit.textContent = '키워드 추가';
    cancel.hidden = true;
    document.querySelector('#keyword-label').textContent = '숨길 키워드 추가';
  }

  function render() {
    enabled.checked = settings.enabled;
    minOnline.value = settings.minOnline ?? '';
    maxOnline.value = settings.maxOnline ?? '';
    excludeReviewed.checked = settings.excludeReviewed;
    excludeHan.checked = settings.excludeHan;
    excludeVisited.checked = settings.excludeVisited;
    excludeNew.checked = settings.excludeNew;
    list.replaceChildren();
    document.querySelector('#keyword-count').textContent = `${settings.keywords.length}개`;
    document.querySelector('#empty').hidden = settings.keywords.length > 0;
    for (const keyword of settings.keywords) {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = keyword;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'secondary';
      edit.textContent = '수정';
      edit.setAttribute('aria-label', `${keyword} 수정`);
      edit.addEventListener('click', () => {
        editing = keyword;
        keywords.value = keyword;
        submit.textContent = '수정 저장';
        cancel.hidden = false;
        document.querySelector('#keyword-label').textContent = '저장한 키워드 수정';
        keywords.focus();
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.textContent = '삭제';
      remove.setAttribute('aria-label', `${keyword} 삭제`);
      remove.addEventListener('click', async () => {
        const saved = await save({ ...settings, keywords: settings.keywords.filter(value => value !== keyword) }, '키워드를 삭제했어요.');
        if (saved && editing === keyword) resetEditor();
      });
      item.append(name, edit, remove);
      list.append(item);
    }
  }

  async function save(next, text, records = {}) {
    fields.disabled = true;
    try {
      await chrome.storage.local.set({ ...records, settings: next });
      settings = next;
      render();
      message(text);
      return true;
    } catch {
      enabled.checked = settings.enabled;
      excludeReviewed.checked = settings.excludeReviewed;
      excludeHan.checked = settings.excludeHan;
      excludeVisited.checked = settings.excludeVisited;
      excludeNew.checked = settings.excludeNew;
      message('저장하지 못했어요. 입력한 내용은 남아 있어요. 다시 시도해 주세요.', true);
      return false;
    } finally {
      fields.disabled = false;
    }
  }

  chrome.storage.local.get('settings').then(stored => {
    settings = settingsFrom(stored.settings);
    render();
    fields.disabled = false;
    message('저장한 키워드는 다음에 열어도 그대로 남아 있어요.');
  }).catch(() => message('목록을 불러오지 못했어요. 확장프로그램을 다시 열어 주세요.', true));

  enabled.addEventListener('change', () => {
    save({ ...settings, enabled: enabled.checked }, `필터를 ${enabled.checked ? '켰어요' : '껐어요'}.`);
  });
  cancel.addEventListener('click', resetEditor);
  document.querySelector('#online-range-form').addEventListener('submit', async event => {
    event.preventDefault();
    const min = minOnline.value === '' ? null : Number(minOnline.value);
    const max = maxOnline.value === '' ? null : Number(maxOnline.value);
    if ([min, max].some(value => value !== null && (!Number.isSafeInteger(value) || value < 0))) {
      message('인원은 0 이상의 정수로 입력해 주세요.', true);
      return;
    }
    if (min !== null && max !== null && min > max) {
      message('최소 인원은 최대 인원보다 클 수 없어요.', true);
      return;
    }
    await save({ ...settings, minOnline: min, maxOnline: max }, '온라인 인원 수 범위를 저장했어요.');
  });
  for (const [input, key] of [[excludeReviewed, 'excludeReviewed'], [excludeHan, 'excludeHan'], [excludeVisited, 'excludeVisited'], [excludeNew, 'excludeNew']]) {
    input.addEventListener('change', () => save({ ...settings, [key]: input.checked }, '제외 조건을 저장했어요.'));
  }
  document.querySelector('#export-keywords').addEventListener('click', async () => {
    fields.disabled = true;
    try {
      const backup = backupFromStorage(await chrome.storage.local.get(null));
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'disboard-backup.json';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      message(`전체 백업을 내보냈어요. 키워드 ${backup.settings.keywords.length}개 · 방문 ${backup.visitedServers.length}개`);
    } catch {
      message('백업을 내보내지 못했어요. 다시 시도해 주세요.', true);
    } finally { fields.disabled = false; }
  });
  const importFile = document.querySelector('#import-file');
  document.querySelector('#import-keywords').addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', async () => {
    const file = importFile.files[0];
    if (!file) return;
    fields.disabled = true;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('10MB 이하의 JSON 파일을 선택해 주세요.');
      const stored = await chrome.storage.local.get(null);
      const imported = importBackup(await file.text(), settingsFrom(stored.settings));
      const records = Object.fromEntries(imported.visitedServers.map(id => [`visited:${id}`, true]));
      if (await save(imported.settings, '백업을 가져왔어요. 설정을 복원하고 기존 키워드·방문 기록은 유지했어요.', records)) resetEditor();
    } catch (error) {
      message(error.message, true);
    } finally {
      fields.disabled = false;
      importFile.value = '';
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const entries = keywordsFrom(keywords.value);
    if (!entries.length || (editing !== null && entries.length !== 1)) {
      message(editing === null ? '추가할 키워드를 입력해 주세요.' : '수정할 키워드는 하나만 입력해 주세요.', true);
      return;
    }
    const remaining = settings.keywords.filter(value => value !== editing);
    if (entries.some(value => remaining.includes(value))) {
      message('이미 저장된 키워드가 있어요. 중복 항목을 빼고 다시 저장해 주세요.', true);
      return;
    }
    const next = editing === null ? [...settings.keywords, ...entries]
      : settings.keywords.map(value => value === editing ? entries[0] : value);
    if (await save({ ...settings, keywords: next }, editing === null ? '키워드를 추가했어요.' : '키워드를 수정했어요.')) {
      resetEditor();
    }
  });
})();
