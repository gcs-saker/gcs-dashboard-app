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

