docs/planning/10-cqrs-architecture.md 파일을 읽고 이 CQRS 설계를 비판적으로 검증해줘. 
현재 프로젝트의 src/main/ipc/handlers/ 디렉토리 전체, src/shared/types.ts, src/preload/index.ts 코드를 실제로 읽고 비교해서:

1. CommandMap/QueryMap/EventMap의 채널 분류가 정확한지 (Command vs Query 구분 오류 없는지)
2. 타입 시그니처가 실제 핸들러 코드의 입출력과 일치하는지
3. IpcBridge의 단일 진입점 구조가 보안적으로 안전한지 (기존 화이트리스트 대비)
4. 마이그레이션 시 breaking change 위험 요소
5. 플러그인 인터페이스의 네임스페이스 격리가 충분한지
6. 누락된 채널이나 엣지 케이스

결과를 한국어로 docs/reports/cqrs-design-review.md에 작성해줘.
