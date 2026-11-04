/* Travel Wallet — in-app schedule editor (writes to Google Sheet via Apps Script web app) */
'use strict';
(() => {
  const q = s => document.querySelector(s);
  const ls = {
    get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
    set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} },
  };
  const cfg = () => ({ url: ls.get('tw.gasUrl'), token: ls.get('tw.gasToken') });
  const escH = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- UI scaffolding ----------
  const actions = q('#view-plan .plan-actions');
  actions.insertAdjacentHTML('afterbegin',
    '<button class="icon-btn" id="planEdit" type="button" title="일정 편집" aria-label="일정 편집">✎</button>' +
    '<button class="icon-btn" id="planCfg" type="button" title="편집 설정" aria-label="편집 설정">⚙</button>');
  document.body.insertAdjacentHTML('beforeend', `
  <div class="ed-wrap" id="edWrap" hidden>
    <div class="ed-panel" role="dialog" aria-modal="true" aria-labelledby="edTitle">
      <header class="ed-head"><button type="button" class="ed-x" data-close aria-label="닫기">✕</button><h3 id="edTitle">일정 편집</h3></header>
      <div class="ed-body">
        <div class="ed-days" id="edDays"></div>
        <label class="ed-label">테마 <span class="ed-hint">예: 호캉스, [선택1] 남부 투어</span></label>
        <input class="input" id="edTheme" maxlength="120">
        <label class="ed-label" id="edSumLabel">요약 <span class="ed-hint">전체 일정에 보이는 한 줄</span></label>
        <input class="input" id="edSum" maxlength="200">
        <label class="ed-label">상세 일정</label>
        <div class="ed-tools">
          <button type="button" class="ed-chip" data-ins="time">+ 시간</button>
          <button type="button" class="ed-chip" data-ins="sub">+ 세부(-)</button>
          <button type="button" class="ed-chip" data-ins="note">+ 참고(*)</button>
          <button type="button" class="ed-chip" data-ins="move">+ 이동</button>
        </div>
        <textarea class="input ed-text" id="edText" spellcheck="false" placeholder="09:30 &lt;점심&gt; 식당 이름 / 그랩 10분&#10;        - 메모"></textarea>
        <p class="ed-hint">형식: <b>HH:MM 제목 / 그랩 10분</b> · 아래 줄 <b>- 세부</b> · <b>* 참고</b> · 식사는 &lt;점심&gt;처럼</p>
        <div class="ed-label">미리보기</div>
        <ol class="tl ed-preview" id="edPreview"></ol>
      </div>
      <footer class="ed-foot">
        <span class="ed-status" id="edStatus"></span>
        <button type="button" class="btn ghost" data-close>취소</button>
        <button type="button" class="btn" id="edSave">시트에 저장</button>
      </footer>
    </div>
  </div>
  <div class="ed-wrap" id="cfgWrap" hidden>
    <div class="ed-panel small" role="dialog" aria-modal="true" aria-labelledby="cfgTitle">
      <header class="ed-head"><button type="button" class="ed-x" data-close aria-label="닫기">✕</button><h3 id="cfgTitle">일정 편집 설정</h3></header>
      <div class="ed-body">
        <p class="ed-hint">앱에서 일정을 고치려면 구글 시트에 저장용 스크립트를 한 번 설치해야 합니다.</p>
        <ol class="ed-steps">
          <li>구글 시트 → <b>확장 프로그램 → Apps Script</b></li>
          <li>아래 <b>코드 복사</b> → 기존 내용 지우고 붙여넣기</li>
          <li>코드 첫 줄 <code>TOKEN</code>을 나만 아는 비밀번호로 바꾸고 저장</li>
          <li><b>배포 → 새 배포 → 웹 앱</b>, 실행: <b>나</b>, 액세스: <b>모든 사용자</b> → 배포 → 권한 승인</li>
          <li>나온 <b>웹 앱 URL</b>과 비밀번호를 아래에 입력 → 연결 테스트</li>
        </ol>
        <button type="button" class="btn ghost wide" id="cfgCopy">Apps Script 코드 복사</button>
        <label class="ed-label">웹 앱 URL</label>
        <input class="input" id="cfgUrl" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec">
        <label class="ed-label">비밀번호(TOKEN)</label>
        <input class="input" id="cfgToken" type="password" autocomplete="off">
        <p class="ed-status" id="cfgStatus"></p>
      </div>
      <footer class="ed-foot">
        <button type="button" class="btn ghost" id="cfgTest">연결 테스트</button>
        <button type="button" class="btn" id="cfgSave">저장</button>
      </footer>
    </div>
  </div>`);

  // ---------- Apps Script source (also in gas/Code.gs) ----------
  const GAS_CODE = `const TOKEN = '여기에-비밀번호'; // ← 나만 아는 비밀번호로 바꾸세요

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.token !== TOKEN) return out({ ok: false, error: '비밀번호가 맞지 않습니다' });
    if (d.ping) return out({ ok: true, name: SpreadsheetApp.getActive().getName() });
    const sh = SpreadsheetApp.getActive().getSheets().find(s => String(s.getSheetId()) === String(d.gid));
    if (!sh) return out({ ok: false, error: '시트(gid)를 찾을 수 없습니다' });
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const norm = v => String(v == null ? '' : v).replace(/\\r/g, '').trim();
      let cell = sh.getRange(d.row + 1, d.col + 1);
      if (norm(cell.getDisplayValue()) !== norm(d.oldValue)) {
        const hits = [];
        if (norm(d.oldValue)) sh.getDataRange().getDisplayValues().forEach((r, i) => r.forEach((v, j) => {
          if (norm(v) === norm(d.oldValue)) hits.push([i + 1, j + 1]);
        }));
        if (hits.length !== 1) return out({ ok: false, conflict: true, error: '그 사이 시트 내용이 바뀌었습니다. 새로고침 후 다시 시도하세요' });
        cell = sh.getRange(hits[0][0], hits[0][1]);
      }
      cell.setValue(d.value);
      return out({ ok: true, cell: cell.getA1Notation() });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
`;

  // ---------- sheet access ----------
  async function fetchRaw() {
    let err;
    for (const u of SHEET_URLS) {
      try {
        const r = await fetch(u + '&_=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const t = await r.text();
        if (/^\s*</.test(t)) throw new Error('시트가 공개되어 있지 않습니다');
        return parseCSV(t);
      } catch (e) { err = e; }
    }
    throw err || new Error('시트를 불러오지 못했습니다');
  }
  // locate theme / summary / detail cells per day column (same rules as the viewer)
  function layout(rows) {
    const W = Math.max(...rows.map(r => r.length));
    const g = (i, j) => ((rows[i] && rows[i][j]) || '');
    let dateRow = -1, best = 0;
    rows.forEach((r, i) => { const n = r.filter(c => DATE_RE.test(c)).length; if (n > best) { best = n; dateRow = i; } });
    if (dateRow < 0) throw new Error('날짜 행을 찾지 못했습니다');
    const cols = [];
    for (let j = 0; j < W; j++) if (DATE_RE.test(g(dateRow, j))) cols.push(j);
    const themeRow = dateRow + 1;
    let detailRow = -1, maxLen = 0;
    for (let i = themeRow + 1; i < rows.length; i++) {
      const len = cols.reduce((a, j) => a + g(i, j).trim().length, 0);
      if (len > maxLen) { maxLen = len; detailRow = i; }
    }
    let sumRow = -1;
    for (let i = themeRow + 1; i < rows.length && sumRow < 0; i++) {
      if (i === detailRow) continue;
      const filled = cols.filter(j => g(i, j).trim());
      if (filled.some(j => /일출|일몰/.test(g(i, j)))) continue;
      if (filled.length >= Math.max(2, Math.ceil(cols.length / 2))) sumRow = i;
    }
    return { rows, g, cols, dateRow, themeRow, detailRow, sumRow, wdRow: dateRow - 1 };
  }

  // ---------- editor ----------
  let L = null, idx = 0, orig = {};
  const status = (el, msg, bad) => { el.textContent = msg || ''; el.classList.toggle('bad', !!bad); };

  function dayLabel(j) {
    const wd = L.wdRow >= 0 ? L.g(L.wdRow, j).trim() : '';
    return `${L.g(L.dateRow, j).trim()} ${wd}`;
  }
  function fill() {
    const j = L.cols[idx];
    orig = {
      theme: L.g(L.themeRow, j),
      sum: L.sumRow >= 0 ? L.g(L.sumRow, j) : '',
      detail: L.detailRow >= 0 ? L.g(L.detailRow, j) : '',
    };
    q('#edTitle').textContent = `${dayLabel(j)} 일정 편집`;
    q('#edDays').innerHTML = L.cols.map((c, i) => `<button type="button" class="chip ${i === idx ? 'active' : ''}" data-i="${i}"><b>${escH(L.g(L.dateRow, c).trim())}</b><span>${escH((L.wdRow >= 0 ? L.g(L.wdRow, c) : '').replace(/\s+/g, ' ').trim() || ' ')}</span></button>`).join('');
    q('#edTheme').value = orig.theme;
    q('#edSum').value = orig.sum;
    q('#edSum').hidden = q('#edSumLabel').hidden = L.sumRow < 0;
    q('#edText').value = orig.detail;
    preview();
    status(q('#edStatus'), '');
  }
  function preview() {
    const ev = parseEvents(q('#edText').value);
    q('#edPreview').innerHTML = ev.map(e => `
      <li class="ev"><div class="t">${escH(e.time)}</div><div class="rail"></div>
        <div class="body"><div class="title">${tagHtml(e.tag)}${escH(e.title)}${moveHtml(e.move)}</div>
        ${e.subs.length ? `<ul>${e.subs.map(s => `<li class="${s.star ? 'star' : ''}">${escH(s.text)}</li>`).join('')}</ul>` : ''}
      </div></li>`).join('') || '<li class="empty">내용 없음</li>';
  }
  const dirty = () => q('#edTheme').value !== orig.theme || q('#edText').value !== orig.detail || (L.sumRow >= 0 && q('#edSum').value !== orig.sum);
  const closeAll = () => { q('#edWrap').hidden = true; q('#cfgWrap').hidden = true; document.body.classList.remove('ed-open'); };

  async function openEditor() {
    if (!cfg().url || !cfg().token) { toast('먼저 편집 설정을 완료하세요'); return openCfg(); }
    q('#edWrap').hidden = false; document.body.classList.add('ed-open');
    q('#edDays').innerHTML = ''; q('#edText').value = ''; q('#edPreview').innerHTML = '';
    status(q('#edStatus'), '시트 불러오는 중…');
    try {
      L = layout(await fetchRaw());
      const want = plan.data && plan.data.days[plan.sel] ? plan.data.days[plan.sel].col : L.cols[0];
      idx = Math.max(0, L.cols.indexOf(want));
      fill();
    } catch (e) { status(q('#edStatus'), e.message, true); }
  }
  async function post(body) {
    const { url, token } = cfg();
    const r = await fetch(url, { method: 'POST', body: JSON.stringify({ token, ...body }) });
    let j; try { j = await r.json(); } catch { throw new Error('스크립트 응답을 읽지 못했습니다 (배포 설정 확인)'); }
    if (!j.ok) throw new Error(j.error || '저장 실패');
    return j;
  }
  async function save() {
    if (!L) return;
    const j = L.cols[idx], jobs = [];
    if (q('#edTheme').value !== orig.theme) jobs.push({ row: L.themeRow, oldValue: orig.theme, value: q('#edTheme').value });
    if (L.sumRow >= 0 && q('#edSum').value !== orig.sum) jobs.push({ row: L.sumRow, oldValue: orig.sum, value: q('#edSum').value });
    if (L.detailRow >= 0 && q('#edText').value !== orig.detail) jobs.push({ row: L.detailRow, oldValue: orig.detail, value: q('#edText').value });
    if (!jobs.length) return toast('바뀐 내용이 없습니다');
    const btn = q('#edSave'); btn.disabled = true;
    status(q('#edStatus'), '저장 중…');
    try {
      for (const job of jobs) await post({ gid: SHEET_GID, col: j, ...job });
      orig.theme = q('#edTheme').value; orig.sum = q('#edSum').value; orig.detail = q('#edText').value;
      status(q('#edStatus'), '저장했습니다');
      toast('구글 시트에 저장했습니다');
      closeAll();
      setTimeout(() => loadPlan(true), 1500);
    } catch (e) {
      status(q('#edStatus'), e.message, true);
    } finally { btn.disabled = false; }
  }
  function insert(kind) {
    const ta = q('#edText'), v = ta.value, p = ta.selectionStart ?? v.length;
    const nl = p > 0 && v[p - 1] !== '\n' ? '\n' : '';
    const snip = { time: `${nl}\n00:00 `, sub: `${nl}        - `, note: `${nl}         * `, move: ' / 그랩 10분' }[kind];
    ta.setRangeText(snip, p, ta.selectionEnd ?? p, 'end');
    if (kind === 'time') { const s = ta.selectionEnd - 6; ta.setSelectionRange(s, s + 5); }
    ta.focus(); preview();
  }

  // ---------- settings ----------
  function openCfg() {
    const c = cfg();
    q('#cfgUrl').value = c.url; q('#cfgToken').value = c.token;
    status(q('#cfgStatus'), '');
    q('#cfgWrap').hidden = false; document.body.classList.add('ed-open');
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(GAS_CODE); toast('코드를 복사했습니다'); }
    catch {
      const ta = document.createElement('textarea'); ta.value = GAS_CODE; document.body.appendChild(ta);
      ta.select(); try { document.execCommand('copy'); toast('코드를 복사했습니다'); } catch { toast('복사 실패 — repo의 gas/Code.gs를 사용하세요'); }
      ta.remove();
    }
  }
  const readCfg = () => ({ url: q('#cfgUrl').value.trim(), token: q('#cfgToken').value.trim() });
  function validUrl(u) { return /^https:\/\/script\.google(usercontent)?\.com\//.test(u); }

  q('#planEdit').addEventListener('click', openEditor);
  q('#planCfg').addEventListener('click', openCfg);
  q('#cfgCopy').addEventListener('click', copyCode);
  q('#cfgSave').addEventListener('click', () => {
    const c = readCfg();
    if (c.url && !validUrl(c.url)) return status(q('#cfgStatus'), 'script.google.com 으로 시작하는 웹 앱 URL을 넣어주세요', true);
    ls.set('tw.gasUrl', c.url); ls.set('tw.gasToken', c.token);
    toast('설정을 저장했습니다'); closeAll();
  });
  q('#cfgTest').addEventListener('click', async () => {
    const c = readCfg();
    if (!validUrl(c.url) || !c.token) return status(q('#cfgStatus'), 'URL과 비밀번호를 입력하세요', true);
    status(q('#cfgStatus'), '연결 확인 중…');
    try {
      const r = await fetch(c.url, { method: 'POST', body: JSON.stringify({ token: c.token, ping: true }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || '실패');
      ls.set('tw.gasUrl', c.url); ls.set('tw.gasToken', c.token);
      status(q('#cfgStatus'), `연결됨 · "${j.name}" (설정 저장됨)`);
    } catch (e) { status(q('#cfgStatus'), '연결 실패: ' + (e.message || e), true); }
  });

  q('#edDays').addEventListener('click', e => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    if (dirty() && !confirm('저장하지 않은 변경이 있습니다. 다른 날로 이동할까요?')) return;
    idx = +b.dataset.i; fill();
  });
  q('#edText').addEventListener('input', preview);
  q('.ed-tools').addEventListener('click', e => { const b = e.target.closest('[data-ins]'); if (b) insert(b.dataset.ins); });
  q('#edSave').addEventListener('click', save);
  document.querySelectorAll('.ed-wrap').forEach(w => w.addEventListener('click', e => {
    if (!e.target.closest('[data-close]') && e.target !== w) return;
    if (w.id === 'edWrap' && L && dirty() && !confirm('저장하지 않은 변경을 버릴까요?')) return;
    closeAll();
  }));
})();
