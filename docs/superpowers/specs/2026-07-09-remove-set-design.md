# 세트 삭제 버튼 설계

날짜: 2026-07-09

## 목적

세션 화면에서 실수로 "＋ 세트 추가"를 눌렀을 때 되돌릴 방법이 없음 — 마지막 세트를 삭제하는 버튼을 추가한다.

## 요구사항 (사용자 확정)

- "＋ 세트 추가" 옆에 "− 세트 삭제" 버튼 (한 줄에 나란히), 마지막 세트 삭제
- 완료(✓)된 세트가 마지막이면 `window.confirm('완료한 세트예요. 삭제할까요?')` 후 진행 (미완료는 즉시 삭제)
- 세트가 1개뿐이면 버튼 비활성화(disabled) — 0개 방지

## 구성 요소

### `src/screens/SessionScreen.tsx` 수정

- `removeSet()` 함수: 현재 entry의 마지막 세트를 제거하고 기존 `update()`로 즉시 저장. 마지막 세트에 `completedAt`이 있으면 confirm을 먼저 거침
- 기존 `＋ 세트 추가` 버튼을 `btn-row`로 감싸고 옆에 `− 세트 삭제` 추가:
  - `<button className="btn btn-ghost" disabled={entry.sets.length <= 1} onClick={removeSet}>− 세트 삭제</button>`
- 다른 동작(RestTimer, 실시간 pill 등)은 변경 없음 — 완료 세트 삭제 시 pill 볼륨은 기존 계산(doneSets)이 자동 갱신

## 에러/엣지 케이스

- 세트 1개: disabled (기존 '이전' 버튼과 같은 패턴)
- 완료 세트 confirm 취소: 아무 변화 없음
- 삭제는 마지막 세트만 — 중간 세트 제거는 범위 외 (미완료 세트는 완료 시 자동 정리되는 기존 동작 유지)

## 테스트 (`SessionScreen.test.tsx`)

- 미완료 마지막 세트는 confirm 없이 즉시 삭제되고 저장됨
- 완료된 마지막 세트는 confirm 수락 시 삭제, 취소 시 유지
- 세트 1개면 버튼 disabled

## 범위 제외 (YAGNI)

- 중간 세트 삭제, 스와이프 삭제, 운동(entry) 삭제
