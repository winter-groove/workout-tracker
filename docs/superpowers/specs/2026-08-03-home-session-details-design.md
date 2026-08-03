# 홈 달력 세트 표 펼침 + SessionDetails 공용화 설계

날짜: 2026-08-03

## 목적

홈 달력의 날짜별 세션 목록에서도 기록 탭과 동일한 세트 표(운동명·세트·무게·요약)를 인라인으로 볼 수 있게. 중복 방지를 위해 펼침 상세를 공용 컴포넌트로 추출.

## 요구사항 (사용자 확정)

- 홈 달력 세션 행 탭 → 아래로 펼쳐지며 세트·무게 표 (기록 탭과 동일 형태)
- 요약 화면 이동은 행 우측 "요약 ›" 버튼으로 분리

## 구성 요소

### 1. `src/components/SessionDetails.tsx` (신규 공용)

- props: `{ session: Session; exMap: Map<string, Exercise> }`
- 렌더: 운동별 [이름(굵게)+🏆 → 세트 표(set-view, 단위 반영) → 증감·PR 요약 줄] — 기록 탭 현재 펼침 상세와 동일 마크업 이동
- 요약은 컴포넌트가 스스로 로드(`summarizeSession`, `useEffect([session.id])`, cancelled 클린업). 세션 전환 시 컴포넌트가 언마운트/재마운트되므로 **요약 잔상·race가 구조적으로 불가능** (기록 탭의 기존 id-가드 상태를 대체·단순화)
- 로드 전에는 세트 표만 표시 (요약 줄 생략)

### 2. `HistoryScreen.tsx` 리팩터

- 펼침 상세를 `<SessionDetails key={s.id} session={s} exMap={exMap} />`로 교체, `openSummary` state/effect 제거 (미사용 import 정리 — 단 `fmtVolumeDelta`/`fmtWeightDelta`/`kgToDisplay`는 "운동별로 보기"에서 계속 사용)
- **기존 테스트 전부(요약 표시·race·세트 표·lb) 무변경 통과** — race 테스트는 deferred summarizeSession mock을 쓰므로 언마운트 기반 구조에서도 성립해야 함

### 3. `HomeScreen.tsx` — 달력 세션 목록 펼침

- state `openSessionId`(기본 ''), 날짜 변경 시 리셋
- 행: 탭 → 펼침 토글(끝에 ▾/▴), 우측 `요약 ›` 소형 버튼(stopPropagation → `/summary/:id`)
- 펼침 시 `<SessionDetails key={s.id} .../>`

## 테스트 영향 (기존 갱신 필요)

- Home '달력 날짜를 누르면...' — 행 탭이 이동→펼침으로 바뀌므로: 행 텍스트 매칭을 정규식으로(끝 ▾ 추가), 이동 단언은 `요약 ›` 버튼 클릭으로 변경
- Home '이름 없는 세션은 달력 목록에서...' — 정확 문자열 → 정규식
- 신규: 행 탭 → 세트 표(`무게(kg)`, 무게 값) 표시, 다른 세션 탭 시 전환, `요약 ›` 이동

## 에러/엣지 케이스

- 하루 2세션: 한 번에 하나만 펼침 (openSessionId 단일)
- 펼친 채 날짜 변경: 리셋되어 접힘
- 삭제된 운동·빈 요약(계산 전)·lb 모드: SessionDetails가 기록 탭과 동일 처리

## 범위 제외 (YAGNI)

- 요약 화면에 세트 표 추가, 애니메이션
