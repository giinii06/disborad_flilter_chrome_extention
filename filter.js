(() => {
  const normalize = (value) => value.normalize("NFKC").trim().toLowerCase();

  function keywordsFrom(value) {
    const entries = typeof value === "string" ? value.split(/[,\n\r]+/) : value;
    if (!Array.isArray(entries)) return [];
    return [...new Set(entries.filter((entry) => typeof entry === "string")
      .map(normalize).filter(Boolean))];
  }

  function settingsFrom(value) {
    const bound = number => Number.isSafeInteger(number) && number >= 0 ? number : null;
    return {
      enabled: value?.enabled !== false,
      keywords: keywordsFrom(value?.keywords),
      minOnline: bound(value?.minOnline),
      maxOnline: bound(value?.maxOnline),
      excludeReviewed: value?.excludeReviewed === true,
      excludeHan: value?.excludeHan === true,
      excludeVisited: value?.excludeVisited === true,
      excludeNew: value?.excludeNew === true,
    };
  }

  function onlineCountFrom(text) {
    const value = String(text ?? '').trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value)) return null;
    const count = Number(value.replaceAll(',', ''));
    return Number.isSafeInteger(count) && count >= 0 ? count : null;
  }

  function retryDelayMs(value, fallback, now = Date.now()) {
    if (!value) return fallback;
    const text = value.trim();
    const delay = /^\d+$/.test(text) ? Number(text) * 1000 : Date.parse(text) - now;
    return Number.isFinite(delay) && delay <= 2147483647 ? Math.max(0, delay) : fallback;
  }

  function shouldHide(tags, settings, description = "", details = {}) {
    if (!settings.enabled) return false;
    if (settings.excludeNew && details.isNew) return true;
    if (settings.excludeVisited && details.visited) return true;
    if (settings.excludeReviewed && details.hasReview) return true;
    if (settings.excludeHan && /\p{Script=Han}/u.test([details.name || '', ...tags, description].join(' '))) return true;
    if (settings.minOnline != null || settings.maxOnline != null) {
      if (!Number.isSafeInteger(details.onlineCount) || details.onlineCount < 0) return true;
      if (settings.minOnline != null && details.onlineCount < settings.minOnline) return true;
      if (settings.maxOnline != null && details.onlineCount > settings.maxOnline) return true;
    }
    return [...tags, description, details.name || ''].some((tag) => {
      const text = normalize(tag);
      return settings.keywords.some((keyword) => text.includes(keyword));
    });
  }

  function importKeywords(text) {
    const data = JSON.parse(text.replace(/^\uFEFF/, ""));
    const entries = Array.isArray(data) ? data : data?.keywords;
    if (!Array.isArray(entries) || entries.some(value => typeof value !== 'string')) {
      throw new Error('키워드 문자열 목록이 들어 있는 JSON 파일을 선택해 주세요.');
    }
    if (entries.length > 10000 || entries.some(value => value.length > 1000)) {
      throw new Error('키워드는 10,000개 이하, 각 1,000자 이하로 가져올 수 있어요.');
    }
    return keywordsFrom(entries);
  }

  function backupFromStorage(stored) {
    return {
      version: 2,
      settings: settingsFrom(stored.settings),
      visitedServers: Object.entries(stored).filter(([key, value]) => /^visited:\d+$/.test(key) && value === true)
        .map(([key]) => key.slice('visited:'.length)),
    };
  }

  function importBackup(text, current) {
    const data = JSON.parse(text.replace(/^\uFEFF/, ''));
    if (Array.isArray(data) || (data && Object.hasOwn(data, 'keywords') && !Object.hasOwn(data, 'settings'))) {
      return { settings: { ...current, keywords: keywordsFrom([...current.keywords, ...importKeywords(text)]) }, visitedServers: [] };
    }
    if (data?.version !== 2 || !data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) {
      throw new Error('지원하는 DISBOARD 백업 파일이 아니에요.');
    }
    const raw = data.settings;
    for (const key of ['enabled', 'excludeReviewed', 'excludeHan', 'excludeVisited', 'excludeNew']) {
      if (Object.hasOwn(raw, key) && typeof raw[key] !== 'boolean') throw new Error('백업의 필터 설정이 올바르지 않아요.');
    }
    for (const key of ['minOnline', 'maxOnline']) {
      if (raw[key] != null && (!Number.isSafeInteger(raw[key]) || raw[key] < 0)) throw new Error('백업의 인원 범위가 올바르지 않아요.');
    }
    if (raw.minOnline != null && raw.maxOnline != null && raw.minOnline > raw.maxOnline) throw new Error('최소 인원이 최대 인원보다 클 수 없어요.');
    const imported = importKeywords(JSON.stringify(raw));
    if (!Array.isArray(data.visitedServers) || data.visitedServers.length > 100000
      || data.visitedServers.some(id => typeof id !== 'string' || !/^\d{1,20}$/.test(id))) {
      throw new Error('백업의 방문 기록이 올바르지 않아요.');
    }
    return {
      settings: { ...settingsFrom(raw), keywords: keywordsFrom([...current.keywords, ...imported]) },
      visitedServers: [...new Set(data.visitedServers)],
    };
  }

  globalThis.DisboardFilter = { keywordsFrom, settingsFrom, shouldHide, importKeywords, onlineCountFrom, retryDelayMs, backupFromStorage, importBackup };
})();
