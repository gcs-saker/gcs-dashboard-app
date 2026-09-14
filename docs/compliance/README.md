# GCS-Saker compliance workspace

이 디렉터리는 제품의 표준 적용 범위와 적합성 증거를 관리한다. 문서가 기능 존재만으로
`certified` 또는 전체 표준 준수를 주장해서는 안 된다. 기준 프로파일은
[`software-military-ready-profile-v1.yml`](software-military-ready-profile-v1.yml)이며,
사람이 검토할 설명은
[`GCS-Saker_Software_Military_Ready_Profile_v1.0.md`](GCS-Saker_Software_Military_Ready_Profile_v1.0.md)에 있다.

ISO/IEC/IEEE 42010 아키텍처 기준선은
[`architecture/iso-42010-architecture-description.yml`](architecture/iso-42010-architecture-description.yml)과
[`architecture/system-architecture-views.yml`](architecture/system-architecture-views.yml)에서 관리한다.
ISO/IEC 25010·25023·25040 품질 평가 기준선은
[`quality/software-quality-evaluation-profile.yml`](quality/software-quality-evaluation-profile.yml)과
[`quality/software-quality-evaluation-plan.yml`](quality/software-quality-evaluation-plan.yml)에서 관리한다.
Server-01 시험 부하와 네트워크 조건은
[`quality/server01-software-operational-profile.yml`](quality/server01-software-operational-profile.yml),
하위 제품 시험 요구사항은
[`requirements/software-product-test-requirements.yml`](requirements/software-product-test-requirements.yml),
권한 거부 전수 항목은
[`security/authorization-denial-matrix.yml`](security/authorization-denial-matrix.yml)에 둔다.

프로파일의 상태는 `PASS`, `FAIL`, `BLOCKED`, `NOT_RUN`, `NOT_APPLICABLE`,
`PLANNED_HARDWARE`만 사용한다. 공인 또는 독립 평가가 완료되지 않은 작업은 구현 여부와
관계없이 `certified`로 표현하지 않는다.

