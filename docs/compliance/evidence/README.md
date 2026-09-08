# Compliance evidence retention

Git에는 요구사항과 연결된 evidence manifest, 해시, 요약 및 비민감 소형 결과만 저장한다.
대용량 원시 시험결과, packet capture, 음성, 영상, 통제 대상 자료는 접근통제된 CI artifact 또는
승인된 외부 증거 저장소에 보관한다. manifest에는 저장 위치, SHA-256, 생성 도구·버전, 시험환경,
판정자, 생성시각과 40자리 source commit을 기록한다.

PASS 판정은 manifest가 실제 요구사항, 시험과 immutable source commit에 연결된 경우만 허용한다.
외부 artifact가 만료·손실되거나 해시가 일치하지 않으면 해당 증거는 유효하지 않다.

