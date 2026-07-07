# 운동기록 (Workout Tracker)

점진적 과부하를 위한 개인용 운동 기록 PWA. 모든 데이터는 폰 로컬(IndexedDB)에만 저장됩니다.

## 개발

```bash
npm install
npm run fetch-images   # 최초 1회: 운동 이미지 다운로드 (public/exercises/)
npm run icons          # 최초 1회: PWA 아이콘 생성
npm run dev            # 개발 서버
npm test               # 테스트
```

## 배포 (GitHub Pages)

```bash
# GitHub에 repo 생성 후 remote 연결이 되어 있다면:
npm run deploy         # dist/를 gh-pages 브랜치로 푸시
```

GitHub repo → Settings → Pages → Branch를 `gh-pages`로 설정.
배포 후 폰 브라우저로 접속 → 공유 → "홈 화면에 추가"로 설치.

## 데이터 백업

관리 탭 → 데이터 백업 → 내보내기로 JSON 파일 저장. 폰을 바꾸면 가져오기로 복원.
