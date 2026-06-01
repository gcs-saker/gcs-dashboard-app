# GCS-Saker 시간동기화 운영가이드 v0.1

## 목적

영상, 음성, AI overlay, telemetry, 운영 이벤트는 같은 시간축에서 해석되어야 한다. 공개망은 외부 NTP를 사용할 수 있지만, 폐쇄망은 내부 시간 서버를 직접 지정해야 한다.

## Profile

| Profile | 용도 | 설정 |
| --- | --- | --- |
| `public` | 공개망/복합망 | `TIME_SYNC_MODE=public`, `TIME_SYNC_SOURCE_HOST=pool.ntp.org` |
| `closed_network` | 폐쇄망 | `TIME_SYNC_MODE=closed_network`, `TIME_SYNC_SOURCE_HOST=<내부 NTP IP 또는 도메인>` |
| `manual` | 외부/내부 NTP 모두 사용하지 않는 격리 운용 | `TIME_SYNC_MODE=manual` |

`TIME_SYNC_SOURCE_PORT` 기본값은 `123`이고, `TIME_SYNC_DRIFT_WARN_MS` 기본값은 `1000`이다.

## Time API

auth-policy는 다음 API를 제공한다.

- `GET /ops/time/status`: 서버 기준 시각, monotonic clock 기준값, timezone, 시간 source, drift 경고 기준을 반환한다.
- `POST /ops/time/check`: 즉시 점검 결과를 같은 DTO로 반환한다.
- `PUT /ops/time/config`: operator/admin만 시간 source 설정을 변경한다.

응답의 `serverTime`은 UTC ISO-8601 기준이다. `monotonicMs`는 프로세스 내부 지연 측정용 기준값이며, 서로 다른 장비의 절대 시각 비교에는 사용하지 않는다.

## 폐쇄망 구성 기준

Server-02를 내부 NTP 후보로 둘 경우 Server-02의 기준 시간이 먼저 신뢰 가능해야 한다. GPS time, PTP, 수동 보정 정책은 현장 조건에 따라 후속 검토한다. Server-01과 media node는 Server-02의 IP 또는 도메인을 `TIME_SYNC_SOURCE_HOST`에 넣고, OS 계층에서는 chrony 또는 systemd-timesyncd가 같은 source를 바라보도록 구성한다.

현재 애플리케이션 API는 host clock을 직접 변경하지 않는다. 실제 시간 동기화 적용은 운영 권한이 필요한 OS 설정으로 분리한다.

## Timestamp 기준

- 영상 frame capture time: UTC ISO-8601, 가능하면 publisher 기준 캡처 시각을 함께 보낸다.
- 음성 event time: UTC ISO-8601, stream id와 sequence를 함께 기록한다.
- AI overlay generated time: UTC ISO-8601, 원본 frame timestamp와 inference generated timestamp를 모두 기록한다.
- Telemetry time: UTC ISO-8601, 장비 epoch/sequence가 있으면 함께 저장한다.
- 운영 이벤트 time: auth-policy/server 기준 UTC ISO-8601.

브라우저 UI는 서버 `serverTime`과 브라우저 현재 시각의 차이를 ms 단위로 표시한다. drift가 `TIME_SYNC_DRIFT_WARN_MS`를 넘으면 경고 정책을 추가하는 것이 다음 단계다.
