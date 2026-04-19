docs/planning/10-cqrs-architecture.md (v2)를 읽고 이전 리뷰(docs/reports/cqrs-design-review.md)에서 지적한 문제들이 해결되었는지 검증해줘.

실제 코드 파일을 반드시 읽고 대조:
- src/main/ipc/handlers/*.ts (모든 파일)
- src/main/ipc/validators.ts
- src/shared/types.ts
- src/preload/index.ts
- src/main/services/settings.ts (settings.save/reset 반환값)
- src/main/services/updater.ts (이벤트 발행)

검증 항목:
1. 이전 리뷰의 High 이슈 5개가 모두 해결되었는지
2. settings.save/reset 반환 타입이 실제와 일치하는지
3. group.markReviewed의 decision 타입이 실제와 일치하는지
4. dialog.openDirectory의 Command 재분류가 적절한지
5. IpcBridge 이중 검증 구조가 보안적으로 충분한지
6. 다중 인자 → 단일 payload 전환 전략의 breaking change 위험
7. 점진적 마이그레이션 전략의 실현 가능성
8. 새로 발견된 문제가 있다면 지적

결과를 한국어로 docs/reports/cqrs-design-review-v2.md에 작성해줘.
