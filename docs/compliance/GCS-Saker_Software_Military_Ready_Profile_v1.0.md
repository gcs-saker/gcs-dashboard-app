# GCS-Saker Software Military-Ready Profile 1.0

## 목적

이 프로파일은 하드웨어가 확정되지 않은 현재 단계에서 서버, 브라우저, 통신 경계, 음성,
지도, waypoint, AI overlay와 개발·배포 절차에 적용할 군용 적합성 기준선을 정의한다.
프로파일은 특정 발주서의 인증을 대신하지 않으며, 선택 조항별 객관적인 적합성 증거를
축적하기 위한 자체 기준이다.

## 현재 적용 범위

소프트웨어에 직접 적용하는 기준은 MIL-STD-1472H, MIL-STD-2525E Change 1,
MIL-STD-882E Change 1, NIST SSDF, DISA Application Security and Development STIG,
NIST RMF와 ISO/IEC/IEEE 12207이다. 물리 시편이 필요한 MIL-STD-810H 및
MIL-STD-461G는 `PLANNED_HARDWARE`로 예약한다. 특정 통신 장비가 정해지지 않은
MIL-STD-188 계열은 현재 `NOT_APPLICABLE`이며, 정확한 세부 sheet를 선택할 때만
재평가한다.

아키텍처와 제품 품질 계층에는 ISO/IEC/IEEE 42010:2022, ISO/IEC 25010:2023,
ISO/IEC 25023:2016 및 ISO/IEC 25040:2024를 적용한다. 42010은 아키텍처 설명의
완전성과 일관성을, 25010은 제품 품질 요구사항 분류를, 25023은 반복 가능한 측정을,
25040은 평가 계획과 판정 절차를 소유한다. 이 기준들은 MIL 인증을 부여하지 않으며,
선택한 MIL 요구사항을 포함한 전체 qualification 증거의 구조와 측정 품질을 강화한다.

## 주장 정책

- `certified`: 승인된 외부 기관이 명시된 revision과 범위에 인증서를 발급한 경우만 사용한다.
- `conformant`: 선택한 모든 mandatory requirement에 PASS 증거와 독립 검토가 있을 때만 사용한다.
- `aligned`: 프로세스 또는 설계 원칙을 적용했지만 qualification finding이 남을 수 있음을 뜻한다.
- `assessed`: 날짜, 범위, 방법, 증거와 open finding을 포함한 평가가 있음을 뜻한다.
- `ready`: 시험 계획과 선행조건은 있으나 qualification이 완료되지 않았음을 뜻한다.

현재 전체 제품에 `MIL certified`나 포괄적인 `MIL compliant` 표현을 사용하지 않는다.

## 상태와 증거

공식 상태는 `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, `NOT_APPLICABLE`,
`PLANNED_HARDWARE`이다. 기능이 구현됐더라도 요구된 분석·시험·검토 증거가 없으면
PASS가 아니다. 모든 증거는 시험 환경, 도구 버전, 원시 결과, 판정자와 immutable source
commit을 포함해야 한다.

## 표준 유지관리

기준은 90일마다, 표준 revision 변경 시, trust boundary 또는 안전 중요 기능 변경 시,
외부 평가 준비 시 재검토한다. 변경된 조항은 영향받는 요구사항 ID와 증거를 다시 평가하며,
영향 분석이 끝날 때까지 기존 PASS를 자동 승계하지 않는다.

Machine-readable 적용성 매트릭스는
[`software-military-ready-profile-v1.yml`](software-military-ready-profile-v1.yml)에 있다.

