const TOKEN = '여기에-비밀번호'; // ← 앱의 '코드 복사'가 자동으로 채웁니다 (그대로 두면 최초 연결 비밀번호로 고정)
const SHEET_ID = '1g9DLmiVnyX1rsYREmeU_MSYl2egaDx170e0RQxLUZ2k';
const PLACEHOLDER = '여기에-' + '비밀번호';
const book = () => SpreadsheetApp.openById(SHEET_ID);

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (!checkToken(d.token)) return out({ ok: false, error: '비밀번호가 맞지 않습니다' });
    if (d.ping) return out({ ok: true, name: book().getName(), wallet: true });
    if (d.action === 'sync') return out(syncWallet(d));
    return out(editCell(d));
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function checkToken(t) {
  t = String(t || '');
  if (!t) return false;
  if (TOKEN !== PLACEHOLDER) return t === TOKEN;
  const P = PropertiesService.getScriptProperties();
  const saved = P.getProperty('tw_token');
  if (saved) return t === saved;
  P.setProperty('tw_token', t); // trust on first use
  return true;
}

// ---------- schedule cell edit ----------
function editCell(d) {
  const sh = book().getSheets().find(s => String(s.getSheetId()) === String(d.gid));
  if (!sh) return { ok: false, error: '시트(gid)를 찾을 수 없습니다' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const norm = v => String(v == null ? '' : v).replace(/\r/g, '').trim();
    let cell = sh.getRange(d.row + 1, d.col + 1);
    if (norm(cell.getDisplayValue()) !== norm(d.oldValue)) {
      const hits = [];
      if (norm(d.oldValue)) sh.getDataRange().getDisplayValues().forEach((r, i) => r.forEach((v, j) => {
        if (norm(v) === norm(d.oldValue)) hits.push([i + 1, j + 1]);
      }));
      if (hits.length !== 1) return { ok: false, conflict: true, error: '그 사이 시트 내용이 바뀌었습니다. 새로고침 후 다시 시도하세요' };
      cell = sh.getRange(hits[0][0], hits[0][1]);
    }
    cell.setValue(d.value);
    return { ok: true, cell: cell.getA1Notation() };
  } finally {
    lock.releaseLock();
  }
}

// ---------- shared wallet (private: Script Properties, not the public sheet) ----------
// ops: {t:'wd', d:{denom:delta}} | {t:'pa'|'ca', r:record} | {t:'pd'|'cd', id}
function syncWallet(d) {
  const P = PropertiesService.getScriptProperties();
  const ops = Array.isArray(d.ops) ? d.ops : [];
  if (!ops.length) {
    const ver = +(P.getProperty('w_ver') || 0);
    return d.ver === ver ? { ok: true, ver, same: true } : { ok: true, ver, state: readState(P) };
  }
  if (!d.batch) return { ok: false, error: 'batch id 누락' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    let ver = +(P.getProperty('w_ver') || 0);
    const seen = JSON.parse(P.getProperty('w_seen') || '[]');
    if (seen.indexOf(d.batch) >= 0) return { ok: true, ver, dup: true, state: readState(P) };
    const w = JSON.parse(P.getProperty('w_bills') || '{}');
    const put = {}, del = [];
    const okId = id => typeof id === 'string' && /^[\w-]{1,40}$/.test(id);
    ops.forEach(o => {
      if (!o) return;
      if (o.t === 'wd' && o.d) {
        Object.keys(o.d).forEach(v => {
          if (!/^\d{1,7}$/.test(v)) return;
          const n = Math.max(0, (w[v] || 0) + Math.round(+o.d[v] || 0));
          if (n) w[v] = n; else delete w[v];
        });
      } else if ((o.t === 'pa' || o.t === 'ca') && o.r && okId(o.r.id)) {
        const s = JSON.stringify(o.r);
        if (s.length < 8000) put[(o.t === 'pa' ? 'w_p:' : 'w_c:') + o.r.id] = s;
      } else if ((o.t === 'pd' || o.t === 'cd') && okId(o.id)) {
        del.push((o.t === 'pd' ? 'w_p:' : 'w_c:') + o.id);
      }
    });
    seen.push(d.batch);
    while (seen.length > 200) seen.shift();
    ver++;
    put.w_bills = JSON.stringify(w);
    put.w_ver = String(ver);
    put.w_seen = JSON.stringify(seen);
    P.setProperties(put);
    del.forEach(k => P.deleteProperty(k));
    return { ok: true, ver, state: readState(P) };
  } finally {
    lock.releaseLock();
  }
}

function readState(P) {
  const all = P.getProperties(), pays = [], charges = [];
  Object.keys(all).forEach(k => {
    if (k.indexOf('w_p:') === 0) pays.push(JSON.parse(all[k]));
    else if (k.indexOf('w_c:') === 0) charges.push(JSON.parse(all[k]));
  });
  return { w: JSON.parse(all.w_bills || '{}'), pays, charges };
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
