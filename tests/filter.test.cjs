const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../filter.js");
const { keywordsFrom, settingsFrom, shouldHide, importKeywords, onlineCountFrom } = globalThis.DisboardFilter;

test("키워드 구분, 공백 제거, 중복 제거, 유니코드 정규화", () => {
  assert.deepEqual(keywordsFrom(" 대리,홍보\n대리\r\nＮＳＦＷ, nsfw,, "), ["대리", "홍보", "nsfw"]);
});
test("잘못된 저장 데이터 및 빈 목록은 안전하게 처리", () => {
  for (const value of [null, 42, {}, "bad"]) assert.deepEqual(settingsFrom(value), { enabled: true, keywords: [], minOnline: null, maxOnline: null, excludeReviewed: false, excludeHan: false, excludeVisited: false, excludeNew: false });
  assert.deepEqual(keywordsFrom([null, 1, " 대리 "]), ["대리"]);
  assert.equal(shouldHide(["친목"], settingsFrom()), false);
});
test("태그 부분 일치, 대소문자 무시, 여러 키워드 중 하나 일치", () => {
  const settings = settingsFrom({ keywords: ["대리", "nsfw"] });
  assert.equal(shouldHide(["친목", "발로란트대리"], settings), true);
  assert.equal(shouldHide(["NSFW"], settings), true);
  assert.equal(shouldHide(["친목", "게임"], settings), false);
  assert.equal(shouldHide([], settings), false);
});
test("필터를 끄거나 목록을 비우면 숨기지 않음", () => {
  assert.equal(shouldHide(["대리"], settingsFrom({ enabled: false, keywords: ["대리"] })), false);
  assert.equal(shouldHide(["대리"], settingsFrom({ keywords: [] })), false);
});
test('소개글도 같은 키워드로 검사하며 필터 해제 시 복원', () => {
  const settings = settingsFrom({ keywords: ['대리', 'nsfw'] });
  assert.equal(shouldHide(['게임'], settings, '발로란트 대리 모집'), true);
  assert.equal(shouldHide([], settings, 'NSFW 커뮤니티'), true);
  assert.equal(shouldHide(['게임'], settings, '같이 게임해요'), false);
  assert.equal(shouldHide([], {...settings, enabled: false}, '대리'), false);
});
test('내보내기 형식과 배열 JSON 가져오기, 중복 및 BOM 처리', () => {
  assert.deepEqual(importKeywords(JSON.stringify({version: 1, keywords: [' 대리 ', '대리', 'ＮＳＦＷ']})), ['대리', 'nsfw']);
  assert.deepEqual(importKeywords('\uFEFF["홍보"]'), ['홍보']);
  assert.deepEqual(importKeywords('{"keywords":[]}'), []);
});
test('잘못된 가져오기 파일은 거부', () => {
  for (const text of ['bad', 'null', '{}', '{"keywords":"대리"}', '[1]', '[null]', JSON.stringify(['a'.repeat(1001)]), JSON.stringify(Array(10001).fill('대리'))]) {
    assert.throws(() => importKeywords(text));
  }
});
test('온라인 인원 수를 포함 경계로 제한하고 미확인 숫자나 전체 인원은 사용하지 않음', () => {
  const settings = settingsFrom({minOnline: 100, maxOnline: 500});
  for (const onlineCount of [100, 200, 500]) assert.equal(shouldHide([], settings, '', {onlineCount}), false);
  for (const onlineCount of [99, 501, null, undefined, NaN, -1]) assert.equal(shouldHide([], settings, '', {onlineCount, memberCount: 200}), true);
  assert.equal(shouldHide([], settingsFrom({minOnline: 100}), '', {onlineCount: 1000}), false);
  assert.equal(shouldHide([], settingsFrom({maxOnline: 500}), '', {onlineCount: 0}), false);
  assert.equal(shouldHide([], settingsFrom(), '', {onlineCount: null}), false);
  assert.equal(shouldHide([], {...settings, enabled: false}, '', {onlineCount: null}), false);
});
test('온라인 인원 수 파서는 숫자와 정상적인 천 단위 구분만 허용', () => {
  assert.equal(onlineCountFrom('1,234'), 1234);
  assert.equal(onlineCountFrom(' 121 '), 121);
  assert.equal(onlineCountFrom('0'), 0);
  for (const value of ['', null, '온라인 20', '1.2K', '1,2', '-1', '1.2', '99999999999999999999']) assert.equal(onlineCountFrom(value), null);
});
test('리뷰 제외는 실제 별점 메타데이터만 사용하고 기본은 꺼짐', () => {
  assert.equal(shouldHide([], settingsFrom({excludeReviewed: true}), '별점 ★★★★★', {hasReview: true}), true);
  assert.equal(shouldHide([], settingsFrom({excludeReviewed: true}), '별점 ★★★★★', {hasReview: false}), false);
  assert.equal(shouldHide([], settingsFrom(), '', {hasReview: true}), false);
});
test('한자는 이름과 태그와 소개글에 적용하고 한글과 가나 및 기호는 허용', () => {
  const settings = settingsFrom({excludeHan: true});
  assert.equal(shouldHide([], settings, '', {name: '東京'}), true);
  assert.equal(shouldHide(['漢字'], settings), true);
  assert.equal(shouldHide([], settings, '日本 서버'), true);
  assert.equal(shouldHide([], settings, '\u{20000}'), true);
  assert.equal(shouldHide(['친목'], settings, '안녕하세요 カタカナ ひらがな ☆'), false);
  assert.equal(shouldHide([], settingsFrom(), '漢字'), false);
});
test('옛 설정에는 새 조건을 끈 기본값을 적용하고 잘못된 수치는 무시', () => {
  const settings = settingsFrom({keywords: ['대리'], minOnline: -1, maxOnline: '500', excludeHan: 'true'});
  assert.deepEqual(settings, {enabled: true, keywords: ['대리'], minOnline: null, maxOnline: null, excludeReviewed: false, excludeHan: false, excludeVisited: false, excludeNew: false});
});
test('방문 제외는 방문 기록과 토글이 모두 켜져 있을 때만 적용', () => {
  const settings = settingsFrom({excludeVisited: true});
  assert.equal(shouldHide([], settings, '', {visited: true}), true);
  assert.equal(shouldHide([], settings, '', {visited: false}), false);
  assert.equal(shouldHide([], settingsFrom(), '', {visited: true}), false);
  assert.equal(shouldHide([], {...settings, enabled: false}, '', {visited: true}), false);
  assert.equal(settingsFrom({excludeVisited: 'true'}).excludeVisited, false);
});
test('Retry-After 초와 HTTP 날짜를 준수하고 잘못된 값은 기본 대기 적용', () => {
  const { retryDelayMs } = globalThis.DisboardFilter;
  const now = Date.parse('2026-10-25T00:00:00Z');
  assert.equal(retryDelayMs('30', 1000, now), 30000);
  assert.equal(retryDelayMs('Sun, 25 Oct 2026 00:01:00 GMT', 1000, now), 60000);
  assert.equal(retryDelayMs('Sun, 25 Oct 2026 00:00:00 GMT', 1000, now), 0);
  for (const value of [null, '', 'invalid', '999999999999999999999999']) assert.equal(retryDelayMs(value, 1000, now), 1000);
});
test('New 제외는 실제 New 상태만 검사하며 토글 기본값은 꺼짐', () => {
  assert.equal(shouldHide([], settingsFrom({excludeNew:true}), '', {isNew:true}), true);
  assert.equal(shouldHide([], settingsFrom({excludeNew:true}), 'NEW 서버', {isNew:false}), false);
  assert.equal(shouldHide([], settingsFrom(), '', {isNew:true}), false);
  assert.equal(shouldHide([], settingsFrom({enabled:false,excludeNew:true}), '', {isNew:true}), false);
});
test('전체 백업은 필터와 방문 기록을 포함하고 관계없는 키는 제외', () => {
  const {backupFromStorage,importBackup}=globalThis.DisboardFilter;
  const settings=settingsFrom({enabled:false,keywords:['대리'],minOnline:10,maxOnline:500,excludeReviewed:true,excludeHan:true,excludeVisited:true,excludeNew:true});
  const backup=backupFromStorage({settings,'visited:101':true,'visited:202':true,'visited:303':false,unrelated:'private'});
  assert.deepEqual(backup,{version:2,settings,visitedServers:['101','202']});
  assert.deepEqual(importBackup(JSON.stringify(backup),settingsFrom()),{settings,visitedServers:['101','202']});
});
test('전체 가져오기는 설정을 복원하고 기존 단어는 유지하며 방문 기록 중복 제거', () => {
  const {importBackup}=globalThis.DisboardFilter;
  const current=settingsFrom({keywords:['기존'],minOnline:1});
  const data={version:2,settings:{keywords:['신규'],excludeNew:true,minOnline:50,maxOnline:100},visitedServers:['101','101']};
  const imported=importBackup(JSON.stringify(data),current);
  assert.deepEqual(imported.settings.keywords,['기존','신규']);
  assert.equal(imported.settings.minOnline,50);
  assert.equal(imported.settings.excludeNew,true);
  assert.deepEqual(imported.visitedServers,['101']);
});
test('예전 단어 파일 가져오기는 기존 필터 설정 보존', () => {
  const {importBackup}=globalThis.DisboardFilter;
  const current=settingsFrom({keywords:['기존'],excludeNew:true,minOnline:50});
  const imported=importBackup('["신규"]',current);
  assert.deepEqual(imported.settings,{...current,keywords:['기존','신규']});
  assert.deepEqual(imported.visitedServers,[]);
});
test('잘못된 전체 백업의 범위, 토글, 방문 ID, 버전은 거부', () => {
  const {importBackup}=globalThis.DisboardFilter;
  const base={version:2,settings:{keywords:[]},visitedServers:[]};
  const invalid=[null,{}, {...base,version:99}, {...base,settings:[]}, {...base,settings:{keywords:[],excludeNew:'true'}},
    {...base,settings:{keywords:[],minOnline:-1}}, {...base,settings:{keywords:[],minOnline:100,maxOnline:10}},
    {...base,settings:{keywords:[null]}}, {...base,visitedServers:['../bad']}, {...base,visitedServers:[101]},
    {...base,visitedServers:['9'.repeat(21)]}, {...base,visitedServers:Array(100001).fill('101')}];
  for(const data of invalid) assert.throws(()=>importBackup(JSON.stringify(data),settingsFrom()));
});
test('같은 키워드가 태그·소개글·이름 중 한 곳에만 있어도 숨김', () => {
  const settings=settingsFrom({keywords:['대리','nsfw']});
  assert.equal(shouldHide(['대리'],settings,'소개',{name:'일반 서버'}),true);
  assert.equal(shouldHide(['친목'],settings,'대리 모집',{name:'일반 서버'}),true);
  assert.equal(shouldHide(['친목'],settings,'소개',{name:'대리 전문 서버'}),true);
  assert.equal(shouldHide([],settings,'',{name:'ＮＳＦＷ 서버'}),true);
  assert.equal(shouldHide(['친목'],settings,'소개',{name:'일반 서버'}),false);
  assert.equal(shouldHide([],settings),false);
  assert.equal(shouldHide([],settingsFrom({enabled:false,keywords:['대리']}),'',{name:'대리 서버'}),false);
});
