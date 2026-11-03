# Task Log

## [2026-11-03 23:10] Travel Wallet PWA 초기 구축 및 배포
- **Instruction**: 개인 여행 웹/앱(GitHub). 탭 3개 — 지갑(VND 1,000~500,000 지폐별 수량, 상/하단 총액), 계산(+/−/할인%/총액, 실시간 VND→KRW 환산), 일정(구글 시트 '푸꾸옥' 탭을 전체/일별로 보기 좋게, 이미지 다운로드, 시트 수정 시 실시간 반영). GitHub 업로드까지.
- **Changes**: Repo `SB4165/travel-wallet` (public) 생성. `index.html`, `style.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon.svg`, `.nojekyll`, `README.md`, `task_log.md` 추가. 시트 CSV는 gviz(`tqx=out:csv&headers=0`) 우선, `export?format=csv` 폴백. 환율 open.er-api.com → jsdelivr currency-api 폴백, 수동 입력 지원. html2canvas(cdnjs 1.4.1) 지연 로드로 PNG 저장.
- **Result & Status**: 로컬 Playwright 테스트 통과(지갑 합계, 계산 (350000+120000)×0.9=423000, 일정 파싱/렌더, JS 에러 0). GitHub Pages 활성화는 MCP 미지원 → 사용자 설정 필요 시 Settings › Pages › main/(root).

## [2026-11-03 23:20] GitHub Pages 배포 및 라이브 검증
- **Instruction**: Pages 활성화 후 실사이트 검증 (사용자 GitHub 로그인, 시트 공개 전환 완료)
- **Changes**: Settings › Pages › Deploy from branch `main` / `(root)` 저장. 코드 변경 없음.
- **Result & Status**: Success — https://sb4165.github.io/travel-wallet/ 라이브. 환율(1,000₫=52.25원) 로드, 시트 실시간 연동(6개 일정 컬럼, 11/8 선택1/선택2, 메모 2건) 확인, html2canvas 전체 일정 PNG 3784×1656 생성 확인. 참고: 최초 시트 읽기 성공은 브라우저 Google 로그인 쿠키 때문이었음 → 공개 공유 필수.
