# Compliance evidence retention

Git에는 요구사항과 연결된 evidence manifest, 해시, 요약 및 비민감 소형 결과만 저장한다.
대용량 원시 시험결과, packet capture, 음성, 영상, 통제 대상 자료는 접근통제된 CI artifact 또는
승인된 외부 증거 저장소에 보관한다. manifest에는 저장 위치, SHA-256, 생성 도구·버전, 시험환경,
판정자, 생성시각과 40자리 source commit을 기록한다.

PASS 판정은 manifest가 실제 요구사항, 시험과 immutable source commit에 연결된 경우만 허용한다.
외부 artifact가 만료·손실되거나 해시가 일치하지 않으면 해당 증거는 유효하지 않다.

## Software quality measurements

통제된 카탈로그만 검증하고 시험 수행을 주장하지 않는 명령은 다음과 같다.

```bash
python scripts/reports/software_quality_measurement.py --check
```

auth-policy 시험이 JUnit XML을 생성한 뒤 하나 이상의 `--junit` 인수로 기능 완전성과 권한 거부
보고서를 생성한다. runtime 또는 CI 검증은 `gcs-saker.verification-results.v1` JSON을
`--evidence`로 함께 제공하며 현재 source commit이 정확히 일치해야 한다. 모든 시험이 성공해도
운용 프로파일과 임계값이 승인 전이면 판정은
`BLOCKED`다. 기존 결과를 덮어쓰지 않고 후보 릴리스별 불변 증거 디렉터리에 기록한다.

## Server-01 recovery qualification

복구 프로파일과 실행기 자체의 정적 검증은 운영 서비스에 영향을 주지 않는다.

```bash
python scripts/ops/recovery_qualification.py --check
```

실제 장애 주입은 승인된 점검 창, 현재 source commit과 일치하는 검증 백업, 비공개 절대경로
증거 디렉터리가 모두 있을 때 Server-01에서 시나리오 하나씩 수행한다. 실행기는 컨테이너를
삭제하거나 재생성하지 않고 중지·시작만 하며, 장애 전·중·후 공개 probe와 동일 컨테이너 ID를
기록한다. 임계값과 독립 판정이 승인되기 전에는 기술 결과가 성공해도 최종 판정은 `BLOCKED`다.
세부 명령과 중단 기준은 `docs/operations/GCS-Saker_Server01_Recovery_Qualification.md`를 따른다.

## Server-01 performance and stability qualification

성능 프로파일 정적 검증은 운영 부하를 발생시키지 않는다.

```bash
python scripts/reports/performance_stability_qualification.py --check
```

실제 측정은 승인된 시험 창에서 기존 M7 benchmark와 streaming soak 수집기를 사용한다. 원시
지연 샘플, 오류, backpressure, queue depth, 연결 복구, CPU·메모리, 시간 동기화와 source commit을
정규화한 뒤 새 절대경로에만 판정 결과를 생성한다. 세부 절차는
`docs/operations/GCS-Saker_Server01_Performance_Qualification.md`를 따른다.

## Architecture change-impact qualification

두 불변 커밋 사이의 변경 파일을 생산 소유 경계별로 분류하고 교차 경계 변경을 검토 대상으로
고정한다. 정적 카탈로그 검증은 다음과 같다.

```bash
python scripts/reports/change_impact_qualification.py --check
```

실제 보고서는 조상 관계가 확인된 base/candidate commit, 기대 소유자, 통제 change ID와 선택적
검토 처분을 입력받아 새 절대경로에만 생성한다. 상세 절차는
`docs/operations/GCS-Saker_Change_Impact_Qualification.md`를 따른다.

## MIL-STD-882E hazard closure qualification

위험, SwCI, 상위 요구사항 추적, 통제 증거와 잔여위험 승인을 source commit 기준으로 대조한다.

```bash
python scripts/reports/hazard_closure_qualification.py --check
```

실제 보고서는 명시적인 기준일과 비공개 증거 manifest를 받아 새 절대경로에만 생성한다. 현재
10개 위험은 상위 요구사항에 모두 연결됐지만 아직 모두 열려 있으므로 폐루프 0%, `BLOCKED`가 정상이다. 상세 절차는
`docs/operations/GCS-Saker_Hazard_Closure_Qualification.md`를 따른다.

