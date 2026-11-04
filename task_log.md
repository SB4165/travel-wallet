# Task Log

## [2026-11-03 23:10] Travel Wallet PWA 초기 구축 및 배포
- **Instruction**: 개인 여행 웹/앱(GitHub). 탭 3개 — 지갑(VND 1,000~500,000 지폐별 수량, 상/하단 총액), 계산(+/−/할인%/총액, 실시간 VND→KRW 환산), 일정(구글 시트 '푸꾸옥' 탭을 전체/일별로 보기 좋게, 이미지 다운로드, 시트 수정 시 실시간 반영). GitHub 업로드까지.
- **Changes**: Repo `SB4165/travel-wallet` (public) 생성. `index.html`, `style.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`, `.nojekyll`, `README.md`, `task_log.md` 추가. 시트 CSV는 gviz(`tqx=out:csv&headers=0`) 우선, `export?format=csv` 폴백. 환율 open.er-api.com → jsdelivr currency-api 폴백, 수동 입력 지원. html2canvas(cdnjs 1.4.1) 지연 로드로 PNG 저장.
- **Result & Status**: 로컬 Playwright 테스트 통과(지갑 합계, 계산 (350000+120000)×0.9=423000, 일정 파싱/렌더, JS 에러 0). GitHub Pages 활성화는 MCP 미지원 → 사용자 설정 필요 시 Settings › Pages › main/(root).

## [2026-11-03 23:20] GitHub Pages 배포 및 라이브 검증
- **Instruction**: Pages 활성화 후 실사이트 검증 (사용자 GitHub 로그인, 시트 공개 전환 완료)
- **Changes**: Settings › Pages › Deploy from branch `main` / `(root)` 저장. 코드 변경 없음.
- **Result & Status**: Success — https://sb4165.github.io/travel-wallet/ 라이브. 환율(1,000₫=52.25원) 로드, 시트 실시간 연동(6개 일정 컬럼, 11/8 선택1/선택2, 메모 2건) 확인, html2canvas 전체 일정 PNG 3784×1656 생성 확인. 참고: 최초 시트 읽기 성공은 브라우저 Google 로그인 쿠키 때문이었음 → 공개 공유 필수.

## [2026-11-03 23:45] v2: 결제 탭·지갑 저장·레이아웃/아이콘 개선
- **Instruction**: 지갑 우측 글자 잘림 수정, 지갑 저장 기능, 지갑 옆 4번째 '결제' 탭(입력 시 지갑 자동 차감), 탭/앱 아이콘 교체(비행기, 어울리는 배경).
- **Changes**: `index.html`(color-scheme 메타로 삼성 인터넷 강제 다크 차단, 결제 탭, SVG 탭 아이콘, 저장 버튼, 계산→결제 버튼), `style.css`(지갑 행 72px/축소 스테퍼/소계 줄바꿈, 결제 UI), `app.js`(saveWallet/renderSaved, 결제 모듈: DP 기반 최소 초과 지폐 추천+그리디 거스름, 수동 수정, 차감/삭제 원복, 기록별 환율 저장), `icon.svg`(하늘 그라데이션+흰 비행기), `sw.js` 캐시 tw-v2, manifest, README.
- **Result & Status**: Playwright 360px 테스트 통과 — 지갑 행 오버플로 없음, 345,000₫ 현금 결제 시 500k 지불/155k 거스름 차감 후 삭제 시 원복, 현금 부족 경고, 다크모드 확인, JS 에러 0. 저장 버튼 클릭 가림 버그(z-index) 발견·수정.

## [2026-11-03 23:55] v3: 라이트모드 고정·환율 100동 기준
- **Instruction**: 결제 내역 자동 저장 여부 확인, 모바일 라이트모드 고정, 환율 표시/입력을 100동 기준으로.
- **Changes**: `style.css` 다크 테마 media query 제거(`:root{color-scheme:light}` 유지, `<meta color-scheme="light dark">` 유지로 삼성 인터넷 강제 다크 차단). `app.js` 환율 표시 `100₫ = x원`, 수동 환율 키 `tw.rateManual100`(기존 1,000동 기준 값 ÷10 자동 이관), 반올림 보정. `index.html` 수동 입력 라벨 100동. `sw.js` 캐시 tw-v3.
- **Result & Status**: 결제 내역은 `tw.pays`로 기록/삭제 시 자동 저장(변경 없음). Playwright: 다크 시스템에서도 배경 라이트, 레거시 60원/1,000동 → 6.00원/100동 변환, 자동 환율 100₫=5.23원, JS 에러 0.

## [2026-11-04 00:20] v4: 원화 결제·충전/환전 탭·지폐별 원화 표시
- **Instruction**: 결제 탭에 원화 결제 입력 추가, 충전/환전 탭 추가(ATM 출금 xxx동 / 5만원권 환전 = xxx동, 지폐 단위별 장수 입력, 지갑 연동), 지갑 지폐 단위 아래 원화 금액 표시.
- **Changes**: `index.html`(결제 통화 선택 ₫/₩, 원화 합계 줄, 충전 탭 + 탭바 5개), `style.css`(cur-seg, kv/charge UI), `app.js`(결제 cur 필드·원화 기록은 지갑 차감 없음·합계 분리, 충전 모듈 `tw.charges`: 금액→그리디 지폐 채움·장수 수정 시 금액 동기화·ATM 원화청구액/수수료·환전 5만/1만원권 장수·적용 환율/시장 대비 %·기록 시 지갑 지폐 추가·삭제 시 차감, 지갑 `.bill-krw` 지폐별 원화). 버그 수정: 일정 탭 `.seg-btn` 핸들러가 결제/충전 세그 버튼에도 바인딩되어 현금·카드 동시 활성/planMode 오염 → `#view-plan` 범위로 한정 + planMode 검증. `sw.js` tw-v4, README.
- **Result & Status**: Playwright 360px — ATM 3,000,000₫/160,000원 → 100₫=5.33원(+1.6%), 지폐 수정 시 금액 동기화, 환전 5만원×4 → 3,800,000₫ 100₫=5.26원, 원화 결제 45,000원 차감 없음·합계 표시, 충전 삭제 시 지갑 원복, 지갑 오버플로 없음, JS 에러 0.

## [2026-11-04 00:45] v5: 회화 탭 추가
- **Instruction**: 마지막 탭으로 회화 추가, 첨부 이미지의 회화를 카테고리별로 정리(한국인이 잘 안 쓰는 말 제외).
- **Changes**: 신규 `phrases.js`(5개 카테고리 45문장 데이터, 카테고리 칩·검색(성조 무시)·탭 시 전체화면 표시·speechSynthesis vi 음성 있을 때만 듣기 버튼), 신규 `phrases.css`(6탭 바 축소, 카드/★중요/오버레이). `index.html`(회화 섹션·오버레이·탭·스크립트/스타일 링크), `sw.js` tw-v5 + 셸에 신규 파일 추가, README. 제외: 중복(얼마예요·카드 결제, 마사지 괜찮아요/조금 약하게)과 저빈도(네 Vâng, 여기는 괜찮아요, 조금만 더 해주세요, 이거 안 들어가게). app.js 변경 없음.
- **Result & Status**: Playwright 360px — 45문장/6칩, 검색 'cay' 3건·'고수' 1건, 마사지 13건, 오버레이 표시/닫기, 6탭 넘침 없음, 결제 세그 정상, JS 에러 0. 업로드 검증 중 phrases.js 발음 오타 5건(전송 시 발생) 발견 → 재업로드로 수정, 원격=로컬 일치 확인.

## [2026-11-05 01:00] v6: 앱 내 일정 편집·날짜별 요약 자동 생성
- **Instruction**: 일정표를 웹/모바일에서 수정 가능하게(앱 안 편집 방식 선택). 추가: 날짜 옆 요약이 예전 내용 → 하루 일정에서 자동 요약.
- **Changes**: 신규 `editor.js`(✎ 편집/⚙ 설정 버튼 주입, 날짜별 테마·요약·상세 원문 편집 + 삽입 도우미 + 실시간 미리보기, Apps Script 웹앱 POST(text/plain, 토큰), 설정·연결 테스트·코드 복사), `editor.css`, `gas/Code.gs`(토큰 검증, LockService, 기존값 비교→불일치 시 내용으로 셀 탐색, 0/2건 이상이면 충돌 거부), 신규 `summary.js`(dayHead 재정의: 테마 + 이벤트 제목에서 이동/휴식 등 제외한 장소 최대 5개 자동 요약, 없으면 시트 요약 사용). `index.html`(링크/스크립트), `sw.js` tw-v6, README. app.js 변경 없음.
- **Result & Status**: Code.gs 모의 시트 테스트(토큰 오류, ping, 정확 위치, 오프셋 탐색, 충돌, 빈 셀) 통과. Playwright: 설정/연결 테스트, 11/8 선택1 편집 → POST row/col/oldValue 정확, 미리보기·닫힘, 360px 헤더 한 줄. 요약 예: 11/6 → 수영, 냐항센, 루이스파, 빈산, LOCA - Night Market. 실제 Apps Script 배포·저장은 사용자 설정 후 확인 필요.

## [2026-11-05 01:15] v6.1: 편집 설정 간소화(비밀번호 자동 삽입)
- **Instruction**: Apps Script 설정을 대신 해달라는 요청(비밀번호 지정). 브라우저(앱 내/Chrome 확장) 미연결 + 비밀번호 대리 입력 불가 → 사용자 선택: 설정 간소화.
- **Changes**: `editor.js` 설정 단계 4단계로 재구성, 비밀번호 입력 후 '코드 복사' 시 Code.gs의 TOKEN 자리에 자동 삽입(따옴표·역슬래시 차단, 미입력 시 안내), `editor.css` 버튼 간격, `sw.js` tw-v7. 비밀번호 값은 repo·로그에 저장하지 않음.
- **Result & Status**: Playwright — 미입력 경고, 테스트 비밀번호 삽입 확인, 복사된 코드로 모의 GAS ping 성공, 기존 편집 테스트 회귀 통과. 실제 배포는 사용자 진행 필요.
