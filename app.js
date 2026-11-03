/* Travel Wallet (VND) — wallet / calculator / schedule */
'use strict';

// ---------- config ----------
const SHEET_ID = '1g9DLmiVnyX1rsYREmeU_MSYl2egaDx170e0RQxLUZ2k';
const SHEET_GID = '1446487336';
const SHEET_URLS = [
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=0&gid=${SHEET_GID}`,
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`,
];
const RATE_URLS = [
  { url: 'https://open.er-api.com/v6/latest/VND', pick: j => j && j.rates && j.rates.KRW, src: 'ExchangeRate-API' },
  { url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/vnd.json', pick: j => j && j.vnd && j.vnd.krw, src: 'fawazahmed0 currency-api' },
];
const RATE_TTL = 3 * 60 * 60 * 1000;      // 3h
const PLAN_AUTO_MS = 60 * 1000;           // auto refresh while plan tab visible
const DENOMS = [
  { v: 500000, c: '#bfe6ee' }, { v: 200000, c: '#f6c9b6' }, { v: 100000, c: '#cfe8c2' },
  { v: 50000, c: '#f5c8d8' },  { v: 20000, c: '#c3d5f2' },  { v: 10000, c: '#efe0b0' },
  { v: 5000, c: '#c9d3ee' },   { v: 2000, c: '#ddd0c4' },   { v: 1000, c: '#d9e7c9' },
];

// ---------- utils ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const fmtNum = n => {
  if (!isFinite(n)) return '0';
  const r = Math.round(n * 100) / 100;
  return r.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2200);
}

// ---------- exchange rate ----------
// manual rate is stored as KRW per 100 VND (legacy key tw.rateManual was per 1,000 VND)
const legacyManual = store.get('tw.rateManual', null);
const rate = { auto: null, at: 0, src: '', manual: store.get('tw.rateManual100', legacyManual ? legacyManual / 10 : null) };
Object.assign(rate, store.get('tw.rateAuto', {}));
const krwPerVnd = () => (rate.manual ? rate.manual / 100 : rate.auto) || 0;
const toKrw = vnd => vnd * krwPerVnd();

function renderRate() {
  const b = $('#rateBadge'), t = $('#rateText');
  const r = krwPerVnd();
  b.classList.toggle('manual', !!rate.manual);
  t.textContent = r ? `100₫ = ${(r * 100 + 1e-9).toFixed(2)}원${rate.manual ? ' (수동)' : ''}` : '환율 없음 · 탭하여 입력';
  const when = rate.at ? new Date(rate.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
  $('#rateInfo').textContent = rate.auto
    ? `실시간: 100₫ = ${(rate.auto * 100 + 1e-9).toFixed(2)}원 (${rate.src}, ${when} 기준)`
    : '실시간 환율을 아직 불러오지 못했습니다.';
  refreshMoney();
}

async function loadRate(force = false) {
  if (!force && rate.auto && Date.now() - rate.at < RATE_TTL) return renderRate();
  for (const s of RATE_URLS) {
    try {
      const res = await fetch(s.url, { cache: 'no-store' });
      if (!res.ok) continue;
      const v = Number(s.pick(await res.json()));
      if (v > 0) {
        Object.assign(rate, { auto: v, at: Date.now(), src: s.src });
        store.set('tw.rateAuto', { auto: v, at: rate.at, src: s.src });
        renderRate();
        if (force) toast('환율을 새로 불러왔습니다');
        return;
      }
    } catch {}
  }
  renderRate();
  if (force) toast('환율을 불러오지 못했습니다');
}

$('#rateBadge').addEventListener('click', () => {
  $('#rateManual').value = rate.manual || '';
  $('#rateDialog').showModal();
});
$('#rateDialog').addEventListener('close', () => {
  const act = $('#rateDialog').returnValue;
  if (act === 'save') {
    const v = parseFloat($('#rateManual').value);
    rate.manual = v > 0 ? v : null;
    store.set('tw.rateManual100', rate.manual);
    renderRate();
  } else if (act === 'refresh') loadRate(true);
});

function refreshMoney() { renderWalletTotals(); renderCalc(); if (typeof renderPay === 'function') { renderPay(); renderCashPlan(); renderCharge(); renderChgForm(); } }

// ---------- tabs ----------
let currentTab = store.get('tw.tab', 'wallet');
function showTab(name) {
  currentTab = name; store.set('tw.tab', name);
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.view').forEach(v => (v.hidden = v.dataset.view !== name));
  if (name === 'plan') loadPlan();
  if (name === 'pay' && typeof renderCashPlan === 'function') renderCashPlan();
  if (name === 'charge' && typeof renderChgForm === 'function') renderChgForm();
  window.scrollTo(0, 0);
}
$$('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ---------- wallet ----------
const wallet = store.get('tw.wallet', {});
function renderWallet() {
  $('#noteList').innerHTML = DENOMS.map(d => `
    <li class="note" data-v="${d.v}">
      <div class="bill" style="--bill:${d.c}">${fmt(d.v)}₫<small class="bill-krw">≈${fmt(toKrw(d.v))}원</small></div>
      <div class="stepper">
        <button type="button" data-d="-1" aria-label="${fmt(d.v)}동 1장 빼기">−</button>
        <input type="number" inputmode="numeric" min="0" step="1" value="${wallet[d.v] || 0}" aria-label="${fmt(d.v)}동 장수">
        <button type="button" data-d="1" aria-label="${fmt(d.v)}동 1장 더하기">+</button>
      </div>
      <div class="sub"><b>0</b>≈0원</div>
    </li>`).join('');
  renderWalletTotals();
}
function renderWalletTotals() {
  let total = 0, count = 0;
  $$('#noteList .note').forEach(li => {
    const v = +li.dataset.v, n = wallet[v] || 0, s = v * n;
    total += s; count += n;
    li.classList.toggle('has', n > 0);
    li.querySelector('.bill-krw').textContent = `≈${fmt(toKrw(v))}원`;
    li.querySelector('.sub').innerHTML = `<b>${fmt(s)}₫</b>≈${fmt(toKrw(s))}원`;
  });
  $$('.js-wallet-vnd').forEach(e => (e.textContent = fmt(total)));
  $$('.js-wallet-krw').forEach(e => (e.textContent = fmt(toKrw(total))));
  $$('.js-wallet-count').forEach(e => (e.textContent = count));
}
function saveWallet(manual) {
  store.set('tw.wallet', wallet);
  const at = Date.now(); store.set('tw.walletSavedAt', at);
  renderSaved(manual);
}
function renderSaved(manual) {
  const at = store.get('tw.walletSavedAt', 0);
  $('#walletSaved').textContent = at ? `${manual ? '저장 완료' : '자동 저장됨'} · ${new Date(at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '변경 내용은 이 기기에 자동 저장됩니다';
}
function setCount(v, n) {
  n = Math.max(0, Math.floor(+n || 0));
  if (n) wallet[v] = n; else delete wallet[v];
  saveWallet();
  const inp = $(`#noteList .note[data-v="${v}"] input`);
  if (inp && +inp.value !== n) inp.value = n;
  renderWalletTotals();
}
$('#noteList').addEventListener('click', e => {
  const b = e.target.closest('button[data-d]'); if (!b) return;
  const v = +b.closest('.note').dataset.v;
  setCount(v, (wallet[v] || 0) + +b.dataset.d);
});
$('#noteList').addEventListener('input', e => {
  if (e.target.tagName !== 'INPUT') return;
  setCount(+e.target.closest('.note').dataset.v, e.target.value);
});
$('#noteList').addEventListener('focusin', e => { if (e.target.tagName === 'INPUT') e.target.select(); });
$('#walletReset').addEventListener('click', () => {
  if (!confirm('지갑의 모든 지폐 수량을 0으로 초기화할까요?')) return;
  Object.keys(wallet).forEach(k => delete wallet[k]);
  saveWallet(); renderWallet();
});
$('#walletSave').addEventListener('click', () => { saveWallet(true); toast('지갑을 저장했습니다'); });

// ---------- calculator ----------
// entries: [{op:'+'|'-'|'%', val:number}] evaluated left→right; '%' = discount on running total
const calc = store.get('tw.calc', { entries: [], cur: '', op: '+' });
const OPS = { '+': '+', '-': '−', '%': '할인' };
function evalEntries(list) {
  let t = 0;
  const steps = list.map(e => {
    const before = t;
    if (e.op === '+') t += e.val;
    else if (e.op === '-') t -= e.val;
    else if (e.op === '%') t = t * (1 - e.val / 100);
    return { ...e, delta: t - before };
  });
  return { total: t, steps };
}
function liveTotal() {
  const list = calc.entries.slice();
  if (calc.cur !== '' && calc.cur !== '.') list.push({ op: calc.op, val: parseFloat(calc.cur) });
  return evalEntries(list).total;
}
function renderCalc() {
  if (!$('#tape')) return;
  const { steps } = evalEntries(calc.entries);
  $('#tape').innerHTML = steps.map((s, i) => {
    const disc = s.op === '%';
    const val = disc ? `${fmtNum(s.val)}%` : fmtNum(s.val);
    const eff = disc ? `<span class="eff">(${fmtNum(s.delta)})</span>` : '';
    return `<li><span class="op ${disc ? 'disc' : ''}">${i === 0 && s.op === '+' ? '' : OPS[s.op]}</span><span class="val">${val}${eff}</span></li>`;
  }).join('');
  $('#tape').scrollTop = 1e6;
  const pend = calc.entries.length || calc.op !== '+' ? `<span class="pending">${OPS[calc.op]}</span>` : '';
  const curTxt = calc.cur === '' ? '0' : (calc.cur.includes('.') ? calc.cur.replace(/^(\d+)/, m => (+m).toLocaleString('ko-KR')) : (+calc.cur).toLocaleString('ko-KR'));
  $('#calcCurrent').innerHTML = pend + esc(curTxt) + (calc.op === '%' ? '%' : '');
  const t = liveTotal();
  $('#calcVnd').textContent = fmtNum(t);
  $('#calcKrw').textContent = fmt(toKrw(t));
  $$('#keypad .op').forEach(b => b.classList.toggle('armed', calc.cur === '' && calc.entries.length > 0 && b.dataset.k === calc.op));
  store.set('tw.calc', calc);
}
function pressKey(k) {
  if (/^\d$/.test(k) || k === '000') {
    if (calc.cur.replace('.', '').length >= 15) return;
    if (calc.cur === '0') calc.cur = '';
    if (k === '000' && calc.cur === '') return;
    calc.cur += k;
  } else if (k === '.') {
    if (!calc.cur.includes('.')) calc.cur = (calc.cur || '0') + '.';
  } else if (k === 'back') {
    if (calc.cur) calc.cur = calc.cur.slice(0, -1);
    else if (calc.entries.length) { const e = calc.entries.pop(); calc.op = e.op; calc.cur = String(e.val); }
  } else if (k === 'C') {
    calc.entries = []; calc.cur = ''; calc.op = '+';
  } else if (k in OPS) {
    if (calc.cur !== '' && calc.cur !== '.') { calc.entries.push({ op: calc.op, val: parseFloat(calc.cur) }); calc.cur = ''; }
    calc.op = k;
  } else if (k === '=') {
    if (calc.cur !== '' && calc.cur !== '.') { calc.entries.push({ op: calc.op, val: parseFloat(calc.cur) }); }
    const t = evalEntries(calc.entries).total;
    calc.entries = t ? [{ op: '+', val: Math.round(t * 100) / 100 }] : [];
    calc.cur = ''; calc.op = '+';
    if (t) toast(`총액 ${fmtNum(t)}₫ ≈ ${fmt(toKrw(t))}원`);
  }
  renderCalc();
}
$('#keypad').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b) pressKey(b.dataset.k); });
document.addEventListener('keydown', e => {
  if (currentTab !== 'calc' || e.target.tagName === 'INPUT' || $('#rateDialog').open) return;
  const map = { Enter: '=', '=': '=', Backspace: 'back', Escape: 'C', '+': '+', '-': '-', '%': '%', '.': '.' };
  const k = /^\d$/.test(e.key) ? e.key : map[e.key];
  if (k) { e.preventDefault(); pressKey(k); }
});

// ---------- payments ----------
const CATS = [
  { k: '식사', c: '#ff6b4a' }, { k: '카페', c: '#b7791f' }, { k: '교통', c: '#3b82f6' }, { k: '쇼핑', c: '#d946ef' },
  { k: '마사지', c: '#10b981' }, { k: '투어', c: '#0ea5e9' }, { k: '숙소', c: '#6366f1' }, { k: '기타', c: '#64748b' },
];
const catColor = k => (CATS.find(c => c.k === k) || CATS[CATS.length - 1]).c;
const pays = store.get('tw.pays', []);
const draft = { cat: '식사', method: 'cash', cur: 'VND', pay: {}, change: {}, touched: false };
const isKrw = p => p.cur === 'KRW';
const krwOf = p => isKrw(p) ? p.amount : p.amount * (p.rate || krwPerVnd());
const parseAmt = s => parseInt(String(s).replace(/[^\d]/g, ''), 10) || 0;
const sumBills = m => Object.entries(m).reduce((a, [v, n]) => a + v * n, 0);
const billsText = m => DENOMS.filter(d => m[d.v]).map(d => `${fmt(d.v / 1000)}k×${m[d.v]}`).join(' + ');
const nowLocal = (t = Date.now()) => { const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

// choose bills from wallet: minimal overpay, then fewest bills; change = greedy
function suggestBills(amount) {
  const T = Math.ceil(amount / 1000), MAXB = 500, S = T + MAXB;
  if (T <= 0) return { pay: {}, change: {}, ok: true };
  let dp = new Float64Array(S + 1).fill(Infinity); dp[0] = 0;
  const use = [];
  for (const d of DENOMS) {
    const u = d.v / 1000, c = wallet[d.v] || 0, nd = Float64Array.from(dp), k = new Uint16Array(S + 1);
    for (let n = 1; n <= c; n++) for (let s = n * u; s <= S; s++) {
      const v = dp[s - n * u] + n; if (v < nd[s]) { nd[s] = v; k[s] = n; }
    }
    use.push(k); dp = nd;
  }
  let best = -1;
  for (let s = T; s <= S; s++) if (dp[s] < Infinity) { best = s; break; }
  if (best < 0) return { pay: {}, change: {}, ok: false };
  const pay = {}; let s = best;
  for (let i = DENOMS.length - 1; i >= 0; i--) { const n = use[i][s]; if (n) { pay[DENOMS[i].v] = n; s -= n * DENOMS[i].v / 1000; } }
  return { pay, change: greedyChange(best * 1000 - amount), ok: true };
}
function greedyChange(x) {
  const ch = {};
  for (const d of DENOMS) { const n = Math.floor(x / d.v); if (n) { ch[d.v] = n; x -= n * d.v; } }
  return ch;
}

function renderCatChips() {
  $('#payCats').innerHTML = CATS.map(c => `<button type="button" class="cat ${c.k === draft.cat ? 'active' : ''}" style="--c:${c.c}" data-k="${c.k}">${c.k}</button>`).join('');
}
function renderCashPlan() {
  const amount = parseAmt($('#payAmount').value), r = krwPerVnd();
  $('#payAmountKrw').textContent = draft.cur === 'KRW' ? `≈ ${r ? fmt(amount / r) : '-'}₫` : `≈ ${fmt(toKrw(amount))}원`;
  const box = $('#cashBox'); box.hidden = draft.method !== 'cash' || draft.cur === 'KRW';
  if (box.hidden) return;
  const deduct = $('#payDeduct').checked, el = $('#cashPlan');
  if (!deduct || !amount) { el.innerHTML = ''; return; }
  if (!draft.touched) {
    const r = suggestBills(amount);
    draft.pay = r.pay; draft.change = r.change; draft.short = !r.ok;
  }
  const paid = sumBills(draft.pay), chg = sumBills(draft.change), net = paid - chg, diff = net - amount;
  const over = DENOMS.some(d => (draft.pay[d.v] || 0) > (wallet[d.v] || 0));
  let state;
  if (draft.short && !draft.touched) state = `<span class="bad">지갑 현금이 부족합니다 (보유 ${fmt(sumBills(wallet))}₫)</span>`;
  else if (over) state = '<span class="bad">지갑에 없는 지폐가 포함되어 있습니다</span>';
  else if (diff < 0) state = `<span class="bad">${fmt(-diff)}₫ 부족</span>`;
  else if (diff >= 1000) state = `<span class="bad">${fmt(diff)}₫ 더 냄 (거스름돈 확인)</span>`;
  else state = `<span class="ok">✓ 맞음</span>${diff ? ` <span class="muted small">(동전 ${fmt(diff)}₫ 미반영)</span>` : ''}`;
  draft.valid = !over && diff >= 0 && diff < 1000 && paid > 0;
  el.innerHTML = `<div class="plan-sum">
      <div><span class="lbl">낼 지폐</span>${billsText(draft.pay) || '-'} <b>(${fmt(paid)}₫)</b></div>
      <div><span class="lbl">거스름돈</span>${billsText(draft.change) || '없음'} <b>(${fmt(chg)}₫)</b></div>
      <div><span class="lbl">상태</span>${state}</div>
    </div>
    <details ${draft.touched ? 'open' : ''}><summary class="linkish">지폐 직접 수정</summary>
      <table class="bill-edit"><tr><th>지폐</th><th>내는 장수</th><th>거스름 장수</th></tr>
      ${DENOMS.map(d => `<tr data-v="${d.v}"><td>${fmt(d.v)}<span class="have">보유 ${wallet[d.v] || 0}장</span></td>
        <td><span class="mini-step"><button type="button" data-t="pay" data-d="-1">−</button><span>${draft.pay[d.v] || 0}</span><button type="button" data-t="pay" data-d="1">+</button></span></td>
        <td><span class="mini-step"><button type="button" data-t="change" data-d="-1">−</button><span>${draft.change[d.v] || 0}</span><button type="button" data-t="change" data-d="1">+</button></span></td></tr>`).join('')}
      </table>
      ${draft.touched ? '<button type="button" class="linkish" id="planReset">자동 추천으로 되돌리기</button>' : ''}
    </details>`;
}
function resetDraft() { draft.pay = {}; draft.change = {}; draft.touched = false; }

$('#payAmount').addEventListener('input', e => {
  const n = parseAmt(e.target.value);
  e.target.value = n ? n.toLocaleString('ko-KR') : '';
  resetDraft(); renderCashPlan();
});
$('#payCats').addEventListener('click', e => { const b = e.target.closest('.cat'); if (!b) return; draft.cat = b.dataset.k; renderCatChips(); });
$('#payMethod').addEventListener('click', e => {
  const b = e.target.closest('[data-m]'); if (!b) return;
  draft.method = b.dataset.m;
  $$('#payMethod .seg-btn').forEach(x => x.classList.toggle('active', x === b));
  renderCashPlan();
});
$('#payDeduct').addEventListener('change', renderCashPlan);
function setPayCur(c) {
  draft.cur = c;
  $$('#payCur button').forEach(x => x.classList.toggle('active', x.dataset.c === c));
  resetDraft(); renderCashPlan();
}
$('#payCur').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) setPayCur(b.dataset.c); });
$('#cashPlan').addEventListener('click', e => {
  if (e.target.id === 'planReset') { resetDraft(); return renderCashPlan(); }
  const b = e.target.closest('button[data-t]'); if (!b) return;
  const v = +b.closest('tr').dataset.v, m = draft[b.dataset.t];
  const n = Math.max(0, (m[v] || 0) + +b.dataset.d);
  if (n) m[v] = n; else delete m[v];
  draft.touched = true; renderCashPlan();
});
$('#payForm').addEventListener('submit', e => {
  e.preventDefault();
  const amount = parseAmt($('#payAmount').value);
  if (!amount) return toast('금액을 입력하세요');
  const cash = draft.method === 'cash', deduct = cash && draft.cur === 'VND' && $('#payDeduct').checked;
  if (deduct && !draft.valid) return toast('낼 지폐/거스름돈을 확인하세요');
  const ts = new Date($('#payTime').value || Date.now()).getTime() || Date.now();
  const rec = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts, amount,
    memo: $('#payMemo').value.trim(), cat: draft.cat, method: draft.method, cur: draft.cur, rate: krwPerVnd(),
    applied: deduct, pay: deduct ? { ...draft.pay } : {}, change: deduct ? { ...draft.change } : {},
  };
  if (deduct) {
    for (const [v, n] of Object.entries(rec.pay)) wallet[v] = (wallet[v] || 0) - n;
    for (const [v, n] of Object.entries(rec.change)) wallet[v] = (wallet[v] || 0) + n;
    Object.keys(wallet).forEach(k => { if (wallet[k] <= 0) delete wallet[k]; });
    saveWallet(); renderWallet();
  }
  pays.push(rec); store.set('tw.pays', pays);
  $('#payAmount').value = ''; $('#payMemo').value = ''; $('#payTime').value = nowLocal();
  resetDraft(); renderCashPlan(); renderPay();
  toast(deduct ? `기록 완료 · 지갑에서 ${fmt(rec.amount)}₫ 차감` : '기록 완료');
});
$('#payList').addEventListener('click', e => {
  const b = e.target.closest('.pi-del'); if (!b) return;
  const i = pays.findIndex(p => p.id === b.dataset.id); if (i < 0) return;
  const r = pays[i];
  if (!confirm(`'${r.memo || r.cat}' ${fmt(r.amount)}${isKrw(r) ? '원' : '₫'} 기록을 삭제할까요?${r.applied ? '\n지갑 지폐도 원래대로 되돌립니다.' : ''}`)) return;
  if (r.applied) {
    for (const [v, n] of Object.entries(r.pay)) wallet[v] = (wallet[v] || 0) + n;
    for (const [v, n] of Object.entries(r.change)) wallet[v] = Math.max(0, (wallet[v] || 0) - n);
    Object.keys(wallet).forEach(k => { if (!wallet[k]) delete wallet[k]; });
    saveWallet(); renderWallet();
  }
  pays.splice(i, 1); store.set('tw.pays', pays); renderPay(); renderCashPlan();
  toast('삭제했습니다');
});

const WD = ['일', '월', '화', '수', '목', '금', '토'];
function renderPay() {
  if (!$('#payList')) return;
  const vnd = pays.filter(p => !isKrw(p)), krw = pays.filter(isKrw);
  const sumV = vnd.reduce((s, p) => s + p.amount, 0), sumK = krw.reduce((s, p) => s + p.amount, 0);
  const all = pays.reduce((s, p) => s + krwOf(p), 0);
  $('#paySum').textContent = fmt(sumV);
  $('#paySumKrw').textContent = fmt(vnd.reduce((s, p) => s + krwOf(p), 0));
  $('#payCash').textContent = fmt(vnd.filter(p => p.method === 'cash').reduce((s, p) => s + p.amount, 0));
  $('#payCard').textContent = fmt(vnd.filter(p => p.method === 'card').reduce((s, p) => s + p.amount, 0));
  $('#payKrwLine').hidden = !krw.length;
  $('#payKrw').textContent = fmt(sumK);
  $('#payAllKrw').textContent = fmt(all);
  $('#payCount').textContent = pays.length ? `· ${pays.length}건` : '';
  const groups = {};
  [...pays].sort((a, b) => b.ts - a.ts).forEach(p => {
    const d = new Date(p.ts), key = `${d.getMonth() + 1}/${d.getDate()} (${WD[d.getDay()]})`;
    (groups[key] = groups[key] || []).push(p);
  });
  $('#payList').innerHTML = Object.keys(groups).length ? Object.entries(groups).map(([k, list]) => {
    const sv = list.filter(p => !isKrw(p)).reduce((s, p) => s + p.amount, 0);
    const sk = list.filter(isKrw).reduce((s, p) => s + p.amount, 0);
    const tot = list.reduce((s, p) => s + krwOf(p), 0);
    const head = [sv ? `<b>${fmt(sv)}₫</b>` : '', sk ? `<b>${fmt(sk)}원</b>` : ''].filter(Boolean).join(' + ');
    return `<div class="pay-day"><h4><span>${k}</span><span>${head} ≈ ${fmt(tot)}원</span></h4><ul class="pay-items">${list.map(p => `
      <li class="pay-item">
        <div class="pi-cat" style="--c:${catColor(p.cat)}">${esc(p.cat.slice(0, 2))}</div>
        <div class="pi-main"><div class="pi-memo">${esc(p.memo || p.cat)}</div>
          <div class="pi-meta"><span class="badge ${p.method}">${p.method === 'cash' ? '현금' : '카드'}</span>${isKrw(p) ? '<span class="badge krw">원화</span>' : ''}${new Date(p.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</div>
          ${p.applied ? `<div class="pi-bills">낸 돈 ${billsText(p.pay)}${Object.keys(p.change).length ? ` · 거스름 ${billsText(p.change)}` : ''}</div>` : ''}</div>
        <div class="pi-amt">${isKrw(p) ? `${fmt(p.amount)}원<small>≈${p.rate ? fmt(p.amount / p.rate) : '-'}₫</small>` : `${fmt(p.amount)}₫<small>≈${fmt(krwOf(p))}원</small>`}</div>
        <button class="pi-del" data-id="${p.id}" type="button" aria-label="삭제">×</button>
      </li>`).join('')}</ul></div>`;
  }).join('') : '<div class="empty">아직 결제 기록이 없습니다</div>';
}
$('#calcToPay').addEventListener('click', () => {
  const t = Math.round(liveTotal());
  if (t <= 0) return toast('계산된 금액이 없습니다');
  $('#payAmount').value = t.toLocaleString('ko-KR');
  setPayCur('VND'); showTab('pay');
  $('#payMemo').focus();
});
$('#payTime').value = nowLocal();
renderCatChips();

// ---------- charge (ATM / exchange) ----------
const charges = store.get('tw.charges', []);
const cd = { type: 'atm', bills: {}, k50: 0, k10: 0 };
const chgKrwUsed = c => c.type === 'fx' ? c.k50 * 50000 + c.k10 * 10000 : (c.krw || 0) + (c.fee || 0);
function chgDraftKrw() {
  return cd.type === 'fx' ? cd.k50 * 50000 + cd.k10 * 10000 : parseAmt($('#chgKrw').value) + parseAmt($('#chgFee').value);
}
function renderChgForm() {
  const amount = sumBills(cd.bills), typed = parseAmt($('#chgAmount').value), r = krwPerVnd();
  $('#chgAmountKrw').textContent = `시장 환율 기준 ≈ ${fmt(toKrw(typed))}원`;
  $('#chgAtm').hidden = cd.type !== 'atm'; $('#chgFx').hidden = cd.type !== 'fx';
  $('#k50').textContent = cd.k50; $('#k10').textContent = cd.k10;
  $('#k50Sum').textContent = fmt(cd.k50 * 50000) + '원'; $('#k10Sum').textContent = fmt(cd.k10 * 10000) + '원';
  const krw = chgDraftKrw();
  if (krw && amount) {
    const eff = krw / amount * 100, diff = r ? (eff / (r * 100) - 1) * 100 : 0;
    $('#chgRate').innerHTML = `적용 환율 100₫ = ${(eff + 1e-9).toFixed(2)}원 <span class="muted">(사용 ${fmt(krw)}원${r ? ` · 시장 대비 ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%` : ''})</span>`;
  } else $('#chgRate').innerHTML = krw ? `<span class="muted">사용 ${fmt(krw)}원</span>` : '';
  const rem = typed - amount;
  $('#chgBillSum').innerHTML = `<span class="lbl">받은 지폐</span>${billsText(cd.bills) || '-'} <b>(${fmt(amount)}₫)</b>` +
    (typed && rem ? ` <span class="${Math.abs(rem) >= 1000 ? 'bad' : 'muted small'}">${rem > 0 ? fmt(rem) + '₫ 덜 입력' : fmt(-rem) + '₫ 초과'}</span>` : '');
  $('#chgBills').innerHTML = `<tr><th>지폐</th><th>받은 장수</th><th>보유</th></tr>` + DENOMS.map(d => `<tr data-v="${d.v}"><td>${fmt(d.v)}</td>
    <td><span class="mini-step"><button type="button" data-d="-1">−</button><span>${cd.bills[d.v] || 0}</span><button type="button" data-d="1">+</button></span></td>
    <td class="have">${wallet[d.v] || 0}장</td></tr>`).join('');
}
$('#chgType').addEventListener('click', e => {
  const b = e.target.closest('[data-t]'); if (!b) return;
  cd.type = b.dataset.t; $$('#chgType .seg-btn').forEach(x => x.classList.toggle('active', x === b)); renderChgForm();
});
$('#chgAmount').addEventListener('input', e => {
  const n = parseAmt(e.target.value); e.target.value = n ? n.toLocaleString('ko-KR') : '';
  cd.bills = greedyChange(n); renderChgForm();
});
['#chgKrw', '#chgFee'].forEach(id => $(id).addEventListener('input', e => {
  const n = parseAmt(e.target.value); e.target.value = n ? n.toLocaleString('ko-KR') : ''; renderChgForm();
}));
$('#chgFx').addEventListener('click', e => {
  const b = e.target.closest('button[data-d]'); if (!b) return;
  const k = b.closest('.mini-step').dataset.k; cd[k] = Math.max(0, cd[k] + +b.dataset.d); renderChgForm();
});
$('#chgBills').addEventListener('click', e => {
  const b = e.target.closest('button[data-d]'); if (!b) return;
  const v = +b.closest('tr').dataset.v, n = Math.max(0, (cd.bills[v] || 0) + +b.dataset.d);
  if (n) cd.bills[v] = n; else delete cd.bills[v];
  const t = sumBills(cd.bills); $('#chgAmount').value = t ? t.toLocaleString('ko-KR') : '';
  renderChgForm();
});
$('#chgForm').addEventListener('submit', e => {
  e.preventDefault();
  const amount = sumBills(cd.bills);
  if (!amount) return toast('받은 금액 또는 지폐 장수를 입력하세요');
  const typed = parseAmt($('#chgAmount').value);
  if (typed && Math.abs(typed - amount) >= 1000) return toast('금액과 지폐 합계가 다릅니다');
  const rec = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts: new Date($('#chgTime').value || Date.now()).getTime() || Date.now(),
    type: cd.type, amount, bills: { ...cd.bills }, memo: $('#chgMemo').value.trim(),
    krw: cd.type === 'atm' ? parseAmt($('#chgKrw').value) : 0, fee: cd.type === 'atm' ? parseAmt($('#chgFee').value) : 0,
    k50: cd.type === 'fx' ? cd.k50 : 0, k10: cd.type === 'fx' ? cd.k10 : 0, market: krwPerVnd(),
  };
  for (const [v, n] of Object.entries(rec.bills)) wallet[v] = (wallet[v] || 0) + n;
  saveWallet(); renderWallet();
  charges.push(rec); store.set('tw.charges', charges);
  cd.bills = {}; cd.k50 = 0; cd.k10 = 0;
  ['#chgAmount', '#chgKrw', '#chgFee', '#chgMemo'].forEach(id => ($(id).value = ''));
  $('#chgTime').value = nowLocal();
  renderChgForm(); renderCharge(); renderCashPlan();
  toast(`지갑에 ${fmt(amount)}₫ 추가했습니다`);
});
$('#chgList').addEventListener('click', e => {
  const b = e.target.closest('.pi-del'); if (!b) return;
  const i = charges.findIndex(c => c.id === b.dataset.id); if (i < 0) return;
  const c = charges[i];
  const lack = Object.entries(c.bills).some(([v, n]) => (wallet[v] || 0) < n);
  if (!confirm(`${fmt(c.amount)}₫ 충전 기록을 삭제할까요?\n지갑에서 해당 지폐를 다시 뺍니다.${lack ? '\n(이미 사용한 지폐는 0장까지만 뺍니다)' : ''}`)) return;
  for (const [v, n] of Object.entries(c.bills)) wallet[v] = Math.max(0, (wallet[v] || 0) - n);
  Object.keys(wallet).forEach(k => { if (!wallet[k]) delete wallet[k]; });
  saveWallet(); renderWallet();
  charges.splice(i, 1); store.set('tw.charges', charges); renderCharge(); renderChgForm(); renderCashPlan();
  toast('삭제했습니다');
});
function renderCharge() {
  if (!$('#chgList')) return;
  const sum = charges.reduce((s, c) => s + c.amount, 0);
  const withKrw = charges.filter(c => chgKrwUsed(c) > 0);
  const kSum = withKrw.reduce((s, c) => s + chgKrwUsed(c), 0), vSum = withKrw.reduce((s, c) => s + c.amount, 0);
  $('#chgSum').textContent = fmt(sum);
  $('#chgCount').textContent = charges.length ? `· ${charges.length}건` : '';
  $('#chgSumKrw').textContent = `사용한 원화 ${fmt(kSum)}원${vSum ? ` · 평균 100₫ = ${(kSum / vSum * 100 + 1e-9).toFixed(2)}원` : ''}`;
  const groups = {};
  [...charges].sort((a, b) => b.ts - a.ts).forEach(c => {
    const d = new Date(c.ts), key = `${d.getMonth() + 1}/${d.getDate()} (${WD[d.getDay()]})`;
    (groups[key] = groups[key] || []).push(c);
  });
  $('#chgList').innerHTML = charges.length ? Object.entries(groups).map(([k, list]) => `
    <div class="pay-day"><h4><span>${k}</span><span><b>+${fmt(list.reduce((s, c) => s + c.amount, 0))}₫</b></span></h4><ul class="pay-items">${list.map(c => {
      const kr = chgKrwUsed(c);
      return `<li class="pay-item">
        <div class="pi-cat" style="--c:${c.type === 'atm' ? '#0e8a7e' : '#f59e0b'}">${c.type === 'atm' ? 'ATM' : '환전'}</div>
        <div class="pi-main"><div class="pi-memo">${esc(c.memo || (c.type === 'atm' ? 'ATM 출금' : '환전'))}</div>
          <div class="pi-meta">${new Date(c.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}${c.type === 'fx' && (c.k50 || c.k10) ? ` · ${[c.k50 ? `5만원×${c.k50}` : '', c.k10 ? `1만원×${c.k10}` : ''].filter(Boolean).join(' + ')}` : ''}</div>
          <div class="pi-bills">${billsText(c.bills)}</div></div>
        <div class="pi-amt plus">+${fmt(c.amount)}₫<small>${kr ? `${fmt(kr)}원 · 100₫=${(kr / c.amount * 100 + 1e-9).toFixed(2)}원` : '원화 미입력'}</small></div>
        <button class="pi-del" data-id="${c.id}" type="button" aria-label="삭제">×</button>
      </li>`;
    }).join('')}</ul></div>`).join('') : '<div class="empty">아직 충전 기록이 없습니다</div>';
}
$('#chgTime').value = nowLocal();

// ---------- schedule (Google Sheet) ----------
function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}

const DATE_RE = /^\s*\d{1,2}\s*[\/.]\s*\d{1,2}\s*\.?\s*$/;
const MOVE_RE = /(그랩|도보|차량|케이블카|택시|버스|셔틀|배|페리|툭툭|오토바이)\s*\d+\s*(분|시간)/;
const MEALS = ['아침', '점심', '저녁', '야식', '브런치', '간식'];

function parseTitle(s) {
  let tag = '', move = '';
  s = s.trim();
  const m = s.match(/<([^>]{1,12})>/);
  if (m) { tag = m[1].trim(); s = s.replace(m[0], '').trim(); }
  const parts = s.split(/\s+\/\s+/);
  if (parts.length > 1 && MOVE_RE.test(parts[parts.length - 1])) move = parts.pop().trim();
  return { tag, title: parts.join(' / ').trim(), move };
}
function parseEvents(text) {
  const ev = []; let cur = null;
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const l = raw.trim(); if (!l) continue;
    const m = l.match(/^(\d{1,2}[:시]\d{2})\s*(.*)$/);
    if (m) { cur = { time: m[1].replace('시', ':').padStart(5, '0'), ...parseTitle(m[2]), subs: [] }; ev.push(cur); }
    else {
      const star = /^[*※]/.test(l);
      const t = l.replace(/^[-*•※·]\s*/, '').trim();
      if (!t) continue;
      if (cur) cur.subs.push({ text: t, star });
      else ev.push(cur = { time: '', ...parseTitle(t), subs: [] });
    }
  }
  return ev;
}

function parseSheet(rows) {
  const W = Math.max(...rows.map(r => r.length));
  const g = (i, j) => ((rows[i] && rows[i][j]) || '').trim();
  let dateRow = -1, best = 0;
  rows.forEach((r, i) => { const n = r.filter(c => DATE_RE.test(c)).length; if (n > best) { best = n; dateRow = i; } });
  if (dateRow < 0) throw new Error('시트에서 날짜 행(예: 11/5)을 찾지 못했습니다');
  const cols = [];
  for (let j = 0; j < W; j++) if (DATE_RE.test(g(dateRow, j))) cols.push(j);
  const wdRow = dateRow - 1;
  let title = '';
  for (let i = 0; i < Math.max(0, wdRow) && !title; i++) title = rows[i].map(c => c.trim()).find(Boolean) || '';

  const themeRow = dateRow + 1;
  let detailRow = -1, maxLen = 0;
  for (let i = themeRow + 1; i < rows.length; i++) {
    const len = cols.reduce((a, j) => a + g(i, j).length, 0);
    if (len > maxLen) { maxLen = len; detailRow = i; }
  }
  const days = cols.map(j => ({
    col: j, wd: wdRow >= 0 ? g(wdRow, j) : '', date: g(dateRow, j).replace(/\s|\.$/g, ''),
    theme: g(themeRow, j), events: detailRow >= 0 ? parseEvents(g(detailRow, j)) : [],
    summary: '', sun: '', memo: [],
  }));
  const notes = [];
  for (let i = themeRow + 1; i < rows.length; i++) {
    if (i === detailRow) continue;
    const filled = cols.filter(j => g(i, j));
    const isSun = filled.some(j => /일출|일몰/.test(g(i, j)));
    const dense = filled.length >= Math.max(2, Math.ceil(cols.length / 2));
    if (isSun) days.forEach(d => (d.sun = g(i, d.col).replace(/\s*\n\s*/g, ' · ')));
    else if (dense) days.forEach(d => { const v = g(i, d.col); if (v) d.summary = d.summary ? d.summary + ' / ' + v : v; });
    else filled.forEach(j => notes.push(g(i, j)));
    for (let j = 0; j < W; j++) if (!cols.includes(j) && g(i, j) && i > themeRow) notes.push(g(i, j));
  }
  // group alternatives on the same date
  const counts = {};
  days.forEach(d => (counts[d.date] = (counts[d.date] || 0) + 1));
  const seen = {};
  days.forEach(d => {
    d.wdShort = d.wd.replace(/\[.*?\]/g, '').trim();
    if (counts[d.date] > 1) {
      seen[d.date] = (seen[d.date] || 0) + 1;
      const fromTheme = (d.theme.match(/\[([^\]]+)\]/) || [])[1];
      const fromWd = (d.wd.match(/\[([^\]]+)\]/) || [])[1];
      d.alt = fromTheme || fromWd || `안 ${seen[d.date]}`;
      d.theme = d.theme.replace(/\[[^\]]+\]\s*/, '');
    }
  });
  return { title, days, notes, dayCount: Object.keys(counts).length };
}

const plan = { data: store.get('tw.plan', null), at: store.get('tw.planAt', 0), mode: ['all', 'day'].includes(store.get('tw.planMode', 'all')) ? store.get('tw.planMode', 'all') : 'all', sel: store.get('tw.planSel', 0), loading: false, err: '' };
let planTimer;

async function fetchSheet() {
  let lastErr;
  for (const u of SHEET_URLS) {
    try {
      const res = await fetch(u + '&_=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const txt = await res.text();
      if (/^\s*</.test(txt)) throw new Error('시트가 공개되어 있지 않습니다');
      return parseSheet(parseCSV(txt));
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('불러오기 실패');
}

async function loadPlan(manual = false) {
  if (plan.loading) return;
  plan.loading = true; $('#planRefresh').classList.add('spin');
  if (!plan.data) renderPlan();
  try {
    const d = await fetchSheet();
    const changed = JSON.stringify(d) !== JSON.stringify(plan.data);
    plan.data = d; plan.at = Date.now(); plan.err = '';
    store.set('tw.plan', d); store.set('tw.planAt', plan.at);
    if (changed || !$('#planBody .day')) renderPlan(); else renderPlanStatus();
    if (manual) toast(changed ? '일정이 업데이트되었습니다' : '최신 일정입니다');
  } catch (e) {
    plan.err = e.message || String(e);
    renderPlan();
  } finally {
    plan.loading = false; $('#planRefresh').classList.remove('spin');
  }
  clearTimeout(planTimer);
  planTimer = setTimeout(() => { if (currentTab === 'plan' && !document.hidden) loadPlan(); }, PLAN_AUTO_MS);
}

function renderPlanStatus() {
  const s = $('#planStatus');
  const when = plan.at ? new Date(plan.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  s.classList.toggle('err', !!plan.err);
  s.textContent = plan.err
    ? `⚠ ${plan.err}${plan.data ? ` — 저장된 일정 표시 중 (${when})` : ''}`
    : when ? `구글 시트 실시간 연동 · ${when} 업데이트 · 1분마다 자동 갱신` : '';
}

const tagHtml = t => t ? `<span class="tag ${MEALS.includes(t) ? 'meal' : ''}">${esc(t)}</span>` : '';
const moveHtml = m => m ? `<span class="move">${esc(m)}</span>` : '';
function dayHead(d) {
  return `<div class="day-head">
    <div class="dnum"><b>${esc(d.date)}</b><span>${esc(d.wdShort)}</span></div>
    <div class="dmeta">
      ${d.alt ? `<span class="dalt">${esc(d.alt)}</span>` : ''}
      <div class="dtheme">${esc(d.theme || d.summary || '자유 일정')}</div>
      ${d.summary && d.theme && d.summary !== d.theme ? `<div class="dsum">${esc(d.summary)}</div>` : ''}
    </div></div>`;
}
function dayIndexLabel(d, data) {
  const dates = [...new Set(data.days.map(x => x.date))];
  return `DAY ${dates.indexOf(d.date) + 1}`;
}
function notesHtml(data) {
  if (!data.notes.length) return '';
  return `<div class="memo"><h4>메모</h4>${data.notes.map(esc).join('\n\n')}</div>`;
}

function renderPlan() {
  renderPlanStatus();
  $$('#view-plan .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === plan.mode));
  const body = $('#planBody'), chips = $('#dayChips');
  const data = plan.data;
  if (!data) {
    chips.hidden = true;
    body.innerHTML = `<div class="empty">${plan.err ? '일정을 불러오지 못했습니다.<br>시트 공유 설정(링크가 있는 모든 사용자: 뷰어)을 확인하세요.' : '일정을 불러오는 중…'}</div>`;
    return;
  }
  if (plan.sel >= data.days.length) plan.sel = 0;

  if (plan.mode === 'all') {
    chips.hidden = true;
    body.innerHTML = `<div class="capture" id="capture" style="--cols:${data.days.length}">
      <div class="trip-title">${esc(data.title || '여행 일정')}</div>
      <div class="grid">${data.days.map((d, i) => `
        <article class="day" data-i="${i}">
          ${dayHead(d)}
          ${d.sun ? `<div class="dsun">☀ ${esc(d.sun)}</div>` : ''}
          <ul class="mini">${d.events.map(e => `<li><span class="t">${esc(e.time)}</span><span>${tagHtml(e.tag)}${esc(e.title)}</span></li>`).join('') || '<li><span>일정 없음</span></li>'}</ul>
        </article>`).join('')}
      </div>
      ${notesHtml(data)}
    </div>`;
    $$('#planBody .day').forEach(a => a.addEventListener('click', () => { plan.sel = +a.dataset.i; setMode('day'); }));
  } else {
    chips.hidden = false;
    chips.innerHTML = data.days.map((d, i) => `<button class="chip ${i === plan.sel ? 'active' : ''}" data-i="${i}" type="button"><b>${esc(d.date)}</b><span>${esc(d.alt || d.wdShort)}</span></button>`).join('');
    const d = data.days[plan.sel];
    body.innerHTML = `<div class="capture" id="capture">
      <div class="trip-title">${esc(dayIndexLabel(d, data))} · ${esc(d.date)} (${esc(d.wdShort)}) ${d.alt ? '· ' + esc(d.alt) : ''}</div>
      <article class="day">
        ${dayHead(d)}
        ${d.sun ? `<div class="dsun">☀ ${esc(d.sun)}</div>` : ''}
        <ol class="tl">${d.events.map(e => `
          <li class="ev"><div class="t">${esc(e.time)}</div><div class="rail"></div>
            <div class="body"><div class="title">${tagHtml(e.tag)}${esc(e.title)}${moveHtml(e.move)}</div>
            ${e.subs.length ? `<ul>${e.subs.map(s => `<li class="${s.star ? 'star' : ''}">${esc(s.text)}</li>`).join('')}</ul>` : ''}
          </div></li>`).join('') || '<li class="empty">일정 없음</li>'}</ol>
      </article>
      ${plan.sel === data.days.length - 1 || data.days.length === 1 ? notesHtml(data) : ''}
    </div>`;
    const a = chips.querySelector('.chip.active'); if (a) a.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
}
function setMode(m) { plan.mode = m; store.set('tw.planMode', m); store.set('tw.planSel', plan.sel); renderPlan(); window.scrollTo(0, 0); }
$$('#view-plan .seg-btn').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('#dayChips').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return;
  plan.sel = +c.dataset.i; store.set('tw.planSel', plan.sel); renderPlan();
});
$('#planRefresh').addEventListener('click', () => loadPlan(true));
document.addEventListener('visibilitychange', () => { if (!document.hidden && currentTab === 'plan') loadPlan(); });

// ---------- image export ----------
let h2cP;
function loadH2C() {
  if (window.html2canvas) return Promise.resolve();
  return h2cP || (h2cP = new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = ok; s.onerror = () => { h2cP = null; no(new Error('이미지 라이브러리 로드 실패')); };
    document.head.appendChild(s);
  }));
}
$('#planSave').addEventListener('click', async () => {
  const node = $('#capture'); if (!node) return toast('저장할 일정이 없습니다');
  toast('이미지 만드는 중…');
  try {
    await loadH2C();
    const wide = plan.mode === 'all';
    if (wide) node.classList.add('export-wide'); else node.style.width = '440px';
    const bg = getComputedStyle(document.body).backgroundColor;
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: bg, useCORS: true, windowWidth: Math.max(node.scrollWidth, 480) });
    node.classList.remove('export-wide'); node.style.width = '';
    const d = plan.data.days[plan.sel];
    const name = wide ? '여행일정_전체.png' : `여행일정_${d.date.replace('/', '-')}${d.alt ? '_' + d.alt.replace(/[\\/:*?"<>|\s]+/g, '') : ''}.png`;
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], name, { type: 'image/png' });
    const touch = matchMedia('(pointer:coarse)').matches;
    if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('이미지를 저장했습니다');
  } catch (e) {
    node.classList.remove('export-wide'); node.style.width = '';
    toast('이미지 저장 실패: ' + e.message);
  }
});

// ---------- init ----------
renderWallet();
renderSaved();
renderPay();
renderCashPlan();
renderCharge();
renderChgForm();
renderCalc();
renderRate();
loadRate();
if (plan.data) renderPlan();
showTab(currentTab);
if (currentTab !== 'plan') loadPlan(); // prefetch so the plan is fresh when opened
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
