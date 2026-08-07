#!/usr/bin/env python3
"""
GCS Saker Milestones Auto-Creator

GitHub API를 사용하여 마일스톤을 자동으로 생성합니다.

Usage:
    python create_milestones.py --token YOUR_GITHUB_TOKEN --owner gcs-saker --repo gcs-dashboard-app
"""

import argparse

import requests

# 마일스톤 정의
MILESTONES = [
    {
        "title": "M0. Legacy Freeze & GitHub Setup",
        "description": """**목표:**
기존 Saker 상태를 보존하고, GitHub 작업 관리/브랜치 전략/ruleset을 적용한다.

**작업 항목:**
- legacy branch/tag 생성
- main 보호 ruleset 적용
- GitHub Project 생성
- labels/milestones/issues 생성
- 첫 feature branch 작업 준비 완료

**M1 진입 조건:**
- [ ] legacy branch 및 tag 생성 완료
- [ ] main branch 보호 규칙 적용 완료
- [ ] GitHub Project 1 생성 완료
- [ ] labels, milestones, issues 생성 완료
- [ ] feature branch 작업 환경 검증 완료
""",
        "state": "open",
        "due_on": None,
    },
    {
        "title": "M1. Streaming Core 전환",
        "description": """**목표:**
기존 HLS 중심 Saker를 MediaMTX WebRTC 중심 실시간 스트리밍 구조로 전환한다.

**작업 항목:**
- raw/sample/front stream 생성
- WebRTC/WHEP 재생 성공
- HLS fallback URL 정상
- Backend playback API 구현
- Frontend RealtimePlayer 구현

**M2 진입 조건:**
- [ ] raw/sample/front stream 생성 완료
- [ ] WebRTC 재생 테스트 성공
- [ ] WHEP 재생 테스트 성공
- [ ] HLS fallback URL 동작 확인
- [ ] Backend playback API 구현 및 테스트 완료
- [ ] Frontend RealtimePlayer 구현 및 테스트 완료
""",
        "state": "open",
        "due_on": None,
    },
    {
        "title": "M2. Server Deployment & GCS MVP",
        "description": """**목표:**
자체 서버 2대 구조에 신규 GCS MVP를 배포하고 외부 접속 가능한 상태로 만든다.

**작업 항목:**
- Server-02 staging 배포
- Server-01 production 후보 배포
- HTTPS/WSS 구성
- Nginx reverse proxy 적용
- Docker Compose 운영 구조 확정

**M3 진입 조건:**
- [ ] Server-02 staging 배포 완료
- [ ] Server-01 production 후보 배포 완료
- [ ] HTTPS 인증서 설치 및 테스트 완료
- [ ] WSS 연결 테스트 성공
- [ ] Nginx reverse proxy 설정 완료 및 테스트
- [ ] Docker Compose 운영 구조 문서 작성 완료
""",
        "state": "open",
        "due_on": None,
    },
    {
        "title": "M3. Device, Telemetry & Map Foundation",
        "description": """**목표:**
카메라/드론/로봇/휴대폰/Edge Gateway가 붙을 수 있는 장비 등록, telemetry, 지도 표시 구조를 만든다.

**작업 항목:**
- Device Registry 구현
- Telemetry API/WSS 구현
- 좌표/배터리/자세/속도 데이터 수신
- 지도 위치 표시
- 기본 알림 규칙 구현

**M4 진입 조건:**
- [ ] Device Registry API 구현 완료
- [ ] Device 등록/조회/수정/삭제 테스트 성공
- [ ] Telemetry API 구현 완료
- [ ] Telemetry WSS 연결 테스트 성공
- [ ] 좌표/배터리/자세/속도 데이터 수신 테스트 성공
- [ ] 지도 위치 표시 기능 구현 완료
- [ ] 기본 알림 규칙 구현 완료
""",
        "state": "open",
        "due_on": None,
    },
    {
        "title": "M4. AI Adapter, Group Permission & Control",
        "description": """**목표:**
교수팀 AI endpoint 또는 mock AI endpoint를 붙이고, 그룹 계층 권한과 제어 명령 구조를 구현한다.

**작업 항목:**
- AI endpoint contract 구현
- AI result overlay/event 표시
- group hierarchy 구현
- 상위 그룹의 하위 그룹 조회 가능
- control command + ack 구조 구현

**M5 진입 조건:**
- [ ] AI endpoint contract 정의 완료
- [ ] AI endpoint integration 구현 완료
- [ ] AI result overlay 기능 구현 완료
- [ ] AI event 표시 기능 구현 완료
- [ ] group hierarchy 데이터 모델 구현 완료
- [ ] 상위/하위 그룹 조회 API 구현 및 테스트 완료
- [ ] control command 구조 구현 완료
- [ ] command ACK 메커니즘 구현 완료
""",
        "state": "open",
        "due_on": None,
    },
    {
        "title": "M5. TURN, Stability, Test & Final Delivery",
        "description": """**목표:**
TURN, 장애 복구, 성능 측정, 실증 문서, 최종 납품 패키지를 완성한다.

**작업 항목:**
- TURN 서버 구성
- 5~16대 stream 부하 테스트
- GCS 지연 평균 2.0초 이내 측정
- 장애 복구 테스트
- 운영/배포/롤백 문서 완성

**완료 조건:**
- [ ] TURN 서버 구성 완료
- [ ] TURN 연결 테스트 성공
- [ ] 5대 stream 부하 테스트 완료
- [ ] 10대 stream 부하 테스트 완료
- [ ] 16대 stream 부하 테스트 완료
- [ ] GCS 지연 측정 평균 2.0초 이내 달성
- [ ] 장애 복구 테스트 시나리오 작성 및 실행 완료
- [ ] 운영 문서 작성 완료
- [ ] 배포 문서 작성 완료
- [ ] 롤백 문서 작성 완료
- [ ] 최종 납품 패키지 생성 완료
""",
        "state": "open",
        "due_on": None,
    },
]


def create_milestones(token: str, owner: str, repo: str) -> None:
    """마일스톤 생성"""
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }

    base_url = f"https://api.github.com/repos/{owner}/{repo}/milestones"

    for i, milestone in enumerate(MILESTONES, 1):
        data = {
            "title": milestone["title"],
            "description": milestone["description"],
            "state": milestone["state"],
        }

        if milestone["due_on"]:
            data["due_on"] = milestone["due_on"]

        print(f"[{i}/{len(MILESTONES)}] 생성 중: {milestone['title']}")

        try:
            response = requests.post(base_url, json=data, headers=headers)

            if response.status_code == 201:
                result = response.json()
                print(f"  ✅ 성공! (ID: {result['number']})")
            else:
                print(f"  ❌ 실패! Status: {response.status_code}")
                print(f"     Response: {response.text}")
        except Exception as e:
            print(f"  ❌ 오류: {str(e)}")

    print("\n✨ 마일스톤 생성 완료!")


def main():
    parser = argparse.ArgumentParser(description="GCS Saker Milestones Auto-Creator")
    parser.add_argument("--token", required=True, help="GitHub Personal Access Token")
    parser.add_argument("--owner", default="gcs-saker", help="Repository owner (default: gcs-saker)")
    parser.add_argument(
        "--repo",
        default="gcs-dashboard-app",
        help="Repository name (default: gcs-dashboard-app)",
    )

    args = parser.parse_args()

    print("🚀 마일스톤 생성 시작")
    print(f"   Owner: {args.owner}")
    print(f"   Repo: {args.repo}")
    print(f"   마일스톤 수: {len(MILESTONES)}")
    print()

    create_milestones(args.token, args.owner, args.repo)


if __name__ == "__main__":
    main()
