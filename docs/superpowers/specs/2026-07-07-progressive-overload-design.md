# 점진적 과부하 확인 기능 설계

날짜: 2026-07-07

## 목적

운동 기록을 이전과 눈으로 비교하는 대신, 앱이 "지난번 대비 과부하가 일어났는지"를 계산해서 보여준다.

## 요구사항 (사용자 확정)

- **표시 위치**: ① 운동 중 실시간, ② 완료 후 요약 화면, ③ 기록 탭 운동별 변화 보기 — 전부
- **판정 지표**: 총 볼륨(Σ 무게×횟수)과 최고 무게 두 가지를 나란히 표시
- **비교 대상**: 직전 기록(그 운동을 마지막으로 한 세션) 대비. 역대 최고 무게를 넘으면 🏆 PR 뱃지 추가
- **완료 흐름**: "운동 완료" 후 홈 대신 요약 화면으로 이동, 확인 버튼으로 홈 복귀

## 아키텍처: 순수 계산 (스키마 변경 없음)

세션 데이터(`Session > entries > sets{weight, reps, completedAt}`)에 필요한 정보가 전부 있으므로, DB에 판정 결과를 저장하지 않고 화면을 열 때마다 계산한다.

- DB 마이그레이션 없음, 백업 JSON 포맷 그대로
- 과거 기록을 삭제/수정해도 항상 현재 데이터 기준으로 정확
- 개인 기록 규모(수백 세션)에서 재계산 비용은 무시 가능

## 구성 요소

### 1. `src/db/progress.ts` — 계산 모듈 (신규)

순수 함수 + 조회 함수:

```ts
// 순수 함수 (동기, 테스트 대상)
volume(sets: SetRecord[]): number          // Σ weight×reps
maxWeight(sets: SetRecord[]): number       // 최고 무게, 빈 배열이면 0

// 조회 함수 (비동기, 기존 sessions.ts 패턴을 따름)
getPreviousRecord(exerciseId, before: number): Promise<SetRecord[] | undefined>
  // startedAt < before 인 완료 세션 중 가장 최근의 해당 운동 완료 세트
  // (기존 getLastRecord를 일반화하거나 재사용)
getPRWeight(exerciseId, before: number): Promise<number>
  // startedAt < before 인 모든 완료 세션에서의 최고 무게, 없으면 0

// 종합 판정
summarizeEntry(exerciseId, sets, sessionStartedAt): Promise<EntryProgress>

interface EntryProgress {
  volume: number;
  maxWeight: number;
  prevVolume?: number;      // 직전 기록 없으면 undefined → "첫 기록"
  prevMaxWeight?: number;
  isPR: boolean;            // maxWeight > 이전 PR (이전 기록이 있을 때만 true 가능)
}
```

판정 규칙:

- 화살표: 현재 > 이전 → 🔺, 현재 < 이전 → 🔻, 같으면 ➖ (원시 값으로 비교)
- 볼륨 증감은 퍼센트로 표시: `Math.round((cur - prev) / prev × 100)`. 이전 볼륨이 0이면 퍼센트 생략하고 화살표만
- 최고 무게 증감은 kg 절대값으로 표시 (예: `+2.5kg`)
- 직전 기록이 없으면 비교 없이 **"첫 기록"** 표시, PR 뱃지도 없음 (기준이 없으므로)
- PR 판정은 무게만 기준 (횟수 무관), 이전 PR을 **초과**할 때만

### 2. 세션 화면 (실시간) — `SessionScreen.tsx` 수정

- 기존 `🔥 지난번 …` pill 아래(또는 옆)에 진행 상황 표시. **완료된 세트만** 집계
- 지난 볼륨을 넘기 전: `볼륨 720 / 지난 1080kg`
- 넘은 후: `볼륨 1150kg 🔺 +6%`
- 완료한 세트의 무게가 이전 PR을 넘으면 `🏆 PR!` 뱃지 표시
- 데이터 로드: 기존 `getLastRecord` effect를 확장해 PR 무게도 함께 로드 (운동 전환 시마다)
- 직전 기록이 없는 운동은 이 표시 자체를 생략 (기존 pill도 안 뜨는 것과 동일)

### 3. 완료 요약 화면 — `SummaryScreen.tsx` (신규), 라우트 `/summary/:sessionId`

- `finish()`에서 `finishSession` 후 `navigate('/summary/' + session.id, { replace: true })`
- 세션을 id로 로드해 운동별로 `summarizeEntry` 실행 (비교 기준: 해당 세션 `startedAt` 이전 기록 — 자기 자신 제외가 자동으로 됨)
- 운동별 행: 운동 이름 + `볼륨 1150kg 🔺+6% · 최고 60kg ➖` + 해당 시 `🏆 PR`
- 상단에 세션 이름/날짜/총 운동 수, 하단에 확인 버튼 → 홈으로
- 세션이 없거나 미완료면 홈으로 리다이렉트
- 기록 탭의 세션 상세 펼침에 "요약 보기" 버튼 추가 → 같은 라우트로 이동 (과거 세션 재열람)

### 4. 기록 탭 — `HistoryScreen.tsx` 수정

- "운동별로 보기"의 각 행에 볼륨 + 직전(더 오래된) 회차 대비 화살표/퍼센트, PR 세션엔 🏆
- 목록이 이미 최신순이므로 각 행은 바로 아래 행과 비교하면 됨 — 추가 쿼리 없이 이미 로드된 `history` 배열로 계산
- 가장 오래된 행은 "첫 기록"
- PR 여부: 위에서부터가 아니라 시간순으로 "그 시점까지의 최고 무게를 초과했는가"로 판정 (배열 한 번 순회로 계산)

## 에러/엣지 케이스

- 이전 볼륨 0 (예: 맨몸 운동을 무게 0으로 기록): 퍼센트 나눗셈 생략, 화살표만
- 무게 0 운동만 있는 경우 PR 뱃지 없음 (0 초과 조건 자동 처리)
- 삭제된 운동(exerciseId가 없는 경우): 기존 화면과 동일하게 '삭제된 운동' 표기, 계산은 정상 동작
- 진행 중 새로고침: 세션 화면은 기존처럼 활성 세션 복원, 요약 화면은 URL 기반이라 새로고침에도 안전

## 테스트

- `progress.test.ts`: `volume`, `maxWeight` 순수 함수 + `summarizeEntry`의 판정 규칙 (증가/감소/동일/첫 기록/이전 볼륨 0/PR 경계값 — 동일 무게는 PR 아님)
- `SummaryScreen.test.tsx`: 요약 행 렌더링(증감 표시, PR 뱃지, 첫 기록), 세션 없을 때 리다이렉트
- 기존 `SessionScreen.test.tsx`에 실시간 표시 케이스 추가
- 기존 테스트 러너(vitest + fake-indexeddb 패턴)를 그대로 따름

## 범위 제외 (YAGNI)

- 그래프/차트 시각화
- 추정 1RM, 세트별 비교, 횟수 PR
- 과부하 실패 시 조언/추천 무게
