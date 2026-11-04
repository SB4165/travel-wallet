const TOKEN = '여기에-비밀번호'; // ← 나만 아는 비밀번호로 바꾸세요

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
      const norm = v => String(v == null ? '' : v).replace(/\r/g, '').trim();
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
