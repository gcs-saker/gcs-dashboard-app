# M1-16 Frontend Bundle Lazy Loading

## 목적

M1-16은 대시보드 초기 진입 시 필요하지 않은 미디어/3D 런타임을 초기 번들에서 분리하기 위한 작업이다. 스트리밍 UI는 WebRTC 우선, HLS fallback 구조를 유지하되 `hls.js`를 항상 로드하지 않고, 지자계 3D 뷰는 해당 화면이 렌더링될 때 로드되도록 분리한다.

## 변경 내용

- `useHlsFallbackPlayback`에서 정적 `hls.js` import를 제거하고 동적 import로 전환했다.
- 네이티브 HLS를 지원하는 브라우저에서는 `hls.js`를 로드하지 않고 `video` 태그 재생 경로를 먼저 사용한다.
- 기존 `HLSPlayer.jsx`도 동일하게 네이티브 HLS 우선, `hls.js` 지연 로딩 구조로 변경했다.
- `Gyroscope`를 `LazyGyroscope`로 감싸서 3D 런타임을 Suspense 경계 뒤에서 로드하도록 했다.
- Vite manual chunk 이름을 `lazy-media`, `lazy-3d`로 명확히 바꾸고, 실제 소스에서 사용하지 않는 `@react-three/drei`를 3D 청크 고정 목록에서 제외했다.

## 번들 결과

이전 M1-15 빌드에서 초기 앱 청크는 약 124 kB까지 줄었지만, `vendor-media`와 `vendor-3d`가 큰 vendor chunk로 남아 있었다. M1-16 변경 후 빌드 결과는 다음과 같다.

| 청크 | 크기 | 의미 |
| --- | ---: | --- |
| `index` | 약 302 kB | 초기 앱 진입 청크 |
| `lazy-media` | 약 523 kB | HLS fallback이 실제로 필요할 때 로드되는 `hls.js` 청크 |
| `lazy-3d` | 약 891 kB | 지자계 3D 뷰가 렌더링될 때 로드되는 Three/react-three 청크 |
| `vendor-charts` | 약 397 kB | 차트 계열 vendor 청크 |

## 대형 청크 경고 판단

Vite의 500 kB 경고는 아직 남아 있다. 다만 남아 있는 큰 청크는 초기 앱 경로가 아니라 기능별 lazy 청크다. `hls.js`와 Three 계열 런타임은 자체 크기가 크기 때문에, 현재 구조에서 경고를 단순히 숨기기보다 다음 기준으로 관리한다.

- 초기 앱 청크가 2 MB급으로 되돌아가지 않는지 계속 확인한다.
- `lazy-media`는 HLS fallback 또는 legacy HLS player가 실제로 필요할 때만 로드되도록 유지한다.
- `lazy-3d`는 지자계 3D 패널이 실제로 렌더링될 때만 로드되도록 유지한다.
- 추후 sample stream, mock stream, 실제 영상 테스트가 들어오면 플레이어 화면 단위 lazy route 또는 viewport 기반 로딩으로 더 세밀하게 나눌 수 있다.

## 테스트 범위

- `HLSFallbackPlayer` 테스트는 동적 `hls.js` import 이후의 비동기 초기화, native HLS 경로, unsupported 경로, playback error, cleanup을 검증한다.
- `LazyGyroscope` 테스트는 Suspense fallback과 lazy 로드 완료 후 3D 컴포넌트 props 전달을 검증한다.

## 남은 주의점

- `LazyGyroscope` fallback은 현재 화면 깨짐 방지용 최소 UI다. 실제 운영 UI에서는 기존 대시보드 톤에 맞춘 skeleton 또는 계측 placeholder로 다듬는 것이 좋다.
- `lazy-media`, `lazy-3d`의 크기 자체는 라이브러리 교체나 기능 단위 추가 분리 없이는 크게 줄이기 어렵다.
- 다음 스트리밍 UI 작업에서는 mock stream과 실제 sample stream 기반 통합 검증을 추가해야 한다.
