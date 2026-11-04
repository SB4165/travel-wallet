/* Travel Wallet — auto day summary for schedule headers (built from the day's latest events) */
'use strict';
(() => {
  // words describing logistics rather than a destination
  const SKIP_WORDS = /(호텔\s*조식|조식|복귀|휴식|출발|도착|체크인|체크아웃|레이트|짐\s*(보관|픽업|패킹|정리)?|패킹|이동|수속|산책|낮잠|픽업\s*차량|픽업|장기\s*주차장|주차장|주차|입국|출국|정산|준비|탑승|선베드|선점|리프레시|샤워|구경|전용|및)/g;
  const GENERIC = /^(.*리조트|호텔|.*공항|집|모닝|메인\s*풀|오션뷰\s*테라스|차량|그랩|케이블카|룸|기내식|E-?SIM.*|ATM.*|.*역)$/i;
  const MAX = 5;

  function clean(part) {
    let s = part.replace(/\([^)]*\)|\[[^\]]*\]|<[^>]*>/g, ' ');
    s = s.replace(SKIP_WORDS, ' ').replace(/[♥❤~]/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^(or|및|&|,)\s*|\s*(or|및|&|,)$/gi, '').trim();
    const allGeneric = s.split(' ').every(w => /^(공항|차량|리조트|호텔|집|그랩|모닝|룸)$|공항$|리조트$/.test(w));
    return s.length < 2 || GENERIC.test(s) || allGeneric ? '' : s;
  }
  function summarize(events) {
    const out = [];
    for (const e of events || []) {
      if (e.tag === '네일' || e.tag === '정찰' || /[♥❤]/.test(e.title)) continue; // personal notes, not places
      for (const part of String(e.title || '').split(/\s*(?:&|,|\bor\b|\/)\s*/i)) {
        const c = clean(part);
        if (c && !out.some(o => o.includes(c) || c.includes(o))) out.push(c);
      }
    }
    if (!out.length) return '';
    return out.length > MAX ? `${out.slice(0, MAX).join(', ')} 외 ${out.length - MAX}` : out.join(', ');
  }
  window.daySummary = summarize;

  // override the header renderer from app.js: theme (if any) + auto summary from the latest events
  dayHead = function (d) {
    const auto = summarize(d.events) || d.summary || '';
    const title = d.theme || auto || '자유 일정';
    const sub = d.theme && auto && auto !== d.theme ? auto : '';
    return `<div class="day-head">
    <div class="dnum"><b>${esc(d.date)}</b><span>${esc(d.wdShort)}</span></div>
    <div class="dmeta">
      ${d.alt ? `<span class="dalt">${esc(d.alt)}</span>` : ''}
      <div class="dtheme">${esc(title)}</div>
      ${sub ? `<div class="dsum">${esc(sub)}</div>` : ''}
    </div></div>`;
  };
  if (plan.data) renderPlan();
})();
