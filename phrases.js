/* Travel Wallet — Vietnamese phrasebook tab */
'use strict';
(() => {
  // [korean, vietnamese, pronunciation, important?]
  const PHRASES = {
    '기본': [
      ['안녕하세요', 'Xin chào', '씬 짜오'],
      ['감사합니다', 'Cảm ơn', '깜 언', 1],
      ['저기요! (직원 부를 때)', 'Em ơi!', '엠 어이!', 1],
      ['아니요', 'Không', '콩'],
      ['괜찮아요', 'Không sao', '콩 싸오'],
    ],
    '식당·카페': [
      ['메뉴판 주세요', 'Cho tôi xem menu', '저 또이 쌔 메뉴'],
      ['이거 주세요', 'Cho tôi cái này', '저 또이 까이 나이'],
      ['추천 메뉴가 뭐예요?', 'Món nào ngon?', '몬 나오 응온?'],
      ['이거 맛있어요?', 'Cái này ngon không?', '까이 나이 응온 콩?'],
      ['이거 매워요?', 'Cái này cay không?', '까이 나이 까이 콩?'],
      ['고수 빼주세요', 'Không cho rau mùi', '콩 저 라우 무이', 1],
      ['맵지 않게 해주세요', 'Không cay', '콩 까이', 1],
      ['덜 맵게 해주세요', 'Ít cay thôi', '잇 까이 또이'],
      ['물 주세요', 'Cho tôi nước', '저 또이 느역'],
      ['얼음 빼주세요', 'Không đá', '콩 다'],
      ['얼음 많이 주세요', 'Nhiều đá', '니에우 다'],
      ['포장해 주세요', 'Cho tôi mang về', '저 또이 망 베', 1],
      ['테이크아웃 할게요', 'Mang đi', '망 디'],
      ['맛있어요!', 'Ngon quá!', '응온 꾸아!'],
    ],
    '계산·결제': [
      ['계산해 주세요', 'Tính tiền', '떤 띠엔', 1],
      ['얼마예요?', 'Bao nhiêu tiền?', '바오 니에우 띠엔?', 1],
      ['50K예요?', '50 nghìn?', '남 응힌?'],
      ['카드 결제 돼요?', 'Có trả bằng thẻ không?', '꺼 짜 방 테 콩?'],
      ['잔돈 있어요?', 'Có tiền lẻ không?', '꺼 띠엔 레 콩?'],
      ['영수증 주세요', 'Cho tôi hóa đơn', '저 또이 호아 던'],
    ],
    '쇼핑·흥정': [
      ['이거 보여주세요', 'Cho tôi xem cái này', '저 또이 쌔 까이 나이'],
      ['다른 색 있어요?', 'Có màu khác không?', '꺼 마우 칵 콩?'],
      ['더 큰 사이즈 있어요?', 'Có size lớn hơn không?', '꺼 사이 러언 헌 콩?'],
      ['더 작은 사이즈 있어요?', 'Có size nhỏ hơn không?', '꺼 사이 녀 헌 콩?'],
      ['너무 비싸요', 'Đắt quá!', '닥 꾸아!', 1],
      ['조금 깎아주세요', 'Giảm giá một chút nhé', '잠 자 못 쭛 녘', 1],
      ['이걸로 할게요', 'Tôi lấy cái này', '또이 러이 까이 나이'],
    ],
    '마사지': [
      ['세게 해주세요', 'Mạnh lên', '망 렌', 1],
      ['살살 해주세요', 'Nhẹ thôi', '녘 또이', 1],
      ['조금만 세게', 'Mạnh hơn một chút', '망 헌 못 쭛'],
      ['아파요', 'Đau', '따우'],
      ['너무 아파요', 'Đau quá', '따우 꾸아'],
      ['여기가 아파요', 'Ở đây đau', '어 데이 따우'],
      ['그만해주세요', 'Dừng lại', '즈응 라이'],
      ['시원해요', 'Dễ chịu quá', '제 찌우 꾸아'],
      ['어깨 집중적으로 해주세요', 'Làm kỹ vai', '람 끼 바이'],
      ['허리 집중적으로 해주세요', 'Làm kỹ lưng', '람 끼 르영'],
      ['다리 집중적으로 해주세요', 'Làm kỹ chân', '람 끼 쩌언'],
      ['목 집중적으로 해주세요', 'Làm kỹ cổ', '람 끼 꼬'],
      ['발을 해주세요', 'Làm chân', '람 쩌언'],
    ],
  };
  const CATS = ['전체', ...Object.keys(PHRASES)];
  const ALL = Object.entries(PHRASES).flatMap(([cat, list]) => list.map(([ko, vi, pr, star]) => ({ cat, ko, vi, pr, star: !!star })));

  const q = s => document.querySelector(s);
  const escH = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, '');
  let cat = '전체';
  try { cat = localStorage.getItem('tw.phraseCat') || '전체'; } catch {}
  if (!CATS.includes(cat)) cat = '전체';

  // text-to-speech (only if the phone has a Vietnamese voice)
  let viVoice = null;
  const pickVoice = () => {
    if (!('speechSynthesis' in window)) return;
    viVoice = speechSynthesis.getVoices().find(v => /^vi/i.test(v.lang)) || null;
    document.body.classList.toggle('no-tts', !viVoice);
  };
  const speak = text => {
    if (!viVoice) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = viVoice; u.lang = viVoice.lang; u.rate = 0.85;
    speechSynthesis.speak(u);
  };
  document.body.classList.add('no-tts');
  if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }

  function render() {
    const term = norm(q('#phSearch').value);
    q('#phCats').innerHTML = CATS.map(c => `<button type="button" class="ph-cat ${c === cat ? 'active' : ''}" data-c="${c}">${c}</button>`).join('');
    const list = ALL.filter(p => (cat === '전체' || p.cat === cat) && (!term || norm(p.ko).includes(term) || norm(p.vi).includes(term) || norm(p.pr).includes(term)));
    const groups = {};
    list.forEach(p => (groups[p.cat] = groups[p.cat] || []).push(p));
    q('#phList').innerHTML = list.length ? Object.entries(groups).map(([c, items]) => `
      <h4 class="ph-group">${c}</h4>
      <ul class="ph-items">${items.map(p => `
        <li class="ph-item ${p.star ? 'star' : ''}" data-i="${ALL.indexOf(p)}">
          <div class="ph-ko">${p.star ? '<span class="ph-star">★</span>' : ''}${escH(p.ko)}</div>
          <div class="ph-vi">${escH(p.vi)}</div>
          <div class="ph-pr">${escH(p.pr)}</div>
          <button type="button" class="ph-say" data-say="${ALL.indexOf(p)}" aria-label="듣기">🔊</button>
        </li>`).join('')}</ul>`).join('') : '<div class="empty">검색 결과가 없습니다</div>';
  }
  function show(p) {
    q('#phShowVi').textContent = p.vi;
    q('#phShowPr').textContent = p.pr;
    q('#phShowKo').textContent = p.ko;
    q('#phShow').hidden = false;
    q('#phShow').dataset.i = ALL.indexOf(p);
  }

  q('#phCats').addEventListener('click', e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    cat = b.dataset.c; try { localStorage.setItem('tw.phraseCat', cat); } catch {}
    render(); window.scrollTo(0, 0);
  });
  q('#phSearch').addEventListener('input', render);
  q('#phList').addEventListener('click', e => {
    const say = e.target.closest('[data-say]');
    if (say) { e.stopPropagation(); return speak(ALL[+say.dataset.say].vi); }
    const li = e.target.closest('.ph-item'); if (li) show(ALL[+li.dataset.i]);
  });
  q('#phShow').addEventListener('click', e => {
    if (e.target.closest('#phShowSay')) return speak(ALL[+q('#phShow').dataset.i].vi);
    q('#phShow').hidden = true;
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') q('#phShow').hidden = true; });
  render();
})();
