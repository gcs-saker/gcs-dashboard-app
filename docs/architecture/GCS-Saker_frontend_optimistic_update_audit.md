# GCS-Saker Frontend Optimistic Update Audit

## 목적

프론트엔드에서 서버 성공을 미리 가정하는 optimistic update가 있는지 확인한다.
스트리밍, 인증, 시간 동기화처럼 운영 상태를 다루는 화면은 실패를 성공처럼 보이면 안 된다.

## 판정 기준

- 서버 mutation 전용 optimistic update: 서버 응답 전 성공 상태를 UI/cache에 먼저 반영하고 실패 시 rollback하는 패턴이다.
- 허용되는 pending state: 요청 중, 송출 준비 중, 마이크 권한 요청 중처럼 실제 진행 상태를 표시한다.
- 허용되는 local-first state: 대시보드 탭, 레이아웃, CCTV 품질처럼 개인 브라우저 설정을 먼저 반영하고 IndexedDB/sessionStorage에 저장한다.
- 위험 후보: 서버가 확인하지 않은 값을 온라인, 저장 완료, 연결 완료처럼 표현하는 상태다.

## 확인 결과

| 영역 | 파일 | 결과 | 근거 |
| --- | --- | --- | --- |
| 인증 로그인/회원가입 | `gcs-dashboard/src/features/auth/LoginPage.tsx`, `SignupPage.tsx`, `AuthProvider.tsx` | optimistic update 없음 | 제출 중 상태만 먼저 표시하고, token/user 상태는 서버 응답 이후 반영한다. |
| 인증 API | `gcs-dashboard/src/features/auth/authApi.ts` | optimistic update 없음 | `loginRequest`, `signupRequest`, `refreshSessionRequest`는 실패 시 예외를 던지고 성공 응답 이후만 저장한다. |
| 시간 동기화 | `gcs-dashboard/src/features/dashboard/hooks/useTimeSyncStatus.ts` | optimistic update 없음 | `saving`은 요청 중 표시이고, `saved` 상태는 `updateTimeSyncConfig` 응답 이후만 반영한다. |
| 스트림 registry polling | `gcs-dashboard/src/features/dashboard/hooks/useDashboardStreams.ts` | optimistic update 없음 | backend registry/telemetry 응답을 병합한다. 실패 시 online stream을 degraded로 낮춘다. |
| 직접 스트림 주소 연결 | `gcs-dashboard/src/features/dashboard/streamDevices.ts` | 위험 후보 수정됨 | 서버 검증 전 `online`으로 보이던 manual stream을 `degraded`로 낮췄다. |
| 이벤트 로그 | `gcs-dashboard/src/features/dashboard/hooks/useOperationalEvents.ts` | optimistic update 없음 | SSE/polling으로 받은 이벤트만 메모리 히스토리에 병합한다. mutation이 없다. |
| 대시보드 개인 설정 | `gcs-dashboard/src/features/dashboard/hooks/useDashboardUserPreferences.ts`, `gcs-dashboard/src/features/dashboard/userPreferencesStore.ts`, `gcs-dashboard/src/features/dashboard/streamPreferences.ts` | local-first state | layout/tab/CCTV 품질과 stream alias는 사용자 브라우저 설정이다. 서버 성공으로 표시하지 않는다. |
| Talkback 송신 | `gcs-dashboard/src/features/streaming/hooks/useWhipAudioPublisher.ts` | optimistic success 없음 | 대상은 `pending`으로 시작하고 WHIP 결과 후 `active/error`로 바뀐다. |
| 웹캠 송출 | `gcs-dashboard/src/features/streaming/components/LocalWebcamPublisher.tsx` | optimistic success 없음 | 단계별 pending/active/error를 표시하며, WebRTC disconnect 시 재연결 상태로 내려간다. |

## 유지해야 할 규칙

- TanStack Query mutation을 도입할 때 `onMutate`, `setQueryData`로 성공 상태를 먼저 쓰려면 rollback과 실패 알림이 반드시 있어야 한다.
- stream online/offline은 registry, playback snapshot, MediaMTX signaling 결과 중 하나 이상의 관측 근거가 있어야 한다.
- IndexedDB/sessionStorage 개인 설정은 local-first로 허용하지만, 운영 상태나 서버 상태를 저장 성공처럼 표현하면 안 된다.
- 인증/인가, stream publish/playback, time sync save는 서버 응답 전 성공 상태를 표시하지 않는다.

## 남은 주의점

- IndexedDB 저장 실패는 현재 조용히 무시된다. 개인 설정이므로 운영 상태 오판은 없지만, 저장 실패 toast나 telemetry는 추후 추가할 수 있다.
- 직접 주소 연결은 `degraded`로 낮췄지만, 실제 WHEP 실패가 났을 때 슬롯 상태를 playback error와 더 강하게 연동하면 UX가 더 명확해진다.
