/* Travel Wallet — shared wallet sync (wallet + pays + charges) via the Apps Script web app.
   Local changes are diffed against the last server state (base) and sent as ops; polling pulls others' changes. */
'use strict';
(() => {
  const K = { on: 'tw.syncOn', base: 'tw.syncBase', ver: 'tw.syncVer', fly: 'tw.syncInflight' };
  const WATCH = new Set(['tw.wallet', 'tw.pays', 'tw.charges']);
  const POLL_MS = 5000, MAX_BACKOFF = 30000;
  const raw = { get: store.get.bind(store), set: store.set.bind(store) };
  const cfg = () => { try { return { url: localStorage.getItem('tw.gasUrl') || '', token: localStorage.getItem('tw.gasToken') || '' }; } catch { return { url: '', token: '' }; } };
  const S = { on: !!raw.get(K.on, false), base: raw.get(K.base, null), ver: raw.get(K.ver, -1), fly: raw.get(K.fly, null), busy: false, t: 0, poll: 0, err: '', at: 0, fails: 0 };

  // ---------- state helpers ----------
  const clone = o => JSON.parse(JSON.stringify(o));
  const cleanW = w => { const o = {}; Object.keys(w || {}).forEach(k => { const n = Math.round(+w[k] || 0); if (n > 0) o[k] = n; }); return o; };
  const byTs = (a, b) => (a.ts || 0) - (b.ts || 0) || String(a.id).localeCompare(String(b.id));
  const norm = s => ({ w: cleanW(s && s.w), pays: [...((s && s.pays) || [])].sort(byTs), charges: [...((s && s.charges) || [])].sort(byTs) });
  const snap = () => norm(clone({ w: wallet, pays, charges }));
  const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
  const isEmpty = s => !Object.keys(s.w).length && !s.pays.length && !s.charges.length;
  const EMPTY = { w: {}, pays: [], charges: [] };
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const LISTS = [['pays', 'p'], ['charges', 'c']];

  function diff(a, b) { // ops turning a into b
    const ops = [], d = {};
    new Set([...Object.keys(a.w), ...Object.keys(b.w)]).forEach(k => { const x = (b.w[k] || 0) - (a.w[k] || 0); if (x) d[k] = x; });
    if (Object.keys(d).length) ops.push({ t: 'wd', d });
    LISTS.forEach(([key, p]) => {
      const am = new Map(a[key].map(r => [r.id, JSON.stringify(r)]));
      const bm = new Map(b[key].map(r => [r.id, r]));
      bm.forEach((r, id) => { if (am.get(id) !== JSON.stringify(r)) ops.push({ t: p + 'a', r }); });
      am.forEach((_, id) => { if (!bm.has(id)) ops.push({ t: p + 'd', id }); });
    });
    return ops;
  }
  function apply(s, ops) {
    s = clone(s);
    ops.forEach(o => {
      if (o.t === 'wd') Object.entries(o.d).forEach(([k, x]) => { const n = Math.max(0, (s.w[k] || 0) + x); if (n) s.w[k] = n; else delete s.w[k]; });
      LISTS.forEach(([key, p]) => {
        if (o.t === p + 'a') { s[key] = s[key].filter(r => r.id !== o.r.id); s[key].push(clone(o.r)); }
        if (o.t === p + 'd') s[key] = s[key].filter(r => r.id !== o.id);
      });
    });
    return norm(s);
  }
  function setLocal(s) {
    Object.keys(wallet).forEach(k => delete wallet[k]); Object.assign(wallet, s.w);
    pays.splice(0, pays.length, ...clone(s.pays)); charges.splice(0, charges.length, ...clone(s.charges));
    raw.set('tw.wallet', wallet); raw.set('tw.pays', pays); raw.set('tw.charges', charges);
    const ae = document.activeElement;
    $$('#noteList .note').forEach(li => { const inp = li.querySelector('input'); if (inp && inp !== ae) inp.value = wallet[li.dataset.v] || 0; });
    try { refreshMoney(); } catch (e) { console.error(e); }
  }

  // ---------- network ----------
  async function post(body) {
    const { url, token } = cfg();
    const r = await fetch(url, { method: 'POST', body: JSON.stringify({ token, ...body }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || '서버 오류');
    if (j.ver === undefined) throw new Error('Apps Script 코드를 새 버전으로 업데이트하세요');
    return j;
  }
  function schedule(ms) { clearTimeout(S.t); S.t = setTimeout(tick, ms); }
  async function tick() {
    if (!S.on || S.busy || !S.base) return;
    if (!cfg().url || !cfg().token) { S.err = '연결 설정이 없습니다'; return render(); }
    S.busy = true; render();
    let remote = false;
    try {
      let batch = S.fly; // unacknowledged batch is resent as-is (server dedupes by id)
      if (!batch) {
        const cur = snap(), ops = diff(S.base, cur);
        if (ops.length) { batch = { id: rid(), ops, snap: cur }; S.fly = batch; raw.set(K.fly, batch); }
      }
      const j = await post(batch ? { action: 'sync', ops: batch.ops, batch: batch.id } : { action: 'sync', ops: [], ver: S.ver });
      if (j.state) {
        const cur = snap(), server = norm(j.state);
        const extra = diff(batch ? batch.snap : S.base, cur); // local edits made while the request was in flight
        S.base = server; raw.set(K.base, server);
        const merged = apply(server, extra);
        if (!same(merged, cur)) { setLocal(merged); remote = !batch; }
        if (extra.length) schedule(300);
      }
      S.ver = j.ver; raw.set(K.ver, j.ver);
      if (batch) { S.fly = null; raw.set(K.fly, null); }
      S.err = ''; S.fails = 0; S.at = Date.now();
      if (remote) toast('다른 기기에서 지갑이 바뀌었습니다');
    } catch (e) {
      S.fails++; S.err = (navigator.onLine === false || e instanceof TypeError) ? '연결 안 됨 · 변경 내용은 보관 후 자동 전송' : (e.message || String(e));
    } finally { S.busy = false; render(); }
  }
  function loop() {
    clearTimeout(S.poll);
    if (!S.on) return;
    const wait = S.fails ? Math.min(MAX_BACKOFF, POLL_MS * 2 ** Math.min(S.fails, 3)) : POLL_MS;
    S.poll = setTimeout(async () => { if (document.visibilityState === 'visible') await tick(); loop(); }, wait);
  }

  // hook local saves (app.js calls store.set after every wallet/pay/charge change)
  store.set = (k, v) => { raw.set(k, v); if (S.on && WATCH.has(k)) schedule(600); };

  // ---------- enable / disable ----------
  function choose(server, cur) {
    return new Promise(done => {
      const w = document.createElement('div');
      w.className = 'ed-wrap';
      const tot = s => fmt(Object.entries(s.w).reduce((a, [v, n]) => a + v * n, 0));
      w.innerHTML = `<div class="ed-panel small" role="dialog" aria-modal="true">
        <header class="ed-head"><button type="button" class="ed-x" data-c="" aria-label="닫기">✕</button><h3>공유 지갑 연결</h3></header>
        <div class="ed-body">
          <p class="ed-hint">공유 지갑과 이 기기에 모두 데이터가 있습니다.</p>
          <p class="sy-cmp">공유: <b>${tot(server)}₫</b> · 결제 ${server.pays.length} · 충전 ${server.charges.length}<br>
          이 기기: <b>${tot(cur)}₫</b> · 결제 ${cur.pays.length} · 충전 ${cur.charges.length}</p>
          <button type="button" class="btn wide" data-c="take">공유 지갑으로 맞추기 (권장)</button>
          <p class="ed-hint">이 기기 내용은 공유 내용으로 바뀝니다.</p>
          <button type="button" class="btn ghost wide" data-c="merge">이 기기 내용을 공유 지갑에 더하기</button>
          <p class="ed-hint">지폐 장수가 합산되고 기록이 추가됩니다. 같은 돈을 두 번 세지 않도록 주의하세요.</p>
        </div></div>`;
      w.addEventListener('click', e => {
        const b = e.target.closest('[data-c]');
        if (!b && e.target !== w) return;
        w.remove(); document.body.classList.remove('ed-open'); done(b ? b.dataset.c || null : null);
      });
      document.body.appendChild(w); document.body.classList.add('ed-open');
    });
  }
  async function enable() {
    if (!cfg().url || !cfg().token) {
      toast('먼저 연결 설정(웹 앱 URL·비밀번호)을 입력하세요');
      const b = document.querySelector('#planCfg'); if (b) b.click();
      return;
    }
    S.busy = true; S.err = ''; render('연결 중…');
    try {
      const j = await post({ action: 'sync', ops: [], ver: -1 });
      const server = norm(j.state), cur = snap();
      let c = 'take';
      if (isEmpty(server)) c = 'merge';
      else if (!isEmpty(cur) && !same(server, cur)) c = await choose(server, cur);
      if (!c) return;
      S.base = server; raw.set(K.base, server);
      S.ver = j.ver; raw.set(K.ver, j.ver);
      S.fly = null; raw.set(K.fly, null);
      const next = c === 'take' ? server : apply(server, diff(EMPTY, cur));
      if (!same(next, cur)) setLocal(next);
      S.on = true; raw.set(K.on, true);
      toast(c === 'take' ? '공유 지갑에 연결했습니다' : '공유 지갑에 연결 · 이 기기 내용을 올립니다');
    } catch (e) { S.err = e.message || String(e); toast('연결 실패: ' + S.err); }
    finally { S.busy = false; render(); }
    if (S.on) { await tick(); loop(); }
  }
  function disable() {
    if (!confirm('공유를 끌까요? 이 기기의 현재 내용은 그대로 남습니다.')) return;
    S.on = false; raw.set(K.on, false); clearTimeout(S.t); clearTimeout(S.poll);
    if (S.fly) { S.fly = null; raw.set(K.fly, null); }
    S.err = ''; render();
  }

  // ---------- UI ----------
  document.querySelector('#walletSaved').insertAdjacentHTML('afterend',
    '<div class="sync-bar" id="syncBar"><span class="sy-dot"></span><span class="sy-text" id="syncText"></span><button type="button" class="sy-btn" id="syncBtn"></button></div>');
  const bar = $('#syncBar');
  function render(msg) {
    let cls = 'off', text = '공유 꺼짐 · 다른 사람과 같은 지갑을 쓰려면 켜세요';
    if (S.on) {
      const pend = S.fly || (S.base && diff(S.base, snap()).length);
      if (S.err) { cls = 'err'; text = S.err; }
      else if (S.busy || pend) { cls = 'busy'; text = pend ? '전송 대기 중…' : '동기화 중…'; }
      else { cls = 'ok'; text = '공유 중 · ' + (S.at ? new Date(S.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' 동기화' : '연결됨'); }
    }
    if (msg) { cls = 'busy'; text = msg; }
    bar.dataset.s = cls; $('#syncText').textContent = text;
    $('#syncBtn').textContent = S.on ? '끄기' : '공유 켜기';
    $('#syncBtn').disabled = S.busy && !S.on;
  }
  $('#syncBtn').addEventListener('click', () => (S.on ? disable() : enable()));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.on) tick(); });
  window.addEventListener('online', () => { if (S.on) { S.fails = 0; tick(); } });

  render();
  if (S.on && S.base) { tick(); loop(); }
  window.twSync = { tick, state: () => ({ ...S }), diff, apply }; // debug/testing
})();
