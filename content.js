(() => {
  const { settingsFrom, shouldHide, onlineCountFrom, retryDelayMs } = globalThis.DisboardFilter;
  const cardSelector = '.listing-card, .server-card';
  let settings = settingsFrom();
  let frame = null;
  let revision = 0;
  let target = 0;
  let loading = false;
  let stopped = false;
  let exhausted = false;
  let batches = 0;
  let timer = null;
  let controlled = false;
  let controller = null;
  let note = '';
  let visitError = '';
  let summary;
  const visited = new Set();
  const savingVisits = new Set();
  let visitsChangedDuringLoad = new Set();
  const serverKey = card => card.className.match(/\bserver-(\d+)\b/)?.[1];
  let descriptionId = 0;

  function prepareDescription(card) {
    if (!card.closest('.disboard-filter-loaded')) return;
    const description = card.querySelector('.server-description');
    if (!description || description.nextElementSibling?.classList.contains('disboard-description-toggle')) return;
    description.classList.remove('is-elastic-text', 'et-enabled', 'et-expanded');
    description.querySelector('.read-more')?.remove();
    if (description.scrollHeight <= description.clientHeight) return;
    if (!description.id) description.id = `disboard-description-${++descriptionId}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'disboard-description-toggle';
    button.textContent = '설명 더보기';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', description.id);
    button.addEventListener('click', () => {
      const expanded = description.classList.toggle('disboard-description-expanded');
      button.setAttribute('aria-expanded', String(expanded));
      button.textContent = expanded ? '설명 접기' : '설명 더보기';
    });
    description.after(button);
  }

  async function recordVisit(event) {
    if (event.type === 'auxclick' && event.button !== 1) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link) return;
    const url = new URL(link.href);
    const id = url.pathname.match(/^\/(?:[a-z-]+\/)?server\/join\/(\d+)\/?$/)?.[1];
    if (url.origin !== location.origin || !id || visited.has(id) || savingVisits.has(id)) return;
    savingVisits.add(id);
    try {
      // One key per server keeps simultaneous clicks in different tabs from overwriting each other.
      await chrome.storage.local.set({ [`visited:${id}`]: true });
      visited.add(id);
      visitError = '';
      schedule();
    } catch (error) {
      console.error('DISBOARD 방문 기록을 저장하지 못했습니다.', error);
      visitError = '방문 기록을 저장하지 못했어요. 참가 버튼을 다시 눌러 주세요.';
      schedule();
    } finally {
      savingVisits.delete(id);
    }
  }

  document.addEventListener('click', recordVisit, true);
  document.addEventListener('auxclick', recordVisit, true);

  function showSummary(visible, hidden) {
    const listings = document.querySelector('#listings');
    if (!listings) return;
    if (!summary) {
      summary = document.createElement('p');
      summary.id = 'disboard-filter-summary';
      summary.setAttribute('role', 'status');
      listings.before(summary);
    }
    summary.hidden = !settings.enabled;
    const text = `필터 · 표시 ${visible}개 · 숨김 ${hidden}개${note ? ` · ${note}` : ''}${visitError ? ` · ${visitError}` : ''}`;
    if (summary.textContent !== text) summary.textContent = text;
  }

  function takeOver(button) {
    if (controlled) return;
    // The site's button stops its scroll loader; stop it before managing pagination ourselves.
    button.click();
    controlled = true;
    button.classList.add('disboard-filter-controlled');
    button.addEventListener('click', event => {
      event.stopImmediatePropagation();
      if (loading || exhausted) return;
      stopped = false;
      batches = 0;
      target += 24;
      loadMore();
    }, true);
  }

  async function loadMore() {
    const button = document.querySelector('#load-more');
    const listings = document.querySelector('#listings');
    if (loading || exhausted || !button || !listings) return;
    if (!controlled && button.classList.contains('loading')) {
      timer = setTimeout(schedule, 1000);
      return;
    }
    takeOver(button);
    loading = true;
    note = `빈자리를 채우는 중… (${batches + 1}/100페이지)`;
    button.disabled = true;
    schedule();
    controller = new AbortController();
    const requestRevision = revision;
    try {
      const pages = [...listings.querySelectorAll('.listing-page[data-page]')];
      const lastPage = Number(pages.at(-1)?.dataset.page);
      if (!Number.isSafeInteger(lastPage) || lastPage < 1) throw new Error('페이지 번호를 확인할 수 없어요.');
      const maxPage = [...document.scripts].map(script => script.textContent.match(/\bdisboard\.maxPage\s*=\s*(\d+)/)?.[1]).find(Boolean);
      if (maxPage && lastPage >= Number(maxPage)) {
        exhausted = true;
        note = `사이트에서 제공하는 마지막 목록(${maxPage}페이지)이에요.`;
        return;
      }
      const url = new URL(location.href);
      url.searchParams.set('page', String(lastPage + 1));
      let response, text;
      for (let attempt = 0; attempt < 3; attempt++) {
        const timeout = setTimeout(() => controller?.abort(), 15000);
        try {
          response = await fetch(url, {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin', signal: controller.signal,
          });
          text = await response.text();
        } finally { clearTimeout(timeout); }
        if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) break;
        const delay = retryDelayMs(response.headers.get('Retry-After'), response.status === 429 ? 30000 : 1000 * (attempt + 1));
        note = `${lastPage + 1}페이지 HTTP ${response.status} · ${Math.ceil(delay / 1000)}초 후 다시 시도해요 (${attempt + 1}/2)`;
        schedule();
        await new Promise((resolve, reject) => {
          const signal = controller.signal;
          const finish = () => { signal.removeEventListener('abort', abort); resolve(); };
          const timer = setTimeout(finish, delay);
          const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new DOMException('Aborted', 'AbortError')); };
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        });
      }
      const context = `HTTP ${response.status}, ${lastPage + 1}페이지`;
      if (response.status === 403) throw new Error(`사이트가 요청을 거부했어요 (${context}). DISBOARD에서 확인한 뒤 다시 시도해 주세요.`);
      if (response.status === 429) throw new Error(`요청 횟수 제한이 계속되고 있어요 (${context}). 잠시 후 아래 버튼으로 다시 시도해 주세요.`);
      if (!response.ok) throw new Error(`목록을 불러오지 못했어요 (${context}). 아래 버튼으로 다시 시도할 수 있어요.`);
      if (response.redirected) {
        const destination = new URL(response.url);
        if (destination.origin !== url.origin || destination.pathname !== url.pathname || destination.searchParams.get('page') !== url.searchParams.get('page')) {
          throw new Error(`${lastPage + 1}페이지 요청이 다른 페이지로 이동했어요. DISBOARD를 확인하고 새로고침해 주세요.`);
        }
      }
      if (!text.trim()) {
        exhausted = true;
        note = '마지막 목록이에요.';
        return;
      }
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const cards = [...doc.querySelectorAll(cardSelector)];
      const pageLimit = !cards.length && doc.body.textContent.match(/does not serve more than (\d+) pages/i)?.[1];
      if (pageLimit) {
        exhausted = true;
        note = `사이트에서 제공하는 마지막 목록(${pageLimit}페이지)이에요.`;
        return;
      }
      if (!cards.length || doc.querySelector('html > head > title')) {
        throw new Error('추가 목록을 확인할 수 없어요. 사이트를 확인해 주세요.');
      }
      const page = document.createElement('div');
      page.className = 'listing-page disboard-filter-loaded';
      page.dataset.page = String(lastPage + 1);
      const columns = document.createElement('div');
      columns.className = 'columns is-multiline';
      const seen = new Set([...document.querySelectorAll(cardSelector)].map(serverKey).filter(Boolean));
      for (const card of cards) {
        const key = serverKey(card);
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        const node = card.closest('.column') || card;
        node.querySelectorAll('script, iframe, object, embed, link, style').forEach(el => el.remove());
        for (const el of [node, ...node.querySelectorAll('*')]) {
          for (const attr of [...el.attributes]) {
            if (attr.name.startsWith('on') || /^(?:javascript|vbscript):/i.test(attr.value.trim())) el.removeAttribute(attr.name);
          }
        }
        node.querySelectorAll('img[data-src]').forEach(img => {
          img.loading = 'lazy';
          img.src = img.dataset.src;
        });
        columns.append(document.importNode(node, true));
      }
      page.append(columns);
      listings.append(page);
      batches += 1;
      if (batches >= 100) {
        stopped = true;
        note = '100페이지를 확인했어요. 더 보려면 아래 버튼을 눌러 주세요.';
      } else note = '';
    } catch (error) {
      stopped = revision === requestRevision;
      note = revision !== requestRevision ? '' : error.name === 'AbortError' ? '목록 응답 시간이 15초를 초과했어요. 아래 버튼으로 다시 시도할 수 있어요.' : error instanceof TypeError ? '네트워크 연결을 확인한 뒤 아래 버튼으로 다시 시도해 주세요.' : error.message;
    } finally {
      controller = null;
      loading = false;
      button.disabled = exhausted;
      button.textContent = exhausted ? '마지막 목록' : '더 불러오기';
      schedule();
    }
  }

  function apply() {
    frame = null;
    const cards = [...document.querySelectorAll(cardSelector)];
    document.querySelector('#listings')?.classList.toggle('disboard-filter-compact', settings.enabled);
    if (!target) target = cards.length;
    let hidden = 0;
    for (const card of cards) {
      const isVisited = visited.has(serverKey(card));
      const name = card.querySelector('.server-name');
      const badge = name?.querySelector('.disboard-visited-badge');
      if (isVisited && name && !badge) {
        const label = document.createElement('span');
        label.className = 'disboard-visited-badge';
        label.textContent = '방문함';
        label.title = '참가 버튼을 눌렀던 서버';
        name.append(label);
      } else if (!isVisited && badge) badge.remove();
      const tags = Array.from(card.querySelectorAll('.server-tags .tag'), tag => tag.textContent);
      const description = card.querySelector('.server-description .elastic-text-inner, .server-description')?.textContent || '';
      const details = {
        name: name ? [...name.childNodes].filter(node => !(node instanceof Element && node.classList.contains('disboard-visited-badge')))
          .map(node => node.textContent).join('') : '',
        hasReview: card.classList.contains('has-review') || !!card.querySelector('.server-rating .stars'),
        onlineCount: onlineCountFrom(card.querySelector('.server-online')?.textContent),
        visited: isVisited,
        isNew: card.classList.contains('is-new') || !!card.querySelector('.server-newborn'),
      };
      const hide = shouldHide(tags, settings, description, details);
      card.classList.toggle('disboard-filter-hidden', hide);
      const column = card.closest('.column');
      if (column && column.querySelectorAll(cardSelector).length === 1) column.classList.toggle('disboard-filter-hidden', hide);
      if (!hide) prepareDescription(card);
      if (hide) hidden += 1;
    }
    const visible = cards.length - hidden;
    showSummary(visible, hidden);
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (settings.enabled && hidden && visible < target && !loading && !stopped && !exhausted) {
      timer = setTimeout(loadMore, 350);
    }
  }

  function schedule() {
    if (frame === null) frame = requestAnimationFrame(apply);
  }

  window.addEventListener('resize', schedule);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, change] of Object.entries(changes)) {
      const id = key.match(/^visited:(\d+)$/)?.[1];
      if (!id) continue;
      visitsChangedDuringLoad?.add(id);
      if (change.newValue === true) visited.add(id);
      else visited.delete(id);
      schedule();
    }
    if (!changes.settings) return;
    revision += 1;
    settings = settingsFrom(changes.settings.newValue);
    stopped = false;
    batches = 0;
    note = '';
    controller?.abort();
    schedule();
  });
  const initialRevision = revision;
  chrome.storage.local.get(null).then(stored => {
    if (revision === initialRevision) settings = settingsFrom(stored.settings);
    for (const [key, value] of Object.entries(stored)) {
      const id = key.match(/^visited:(\d+)$/)?.[1];
      if (id && value === true && !visitsChangedDuringLoad.has(id)) visited.add(id);
    }
    visitsChangedDuringLoad = null;
    schedule();
  }).catch(error => {
    visitsChangedDuringLoad = null;
    console.error('DISBOARD 필터 설정을 불러오지 못했습니다.', error);
  });
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
