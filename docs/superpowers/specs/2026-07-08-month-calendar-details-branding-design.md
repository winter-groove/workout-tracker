# 월 달력·기록 디테일·명품보쌈 브랜딩 설계

날짜: 2026-07-08

## 목적

1. 홈의 "이번 주" 스트립을 **월 전체 달력**으로 교체하고, 날짜를 탭하면 그날의 운동 세션을 바로 볼 수 있게
2. 홈의 **최근 운동** 항목을 탭하면 세션 디테일(요약 화면)로 이동
3. 기록 탭에서 세션을 펼치면 세트 목록과 **증감·PR 요약이 한 번에** 표시
4. 앱 아이콘에 "명(좌상)/보(우상)/품(좌하)/쌈(우하)" 글자 추가, 앱 이름을 **명품보쌈**으로

## 요구사항 (사용자 확정)

- 달력: 이전/다음 달 이동 가능 (`◀ 2026년 7월 ▶` 헤더), 기본은 현재 달
- 날짜 클릭 → 달력 아래 그날 세션 목록, 세션/최근 운동 클릭 → 기존 요약 화면(`/summary/:id`)으로 이동
- 기록 탭 상세에 요약 인라인 통합, "요약 보기" 버튼 삭제
- 아이콘: 기존 파란 배경+흰 바벨 유지, 네 모서리에 흰 글자

## 구성 요소

### 1. `src/db/progress.ts` — `summarizeSession` 헬퍼 추가

```ts
summarizeSession(session: Session): Promise<EntryProgress[]>
  // session.entries.map((e) => summarizeEntry(e.exerciseId, e.sets, session.startedAt)) 의 Promise.all
```

SummaryScreen의 인라인 로직을 이 헬퍼로 교체하고, HistoryScreen(3번)도 같은 헬퍼를 사용 — 판정 로직 단일화.

### 2. 홈 월 달력 — `HomeScreen.tsx` 수정 + `src/components/MonthCalendar.tsx` (신규)

달력은 별도 컴포넌트로 분리 (HomeScreen 비대화 방지):

```tsx
<MonthCalendar
  workoutDays: Set<string>        // 'YYYY-M-D' 키 (기존 홈의 workoutDays 형식 그대로)
  selectedDate: Date | null
  onSelectDate: (d: Date) => void
/>
```

- 내부 state로 표시 중인 연/월 (`viewYear`, `viewMonth`), 기본 오늘 기준. `◀`/`▶` 버튼으로 ±1개월 (연도 경계 처리)
- 헤더: `2026년 7월`, 요일 헤더 월~일 (기존 DAY_LABELS 재활용)
- 그리드 생성은 export된 순수 함수 사용:

```ts
export function monthGrid(year: number, month: number): (Date | null)[][]
  // month는 0-베이스. 월요일 시작 주 단위 2차원 배열, 앞뒤 빈 칸은 null
```

- 각 날짜 셀: 운동한 날 ✓ (기존 `.dot.on` 스타일), 오늘 하이라이트(`.dot.today`), 탭하면 `onSelectDate`
- 선택된 날짜는 시각적으로 표시 (예: 테두리/배경)

**HomeScreen 측:**

- "이번 주" 카드를 `달력` 카드로 교체. `weekDates` 함수와 주 스트립 렌더링 삭제 (workoutDays 계산은 유지)
- `selectedDate` state (기본 null — 아무 날도 선택 안 됨). 날짜 선택 시 카드 하단에 그날 세션 목록:
  - 각 행 `루틴명(없으면 '오늘 운동') · N개 운동`, 탭 → `navigate('/summary/' + s.id)`
  - 해당 날짜에 세션 없으면 "이 날은 운동 기록이 없어요"
- 그날 세션 필터: 기존 `sameDay` 헬퍼 재활용 (`new Date(s.startedAt)`과 선택 날짜 비교)

### 3. 홈 최근 운동 클릭 — `HomeScreen.tsx` 수정

최근 운동 각 행을 탭 가능하게 (`onClick={() => navigate('/summary/' + s.id)}`, `cursor: pointer`).

### 4. 기록 탭 요약 통합 — `HistoryScreen.tsx` 수정

- 세션 펼침(openId) 시 `summarizeSession(session)`을 로드 (openId 의존 `useLiveQuery` 또는 useEffect+state)
- 펼친 상세의 각 운동 행 아래에 요약 줄 추가 — 요약 화면과 동일 포맷:
  - `볼륨 {volume}kg {fmtVolumeDelta} · 최고 {maxWeight}kg {fmtWeightDelta}` + PR이면 `🏆 PR`, 첫 기록이면 `볼륨 Xkg · 최고 Ykg · 첫 기록`
- **"요약 보기" 버튼 삭제** ("기록 삭제" 버튼만 남음)
- 로딩 중(요약 계산 전)에는 세트 목록만 먼저 표시

### 5. 브랜딩 — `scripts/generate-icons.mjs`, `vite.config.ts`, `index.html` 수정

- SVG에 `<text>` 4개 추가: 좌상단 `명`, 우상단 `보`, 좌하단 `품`, 우하단 `쌈`
  - `fill="#fff"`, `font-weight="bold"`, `font-size` 약 96, `font-family="'Apple SD Gothic Neo', 'AppleGothic', sans-serif"`
  - 위치: 모서리 여백 ~40px, `text-anchor` start(좌)/end(우). 바벨(y 168~344)과 겹치지 않게 상단 글자는 y≈128, 하단 글자는 y≈472 기준선
- `npm run icons` 실행해 `public/icons/icon-192.png`, `icon-512.png` 재생성 (산출물 커밋)
- `vite.config.ts` manifest: `name: '명품보쌈'`, `short_name: '명품보쌈'`
- `index.html`의 `<title>` → `명품보쌈`
- 재설치 안내: 기존 설치된 PWA는 이름/아이콘이 자동 갱신되지 않을 수 있음 → 배포 후 홈 화면에서 제거 후 다시 추가

## 에러/엣지 케이스

- 달력에서 미래 날짜 탭: 세션이 없으므로 "기록이 없어요" 표시 (별도 차단 없음)
- 연도 경계: 1월에서 ◀ → 작년 12월, 12월에서 ▶ → 내년 1월
- 달 이동 시 선택 날짜는 유지하되, 표시 목록은 selectedDate 기준이므로 그대로 동작 (다른 달의 날짜를 선택한 상태여도 무방)
- 하루 2세션: 목록에 둘 다 표시
- 기록 탭 요약: 삭제된 운동 entry도 계산은 정상 (기존 '삭제된 운동' 표기 유지)
- 아이콘 로컬 폰트 의존: 생성은 개발 머신(macOS)에서 1회 실행 후 PNG를 커밋하므로 런타임 폰트 의존 없음

## 테스트

- `monthGrid` 단위 테스트: 주 수/시작 요일/앞뒤 null 패딩, 연도 경계 데이터
- `MonthCalendar` 컴포넌트: 헤더 표시, ◀▶ 이동(연도 경계 포함), 날짜 탭 → onSelectDate 호출, ✓ 표시
- `HomeScreen`: 날짜 선택 → 그날 세션 목록 표시·없으면 빈 문구, 세션 탭 → `/summary/:id` 이동, 최근 운동 탭 → `/summary/:id` 이동
- `HistoryScreen`: 펼침 시 운동별 요약 줄 표시(증감·PR·첫 기록), "요약 보기" 버튼 부재 확인
- `SummaryScreen`: `summarizeSession`으로 교체 후 기존 3개 테스트 그대로 통과
- 브랜딩: `npm run icons` 실행 결과 파일 존재, `npm run build` 통과 (매니페스트 반영)

## 범위 제외 (YAGNI)

- 달력 스와이프 제스처, 월간 통계(운동 횟수 합계 등)
- 최근 운동/달력 목록의 인라인 펼침
- 아이콘 다크모드 변형, 스플래시 스크린
