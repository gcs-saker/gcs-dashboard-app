#!/usr/bin/env python3
"""Generate v0.3 TURN load-reduction report with detailed signaling internals."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from textwrap import wrap

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


REPO_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = REPO_ROOT / "docs/architecture/GCS-Saker_TURN_부하절감_최적화_보고서_v0.3.pdf"
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN_X = 44
TOP_Y = PAGE_HEIGHT - 76
BOTTOM_Y = 50
FONT = "AppleGothic"
FONT_PATH = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"

INK = colors.HexColor("#14202A")
MUTED = colors.HexColor("#607080")
BLUE = colors.HexColor("#1D6FA5")
CYAN = colors.HexColor("#2AA8D8")
GREEN = colors.HexColor("#2E9D68")
ORANGE = colors.HexColor("#C77D1C")
RED = colors.HexColor("#B94A48")
LINE = colors.HexColor("#CCD7E2")
PALE = colors.HexColor("#F4F8FB")
NAVY = colors.HexColor("#071B2D")


@dataclass(frozen=True)
class Option:
    index: int
    title: str
    summary: str
    factors: tuple[str, ...]
    basis: str
    expected: str
    actions: tuple[str, ...]
    difficulty: str
    verify: tuple[str, ...]
    priority: str


OPTIONS = (
    Option(
        1,
        "Direct ICE 성공률 우선",
        "TURN을 빠르게 만드는 것보다 TURN을 타지 않게 만드는 것이 가장 큰 절감책이다.",
        ("NAT 유형", "candidate 품질", "방화벽", "동일 대역 direct 가능성"),
        "WebRTC ICE는 host/srflx/relay 후보를 수집한 뒤 실제 연결 가능한 candidate pair를 선택한다. host 또는 srflx가 성공하면 media packet은 TURN relay를 지나지 않는다.",
        "망 환경에 따라 relay 트래픽 20~80% 감소 가능. 동일 현장망/폐쇄망에서는 가장 큰 절감 폭을 기대할 수 있다.",
        (
            "기본 정책은 iceTransportPolicy=all로 유지하고 relay 강제는 진단 모드로만 둔다.",
            "getStats로 selected candidate type, ICE connected latency, first-frame latency를 기록한다.",
            "direct 실패 원인을 private candidate, advertised host, UDP 차단, NAT hairpin 실패로 분류한다.",
        ),
        "중",
        ("relay 비율", "ICE connected latency", "first-frame latency", "packet loss"),
        "최상",
    ),
    Option(
        2,
        "MediaMTX candidate 정리",
        "외부 클라이언트가 닿을 수 없는 Docker/private 후보를 줄여 불필요한 TURN fallback을 막는다.",
        ("SDP candidate", "공개망/폐쇄망 profile", "NAT address", "WHEP 응답"),
        "SDP에 loopback/private/Docker 주소가 섞이면 외부 단말은 실패 후보를 먼저 시도하고 relay로 빠질 가능성이 커진다.",
        "TURN fallback 10~50% 감소 가능. coturn 403 Forbidden IP 노이즈도 줄어든다.",
        (
            "public profile에는 외부 도달 가능한 host만 advertised 한다.",
            "closed profile에는 내부 도달 가능한 host와 자체 STUN/TURN을 쓴다.",
            "후보 요약 로그를 남겨 private/loopback 후보 수를 회귀 테스트한다.",
        ),
        "중",
        ("candidate type 분포", "private 후보 수", "relay fallback 수", "coturn 403 로그"),
        "최상",
    ),
    Option(
        3,
        "Dashboard WebRTC lazy 연결",
        "작게 보이는 모든 타일을 동시에 WebRTC로 붙이지 말고 선택/확대 타일 위주로 연결한다.",
        ("N:M viewer 증가", "tile fan-out", "브라우저 decoder", "TURN allocation"),
        "N:M 구조에서 대시보드 viewer가 4개 타일을 동시에 열면 viewer 1명당 최대 4개의 WHEP peer connection이 생길 수 있다.",
        "동시 TURN allocation 30~70% 감소 가능. 스트림 수와 viewer 수가 늘수록 효과가 커진다.",
        (
            "선택/확대/핀/팝업된 스트림만 실시간 WebRTC를 유지한다.",
            "비선택 타일은 snapshot, paused preview, low-rate HLS preview로 둔다.",
            "탭 비활성 또는 viewport 밖 카드의 peer connection을 정리한다.",
        ),
        "중상",
        ("active player 수", "allocation 수", "dashboard CPU", "memory", "reconnect latency"),
        "최상",
    ),
    Option(
        4,
        "로봇/드론 native ingest",
        "장비가 이미 지원하는 RTSP/RTP/SRT/WHIP를 우선 사용해 송출 측 WebRTC relay 부담을 줄인다.",
        ("장비 protocol", "codec passthrough", "telemetry 분리", "ingest 안정성"),
        "로봇/드론/IP 카메라는 WebRTC보다 RTSP/RTP/SRT를 native로 지원하는 경우가 많다. 서버가 재인코딩하지 않으면 CPU와 지연이 줄어든다.",
        "송출 측 TURN 사용 최대 100% 제거 가능. transcoding 회피 시 서버 CPU 20~60% 절감 가능.",
        (
            "장비별 ingest matrix를 만든다: RTSP, RTP, SRT, WHIP, vendor SDK.",
            "영상은 MediaMTX ingest, telemetry는 MQTT/HTTP/MAVLink 계열로 분리한다.",
            "timestamp를 기준으로 video/audio/telemetry를 dashboard에서 다시 결합한다.",
        ),
        "상",
        ("publisher TURN 사용률", "server CPU", "ingest-to-play latency", "codec passthrough"),
        "상",
    ),
    Option(
        5,
        "UDP relay 우선, TCP/TLS fallback",
        "실시간 미디어에는 UDP TURN을 우선 사용하고 TCP/TLS TURN은 막힌 망의 마지막 fallback으로 둔다.",
        ("head-of-line blocking", "무선 packet loss", "방화벽 정책", "fallback 연결성"),
        "TCP relay는 손실 시 뒤 packet까지 대기하는 특성이 있어 실시간 영상/음성 지연에 불리하다.",
        "relay RTT와 jitter 5~30% 개선 가능. packet loss가 있는 환경일수록 차이가 커질 수 있다.",
        (
            "ICE server list 순서를 UDP TURN 우선으로 둔다.",
            "TCP/TLS TURN은 UDP 차단망용 fallback으로 남긴다.",
            "selected candidate protocol을 통계로 남겨 정책 효과를 확인한다.",
        ),
        "하중",
        ("selected protocol", "RTT", "jitter", "packet loss", "relay Mbps"),
        "상",
    ),
    Option(
        6,
        "coturn quota와 bandwidth guardrail",
        "속도 향상보다는 폭주와 오남용으로 TURN 전체가 죽는 상황을 막는 안전장치다.",
        ("무단 relay", "quota", "bandwidth cap", "장애 격리"),
        "TURN은 public relay가 되기 쉽다. 사용자별/전체 quota가 없으면 비정상 단말 하나가 allocation과 대역폭을 잠식할 수 있다.",
        "평상시 평균 지연 개선은 작지만 장애 상황에서 NIC/CPU 포화를 방지한다.",
        (
            "total-quota, user-quota, max-bps 후보값을 부하 테스트로 산정한다.",
            "publisher, viewer, admin 계정의 TURN 권한을 분리한다.",
            "quota 초과는 custom error와 event log로 사용자에게 명확히 보여준다.",
        ),
        "중",
        ("quota 초과 이벤트", "allocation 거절 수", "relay Mbps", "CPU/NIC"),
        "상",
    ),
    Option(
        7,
        "TURN primary/secondary 분산",
        "3478/3479를 단순 백업이 아니라 부하 분산과 장애 격리 용도로 사용한다.",
        ("두 서버 역할", "ICE list 순서", "relay port range", "failover"),
        "TURN relay는 packet이 서버 NIC를 직접 통과한다. 인스턴스를 분산하면 단일 NIC/CPU 병목과 장애 반경이 줄어든다.",
        "단일 TURN 서버 부하 30~50% 분산 가능. 실제 효과는 ICE list와 client 분배 정책에 좌우된다.",
        (
            "viewer/publisher/group 단위로 primary TURN 우선순위를 다르게 준다.",
            "두 TURN 서버의 relay port range를 겹치지 않게 분리한다.",
            "health 기반 ICE API가 비정상 TURN을 자동 제외한다.",
        ),
        "중",
        ("TURN별 allocation", "TURN별 relay Mbps", "TURN별 CPU/NIC", "failover 성공률"),
        "상",
    ),
    Option(
        8,
        "폐쇄망 direct profile",
        "폐쇄망에서는 내부 IP 후보가 가장 빠른 경로일 수 있으므로 공개망과 다른 profile을 사용한다.",
        ("인터넷 단절", "내부 DNS", "자체 STUN/TURN", "offline map/time"),
        "공개망에서는 private candidate가 쓸모없지만, 한 대역 폐쇄망에서는 private candidate가 실제 최저 지연 경로다.",
        "폐쇄망 relay 사용 50~90% 감소 가능. 내부 LAN 품질이 좋으면 거의 direct로 처리할 수 있다.",
        (
            "public, closed, hybrid profile을 분리한다.",
            "closed profile에는 자체 STUN/TURN/time/map endpoint를 넣는다.",
            "인터넷 차단 smoke test를 정기적으로 돌린다.",
        ),
        "중상",
        ("closed relay 비율", "offline smoke 성공률", "internal direct latency", "외부 의존 수"),
        "상",
    ),
    Option(
        9,
        "Adaptive bitrate / resolution / fps",
        "relay 경로 또는 작은 tile에는 bitrate와 fps를 낮춰 relay Mbps를 직접 줄인다.",
        ("relay Mbps", "operator 식별성", "tile 크기", "packet loss"),
        "TURN relay 트래픽은 bitrate에 거의 선형으로 증가한다. 비선택 타일 품질을 낮추면 서버 대역폭과 client decode 부하가 같이 줄어든다.",
        "relay Mbps 20~60% 감소 가능. 임무별 최소 식별 품질을 지켜야 한다.",
        (
            "selected stream은 고품질, overview tile은 저품질로 둔다.",
            "relay candidate 감지 시 downshift 정책을 적용한다.",
            "AI event/thumbnail/telemetry를 영상 품질 보조 정보로 활용한다.",
        ),
        "상",
        ("bitrate", "fps", "frame drop", "packet loss", "식별 가능성"),
        "중상",
    ),
    Option(
        10,
        "coturn OS/NIC 튜닝",
        "TURN 구현체를 바꾸기 전에 fd, UDP buffer, conntrack, NIC drop 같은 운영 한계를 먼저 제거한다.",
        ("file descriptor", "UDP buffer", "conntrack", "NIC queue", "softirq"),
        "relay 서버는 application CPU보다 커널 네트워크 큐와 fd 제한에 먼저 막힐 수 있다.",
        "동시 세션 한계 2~5배 개선 가능성. 서버 스펙과 커널 설정에 크게 의존한다.",
        (
            "systemd LimitNOFILE, ulimit, UDP rmem/wmem, conntrack limit을 점검한다.",
            "NIC drop, softirq, receive errors를 지표로 잡는다.",
            "튜닝은 서버 2에서 먼저 검증 후 서버 1에 반영한다.",
        ),
        "중상",
        ("open files", "UDP receive errors", "conntrack", "NIC drops", "relay Mbps"),
        "중상",
    ),
    Option(
        11,
        "Ephemeral TURN credential",
        "짧은 TTL credential로 허가된 세션만 relay를 쓰게 해서 보안과 자원 보호를 동시에 잡는다.",
        ("credential TTL", "권한 모델", "토큰 갱신", "무단 relay"),
        "TURN credential이 오래 살아 있거나 공유되면 외부에서 relay를 남용할 수 있다.",
        "정상 트래픽 속도 개선은 작지만 무권한 relay 사용을 크게 줄인다.",
        (
            "media-control이 stream 권한을 확인한 뒤 짧은 TTL TURN credential을 발급한다.",
            "refresh token과 TURN credential TTL을 분리한다.",
            "만료와 재발급 실패를 UI 상태와 event log에 남긴다.",
        ),
        "중",
        ("credential 발급 수", "무권한 allocation", "TTL", "refresh 실패율"),
        "중",
    ),
    Option(
        12,
        "Rust TURN PoC는 후순위",
        "Rust 전환은 coturn이 실제 CPU 병목으로 확인된 뒤 shadow benchmark로만 시작한다.",
        ("운영 성숙도", "보안 업데이트", "브라우저 호환", "relay 본질 비용"),
        "TURN 부담의 대부분은 언어보다 relay traffic, port, NIC, quota, fd에서 온다. 구현체 교체는 마지막 카드다.",
        "CPU 0~30% 개선 가능성. 대신 운영 리스크가 증가할 수 있다.",
        (
            "coturn과 Rust TURN을 같은 세션/bitrate/port range로 비교한다.",
            "UDP/TCP/TLS, auth, quota, log, metrics 호환성을 확인한다.",
            "운영 전환이 아니라 shadow benchmark와 PoC issue로만 진행한다.",
        ),
        "상",
        ("CPU", "memory", "allocation latency", "relay RTT", "browser compatibility"),
        "후순위",
    ),
)


def register_font() -> None:
    pdfmetrics.registerFont(TTFont(FONT, FONT_PATH))


def split_lines(text: str, width: int) -> list[str]:
    result: list[str] = []
    for paragraph in text.split("\n"):
        paragraph = paragraph.strip()
        if not paragraph:
            result.append("")
            continue
        result.extend(wrap(paragraph, width=width, break_long_words=False, replace_whitespace=False))
    return result


class Report:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.c = canvas.Canvas(str(path), pagesize=A4)
        self.page = 0

    def save(self) -> None:
        self.c.save()

    def new_page(self, title: str, subtitle: str = "") -> None:
        if self.page:
            self.c.showPage()
        self.page += 1
        c = self.c
        c.setFillColor(colors.white)
        c.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)
        c.setFillColor(NAVY)
        c.rect(0, PAGE_HEIGHT - 36, PAGE_WIDTH, 36, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont(FONT, 8)
        c.drawString(MARGIN_X, PAGE_HEIGHT - 23, "GCS-Saker TURN Load Reduction Report v0.3")
        c.drawRightString(PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 23, f"{self.page:02d}")
        c.setFillColor(INK)
        c.setFont(FONT, 18)
        c.drawString(MARGIN_X, TOP_Y, title)
        if subtitle:
            c.setFillColor(MUTED)
            c.setFont(FONT, 9)
            c.drawString(MARGIN_X, TOP_Y - 24, subtitle)
        c.setStrokeColor(LINE)
        c.line(MARGIN_X, TOP_Y - 38, PAGE_WIDTH - MARGIN_X, TOP_Y - 38)

    def footer(self) -> None:
        c = self.c
        c.setFillColor(MUTED)
        c.setFont(FONT, 7)
        c.drawString(MARGIN_X, 27, "A4AI / GCS-Saker internal technical report")
        c.drawRightString(PAGE_WIDTH - MARGIN_X, 27, f"page {self.page}")

    def text(self, x: float, y: float, text: str, width: int = 60, size: float = 8.7, leading: float = 13.2, color=INK) -> float:
        c = self.c
        c.setFont(FONT, size)
        c.setFillColor(color)
        for line in split_lines(text, width):
            if y < BOTTOM_Y:
                return y
            c.drawString(x, y, line)
            y -= leading
        return y

    def bullet_list(self, x: float, y: float, items: tuple[str, ...] | list[str], width: int = 54, size: float = 8.3, leading: float = 12.2) -> float:
        c = self.c
        c.setFont(FONT, size)
        c.setFillColor(INK)
        for item in items:
            lines = split_lines(item, width)
            if y < BOTTOM_Y + (len(lines) * leading):
                return y
            c.setFillColor(BLUE)
            c.circle(x + 3, y + 3, 1.6, stroke=0, fill=1)
            c.setFillColor(INK)
            for i, line in enumerate(lines):
                c.drawString(x + 12, y, line)
                y -= leading
                if i == 0:
                    pass
            y -= 2
        return y

    def section_title(self, x: float, y: float, text: str, color=BLUE) -> float:
        self.c.setFillColor(color)
        self.c.setFont(FONT, 11)
        self.c.drawString(x, y, text)
        return y - 16

    def box(self, x: float, y: float, w: float, h: float, title: str, body: str, accent=BLUE, width: int = 32) -> None:
        c = self.c
        c.setFillColor(PALE)
        c.roundRect(x, y - h, w, h, 7, stroke=0, fill=1)
        c.setStrokeColor(colors.HexColor("#D6E4EF"))
        c.roundRect(x, y - h, w, h, 7, stroke=1, fill=0)
        c.setFillColor(accent)
        c.roundRect(x, y - 18, w, 18, 7, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont(FONT, 8.2)
        c.drawString(x + 10, y - 12, title)
        self.text(x + 10, y - 31, body, width=width, size=7.35, leading=10.8, color=INK)


def draw_cover(r: Report) -> None:
    r.page = 1
    c = r.c
    c.setFillColor(NAVY)
    c.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)
    c.setFillColor(CYAN)
    c.rect(0, PAGE_HEIGHT - 8, PAGE_WIDTH, 8, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont(FONT, 27)
    c.drawString(56, PAGE_HEIGHT - 135, "GCS-Saker")
    c.setFont(FONT, 20)
    c.drawString(56, PAGE_HEIGHT - 170, "TURN 서버 부하 절감 최적화 보고서")
    c.setFillColor(colors.HexColor("#CFE8F6"))
    c.setFont(FONT, 11)
    c.drawString(56, PAGE_HEIGHT - 202, "v0.3 / N:M 구조, STUN/TURN signaling 내부 로직, relay port 고갈 모델 반영")
    c.setFillColor(colors.HexColor("#133B58"))
    c.roundRect(56, 140, PAGE_WIDTH - 112, 180, 12, stroke=0, fill=1)
    c.setStrokeColor(colors.HexColor("#347EA8"))
    c.roundRect(56, 140, PAGE_WIDTH - 112, 180, 12, stroke=1, fill=0)
    nodes = [
        (100, 245, "Publisher"),
        (230, 245, "MediaMTX"),
        (360, 245, "TURN"),
        (490, 245, "Viewer N"),
        (230, 180, "Telemetry"),
        (360, 180, "Auth/ICE"),
    ]
    c.setFont(FONT, 8.5)
    for x, y, label in nodes:
        c.setFillColor(colors.HexColor("#0A2639"))
        c.roundRect(x - 42, y - 18, 84, 36, 9, stroke=0, fill=1)
        c.setStrokeColor(colors.HexColor("#52B6E0"))
        c.roundRect(x - 42, y - 18, 84, 36, 9, stroke=1, fill=0)
        c.setFillColor(colors.white)
        c.drawCentredString(x, y - 3, label)
    c.setStrokeColor(CYAN)
    c.setLineWidth(1.4)
    for x1, y1, x2, y2 in ((142, 245, 188, 245), (272, 245, 318, 245), (402, 245, 448, 245), (230, 227, 230, 198), (360, 227, 360, 198)):
        c.line(x1, y1, x2, y2)
        c.circle(x2, y2, 2, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont(FONT, 9)
    c.drawString(56, 96, "핵심 결론")
    r.text(
        56,
        78,
        "파이프라인 CPU 과부하보다 N:M viewer fan-out, TURN allocation, relay port range, fd/conntrack, NIC 대역폭이 먼저 병목이 될 가능성이 높다. 따라서 우선순위는 direct ICE 성공률, 후보 정리, lazy player, port/OS 한계 관리, credential/quota 순서다.",
        width=74,
        size=7.8,
        leading=12,
        color=colors.HexColor("#D7EAF5"),
    )


def draw_considerations(r: Report) -> None:
    r.new_page("고려한 요소", "이번 v0.3에서 N:M 구조, signaling 내부 로직, TURN 자원 고갈 가능성을 명시적으로 반영")
    y = TOP_Y - 54
    r.text(MARGIN_X, y, "이 문서는 단순히 TURN 서버를 빠르게 만드는 방법만 다루지 않는다. GCS-Saker가 실제 운영에서 만날 수 있는 viewer 증가, 스트림 타일 증가, 공유기/방화벽 포워딩, 폐쇄망, 자체 STUN/TURN, 서버 2대 역할 분리까지 같이 본다.", width=78, size=9.2, leading=13)
    y -= 58
    col_w = (PAGE_WIDTH - MARGIN_X * 2 - 16) / 2
    left = (
        "N:M 구조: publisher P개와 viewer V명이 있고, viewer가 여러 stream tile을 동시에 열 수 있다.",
        "TURN allocation: relayed peer connection 수에 비례해 relay endpoint, permission, channel, fd가 증가한다.",
        "relay port range: PoC의 49160~49200 같은 좁은 범위는 작은 실험용으로는 충분하지만 운영 N:M에는 부족할 수 있다.",
        "pipeline 과부하: MediaMTX가 passthrough 중심이면 transcoding CPU보다 relay/NIC/port 한계가 먼저 올 가능성이 높다.",
    )
    right = (
        "NAT/방화벽: UDP 차단, NAT hairpin 실패, 잘못된 advertised candidate가 direct ICE를 막는다.",
        "NIC/conntrack/fd: TURN은 packet relay 서버라 OS 네트워크 한계가 application 코드보다 먼저 드러날 수 있다.",
        "보안: TURN credential TTL, quota, group 권한이 없으면 무단 relay가 성능 문제로 이어진다.",
        "폐쇄망: 내부망에서는 private candidate가 오히려 가장 빠른 경로이며 공개망 profile과 분리해야 한다.",
    )
    r.box(MARGIN_X, y, col_w, 165, "용량/성능 관점", "\n".join(f"- {v}" for v in left), accent=BLUE, width=38)
    r.box(MARGIN_X + col_w + 16, y, col_w, 165, "운영/보안 관점", "\n".join(f"- {v}" for v in right), accent=GREEN, width=38)
    y -= 200
    r.section_title(MARGIN_X, y, "결론")
    r.text(MARGIN_X, y - 17, "TURN 서버 부담의 본질은 CPU pipeline 하나가 아니라 '얼마나 많은 peer connection이 relay로 빠지는가'와 '그 relay가 포트, 파일 디스크립터, 커널 네트워크 큐, NIC 대역폭을 얼마나 소비하는가'다. 따라서 direct ICE 성공률과 viewer-side lazy 연결을 먼저 잡는 것이 가장 안전하다.", width=82, size=9.1, leading=13)
    r.footer()


def draw_capacity_model(r: Report) -> None:
    r.new_page("N:M 용량 모델", "TURN port 부족과 allocation 폭증을 먼저 추정해야 함")
    c = r.c
    base_y = TOP_Y - 80
    labels = [
        (80, base_y, "P publishers"),
        (220, base_y, "MediaMTX"),
        (360, base_y, "TURN relay"),
        (500, base_y, "V viewers"),
    ]
    for x, y, label in labels:
        c.setFillColor(PALE)
        c.roundRect(x - 46, y - 23, 92, 46, 8, stroke=0, fill=1)
        c.setStrokeColor(LINE)
        c.roundRect(x - 46, y - 23, 92, 46, 8, stroke=1, fill=0)
        c.setFillColor(INK)
        c.setFont(FONT, 8.5)
        c.drawCentredString(x, y - 3, label)
    c.setStrokeColor(CYAN)
    c.setLineWidth(1.5)
    for x1, x2 in ((126, 174), (266, 314), (406, 454)):
        c.line(x1, base_y, x2, base_y)
        c.circle(x2, base_y, 2.5, stroke=0, fill=1)
    r.section_title(MARGIN_X, base_y - 70, "간단 추정식")
    formulas = (
        "동시 viewer connection ~= V × 선택/실시간 타일 수 S",
        "relay peer connection ~= (publisher relay 수 + viewer connection 수) × relay 비율 R",
        "TURN relay 대역폭 ~= Σ(선택 스트림 bitrate × relay viewer 수)",
        "relay port 압박 ~= allocation 수 × ICE component 수 × transport 정책 + stale allocation 여유",
    )
    r.bullet_list(MARGIN_X, base_y - 92, formulas, width=74, size=8.8, leading=12.5)
    r.box(MARGIN_X, 355, 238, 118, "현재 PoC port range 주의", "49160~49200은 41개 포트 범위다. BUNDLE/RTCP mux 환경에서는 과거 RTP/RTCP 분리보다 효율적일 수 있지만, N:M 운영에서 allocation이 늘면 이 범위는 빠르게 부족해질 수 있다.", accent=ORANGE, width=34)
    r.box(MARGIN_X + 260, 355, 238, 118, "pipeline 과부하 판단", "MediaMTX가 passthrough 중심이면 encoding pipeline CPU보다 TURN relay의 NIC, fd, conntrack, port range가 먼저 병목일 수 있다. transcoding을 넣는 순간 CPU 병목 모델을 따로 봐야 한다.", accent=BLUE, width=34)
    r.section_title(MARGIN_X, 205, "운영 기준")
    r.text(MARGIN_X, 187, "운영 전에는 stream 1개 기준이 아니라 P, V, S, R을 바꿔가며 allocation 수와 relay Mbps를 계측해야 한다. 포트 고갈은 평균 latency보다 먼저 '연결 실패/간헐적 ICE 실패'로 나타날 수 있으므로 연결 성공률과 coturn allocation 로그를 같이 봐야 한다.", width=82, size=9, leading=13)
    r.footer()


def draw_signaling_overview(r: Report) -> None:
    r.new_page("Signaling 전체 흐름", "WHEP/WHIP, STUN, TURN이 서로 만나는 지점")
    c = r.c
    y = TOP_Y - 66
    nodes = [
        (78, y, "Browser\nPublisher/Viewer"),
        (205, y, "Nginx\n443"),
        (326, y, "Media Control\nICE API"),
        (447, y, "MediaMTX\nWHIP/WHEP"),
        (150, y - 115, "STUN\nmapping"),
        (326, y - 115, "TURN\nrelay"),
        (500, y - 115, "coturn\nport range"),
    ]
    c.setFont(FONT, 7.5)
    for x, yy, label in nodes:
        c.setFillColor(PALE)
        c.roundRect(x - 48, yy - 26, 96, 52, 8, stroke=0, fill=1)
        c.setStrokeColor(LINE)
        c.roundRect(x - 48, yy - 26, 96, 52, 8, stroke=1, fill=0)
        c.setFillColor(INK)
        for i, line in enumerate(label.split("\n")):
            c.drawCentredString(x, yy + 5 - i * 12, line)
    c.setStrokeColor(CYAN)
    c.setLineWidth(1.4)
    for x1, yy1, x2, yy2 in (
        (126, y, 157, y),
        (253, y, 278, y),
        (374, y, 399, y),
        (78, y - 26, 150, y - 89),
        (78, y - 26, 326, y - 89),
        (326, y - 89, 500, y - 89),
    ):
        c.line(x1, yy1, x2, yy2)
        c.circle(x2, yy2, 2, stroke=0, fill=1)

    y -= 185
    r.section_title(MARGIN_X, y, "단계별 흐름")
    steps = (
        "1. 사용자가 로그인하고 stream 권한을 확인한다. 이 단계는 JWT/refresh/session 정책과 group 권한을 탄다.",
        "2. 프론트가 `/media-control/api/v1/streams/ice-servers`에서 STUN/TURN 서버 목록과 짧은 TTL credential을 받는다.",
        "3. 브라우저는 RTCPeerConnection을 만들고 ICE gathering을 시작한다. host, srflx(STUN), relay(TURN) candidate가 생성된다.",
        "4. 송출자는 WHIP offer를 MediaMTX에 POST하고, 수신자는 WHEP offer를 MediaMTX에 POST한다. MediaMTX는 SDP answer를 돌려준다.",
        "5. 브라우저와 MediaMTX는 ICE connectivity check를 수행하고 selected candidate pair를 고른다.",
        "6. direct가 실패하고 relay가 선택되면 SRTP/RTCP packet이 coturn relay port를 통해 흐른다.",
        "7. dashboard는 getStats, backend event log, coturn allocation log를 합쳐 direct/relay, RTT, jitter, packet loss를 기록한다.",
    )
    r.bullet_list(MARGIN_X, y - 18, steps, width=82, size=8.4, leading=12.8)
    r.footer()


def draw_stun_logic(r: Report) -> None:
    r.new_page("STUN 내부 로직", "STUN은 media relay가 아니라 NAT mapping 발견용")
    y = TOP_Y - 58
    r.section_title(MARGIN_X, y, "무슨 일이 일어나나")
    y = r.bullet_list(
        MARGIN_X,
        y - 18,
        (
            "브라우저가 STUN server로 Binding Request를 보낸다. 이 요청은 media packet이 아니라 NAT mapping 확인용 control packet이다.",
            "STUN server는 응답에 XOR-MAPPED-ADDRESS를 담아 돌려준다. 브라우저는 이 주소를 server-reflexive(srflx) candidate로 등록한다.",
            "srflx candidate는 외부에서 이 클라이언트를 어떻게 볼 수 있는지 알려준다. 이 candidate로 ICE check가 성공하면 TURN relay가 필요 없다.",
            "STUN은 packet을 계속 중계하지 않는다. 연결 확인과 consent freshness용 keepalive는 있지만 영상/음성 대역폭을 먹는 relay가 아니다.",
        ),
        width=82,
        size=8.7,
        leading=13.4,
    )
    y -= 14
    col_w = (PAGE_WIDTH - MARGIN_X * 2 - 18) / 2
    r.box(MARGIN_X, y, col_w, 135, "건드리는 곳", "- Frontend: RTCPeerConnection iceServers\n- Backend: ICE server DTO, credential TTL\n- Nginx: ICE API route\n- Firewall: STUN/TURN port outbound/inbound\n- Profile: public/closed/hybrid", accent=BLUE, width=38)
    r.box(MARGIN_X + col_w + 18, y, col_w, 135, "장애 신호", "- srflx candidate가 없음\n- ICE checking에서 relay로만 성공\n- 같은 망인데도 TURN 사용률이 높음\n- candidate에 잘못된 private/Docker IP 노출\n- NAT hairpin 실패", accent=ORANGE, width=38)
    y -= 168
    r.section_title(MARGIN_X, y, "최적화 포인트")
    r.text(MARGIN_X, y - 18, "STUN을 자체 서버로 바꾸는 것은 폐쇄망 독립성에는 좋지만, 공개망에서 Google STUN보다 항상 빠르다고 보장할 수는 없다. 핵심은 STUN 서버 자체보다 `실제 도달 가능한 candidate만 주고받는가`, `공개망/폐쇄망 profile이 섞이지 않는가`, `direct 실패 원인을 로그로 남기는가`다.", width=82, size=8.9, leading=13.5)
    r.footer()


def draw_turn_logic(r: Report) -> None:
    r.new_page("TURN 내부 로직", "relay port, allocation, permission이 부하의 실체")
    y = TOP_Y - 56
    r.section_title(MARGIN_X, y, "TURN allocation 순서")
    y = r.bullet_list(
        MARGIN_X,
        y - 18,
        (
            "1. 브라우저가 TURN Allocate Request를 보낸다. long-term credential 방식이면 nonce/realm 검증이 포함된다.",
            "2. coturn은 인증이 맞으면 relay endpoint를 할당한다. 이때 `min-port/max-port` 범위 안의 relay port가 소비된다.",
            "3. 브라우저는 이 relay 주소를 relay candidate로 ICE에 등록한다.",
            "4. 실제 상대와 통신하려면 CreatePermission으로 peer IP를 허용한다. 더 효율적인 전송을 위해 ChannelBind가 붙을 수 있다.",
            "5. media packet은 브라우저 -> TURN -> MediaMTX 또는 MediaMTX -> TURN -> 브라우저로 흐른다. 이 구간이 TURN 대역폭과 NIC를 직접 소비한다.",
            "6. 세션 중 Refresh가 allocation 수명을 갱신하고, 종료/timeout 시 relay port가 반환된다.",
        ),
        width=82,
        size=8.5,
        leading=13,
    )
    y -= 6
    col_w = (PAGE_WIDTH - MARGIN_X * 2 - 18) / 2
    r.box(MARGIN_X, y, col_w, 130, "부하가 생기는 지점", "- relay port range\n- allocation table\n- permission/channel table\n- file descriptor\n- UDP socket buffer\n- conntrack/NAT table\n- NIC packet rate와 Mbps", accent=RED, width=38)
    r.box(MARGIN_X + col_w + 18, y, col_w, 130, "설정 touch point", "- TURN realm/shared secret\n- credential TTL\n- external-ip\n- min-port/max-port\n- total-quota/user-quota\n- max-bps\n- UDP/TCP/TLS listener", accent=GREEN, width=38)
    y -= 160
    r.section_title(MARGIN_X, y, "왜 port 부족이 문제인가")
    r.text(MARGIN_X, y - 18, "TURN은 단순 API 서버가 아니라 relay endpoint를 실제로 할당한다. 현재 PoC처럼 49160~49200 범위가 작으면 소수 테스트는 통과해도 N:M viewer가 늘 때 allocation 실패, 간헐적 ICE 실패, 재연결 루프가 먼저 나타날 수 있다. BUNDLE/RTCP mux 덕분에 과거보다 port 소비가 줄 수는 있지만, 운영 용량은 반드시 실제 allocation 로그로 잡아야 한다.", width=82, size=8.8, leading=13.4)
    r.footer()


def draw_whep_whip_logic(r: Report) -> None:
    r.new_page("WHEP/WHIP와 장애 지점", "signaling은 성공했는데 media가 안 오는 경우를 나누어 본다")
    y = TOP_Y - 58
    r.section_title(MARGIN_X, y, "송출 WHIP")
    y = r.bullet_list(
        MARGIN_X,
        y - 18,
        (
            "Publisher가 local media track을 만들고 RTCPeerConnection offer를 생성한다.",
            "WHIP endpoint로 SDP offer를 POST한다. Nginx는 `/webrtc/.../whip`를 MediaMTX로 proxy한다.",
            "MediaMTX가 SDP answer를 반환하면 브라우저는 setRemoteDescription을 수행한다.",
            "ICE가 connected/completed가 되면 SRTP media가 흐르고 stream registry에 active 상태가 반영된다.",
        ),
        width=82,
        size=8.6,
        leading=13.2,
    )
    y -= 10
    r.section_title(MARGIN_X, y, "수신 WHEP")
    y = r.bullet_list(
        MARGIN_X,
        y - 18,
        (
            "Dashboard가 stream 목록에서 선택한 stream path로 WHEP offer를 POST한다.",
            "MediaMTX answer를 받은 뒤 remote track event가 발생해야 video/audio element에 media stream이 붙는다.",
            "signaling 성공 + ICE connected인데 화면이 안 나오면 track binding, autoplay/muted 정책, codec mismatch, selected candidate media path를 확인한다.",
            "GET에서 405가 나는 것은 path 도달 확인일 수 있지만, 실제 WHEP 검증은 POST offer와 SDP answer로 봐야 한다.",
        ),
        width=82,
        size=8.6,
        leading=13.2,
    )
    y -= 10
    r.section_title(MARGIN_X, y, "오류를 어디서 볼 것인가")
    r.bullet_list(
        MARGIN_X,
        y - 18,
        (
            "401: dashboard/auth 권한 또는 TURN credential 만료",
            "404: stream path 없음, registry와 MediaMTX path 불일치",
            "405: 잘못된 method. WHEP/WHIP는 실제로 POST offer가 필요",
            "502: Nginx -> MediaMTX proxy, container health, upstream port 문제",
            "ICE connected but no media: candidate는 붙었지만 track/codec/relay port/media flow 문제",
        ),
        width=82,
        size=8.6,
        leading=13.2,
    )
    r.footer()


def draw_option(r: Report, option: Option) -> None:
    r.new_page(f"{option.index:02d}. {option.title}", f"우선순위: {option.priority} / 난이도: {option.difficulty}")
    y = TOP_Y - 56
    r.text(MARGIN_X, y, option.summary, width=82, size=10, leading=14, color=INK)
    y -= 48
    col_w = (PAGE_WIDTH - MARGIN_X * 2 - 18) / 2
    r.box(MARGIN_X, y, col_w, 108, "고려 요소", "\n".join(f"- {v}" for v in option.factors), accent=BLUE, width=38)
    r.box(MARGIN_X + col_w + 18, y, col_w, 108, "예상 개선", option.expected, accent=GREEN, width=38)
    y -= 138
    r.section_title(MARGIN_X, y, "근거")
    y = r.text(MARGIN_X, y - 17, option.basis, width=82, size=8.8, leading=12.5)
    y -= 10
    r.section_title(MARGIN_X, y, "적용 방안")
    y = r.bullet_list(MARGIN_X, y - 16, option.actions, width=77, size=8.5, leading=12)
    y -= 8
    r.section_title(MARGIN_X, y, "검증 지표")
    r.bullet_list(MARGIN_X, y - 16, option.verify, width=72, size=8.4, leading=11.5)
    r.footer()


def draw_benchmark_plan(r: Report) -> None:
    r.new_page("검증 계획", "평균값보다 연결 실패, port 고갈, tail latency를 먼저 봐야 함")
    y = TOP_Y - 58
    r.section_title(MARGIN_X, y, "1. N:M 부하 시나리오")
    y = r.bullet_list(
        MARGIN_X,
        y - 18,
        (
            "P=1/4/8 publisher, V=1/4/10 viewer, S=1/4 active tile 조합으로 반복한다.",
            "R=direct, mixed, relay-only 세 profile로 나눠 first-frame latency와 relay Mbps를 기록한다.",
            "port range를 PoC 범위와 확장 범위로 바꿔 allocation 실패가 언제 시작되는지 확인한다.",
        ),
        width=78,
        size=8.8,
        leading=12.5,
    )
    y -= 12
    r.section_title(MARGIN_X, y, "2. 장애/보안 시나리오")
    y = r.bullet_list(
        MARGIN_X,
        y - 18,
        (
            "TURN primary down, TURN secondary only, MediaMTX restart, Redis restart에서 degraded behavior를 고정한다.",
            "만료 credential, 잘못된 group 권한, quota 초과, UDP 차단망에서 사용자 메시지와 event log를 검증한다.",
            "closed profile은 인터넷 차단 상태에서 자체 STUN/TURN/time/map만으로 smoke test를 수행한다.",
        ),
        width=78,
        size=8.8,
        leading=12.5,
    )
    y -= 12
    r.section_title(MARGIN_X, y, "3. 수집해야 하는 숫자")
    metrics = (
        "ICE connected latency / first-frame latency / audio-video sync offset",
        "selected candidate type과 protocol / direct:relay 비율",
        "coturn allocation 수 / permission 수 / relay Mbps / denied allocation 수",
        "fd 사용량 / conntrack 사용량 / NIC drop / UDP receive errors / CPU softirq",
    )
    r.bullet_list(MARGIN_X, y - 18, metrics, width=78, size=8.8, leading=12.5)
    r.footer()


def draw_roadmap(r: Report) -> None:
    r.new_page("권장 적용 순서", "서버 구조를 크게 뒤집기 전에 효과가 큰 것부터")
    stages = (
        ("1단계", "Candidate 정리 + direct ICE 계측 + lazy player", "릴레이 비율을 먼저 낮춘다. 가장 큰 절감 가능성이 있고 UI/UX에도 직접 도움된다.", BLUE),
        ("2단계", "TURN port range/OS limit 점검 + quota", "PoC port 범위는 운영 N:M에 부족할 수 있다. 포트, fd, conntrack, NIC를 먼저 계측한다.", ORANGE),
        ("3단계", "Primary/secondary TURN 분산 + ephemeral credential", "부하와 장애 반경을 줄이고 무권한 relay를 막는다. 인증/인가 정책과 같이 가야 한다.", GREEN),
        ("4단계", "Native ingest + adaptive quality", "장비 protocol을 살려 송출 부담과 relay Mbps를 줄인다. 임무별 품질 기준이 필요하다.", CYAN),
        ("후순위", "Rust TURN 또는 SFU", "coturn/MediaMTX 계측에서 실제 CPU 병목이 확인된 뒤 PoC로 검증한다.", RED),
    )
    y = TOP_Y - 58
    for label, title, body, color in stages:
        r.c.setFillColor(color)
        r.c.roundRect(MARGIN_X, y - 44, 82, 44, 8, stroke=0, fill=1)
        r.c.setFillColor(colors.white)
        r.c.setFont(FONT, 10)
        r.c.drawCentredString(MARGIN_X + 41, y - 27, label)
        r.c.setFillColor(PALE)
        r.c.roundRect(MARGIN_X + 96, y - 44, PAGE_WIDTH - MARGIN_X * 2 - 96, 44, 8, stroke=0, fill=1)
        r.c.setStrokeColor(LINE)
        r.c.roundRect(MARGIN_X + 96, y - 44, PAGE_WIDTH - MARGIN_X * 2 - 96, 44, 8, stroke=1, fill=0)
        r.c.setFillColor(INK)
        r.c.setFont(FONT, 9.2)
        r.c.drawString(MARGIN_X + 110, y - 17, title)
        r.c.setFillColor(MUTED)
        r.c.setFont(FONT, 7.8)
        r.c.drawString(MARGIN_X + 110, y - 33, body)
        y -= 70
    r.footer()


def draw_sources(r: Report) -> None:
    r.new_page("참고와 한계", "개선 수치는 환경 의존적인 범위 추정치이며 실제 부하 시험으로 고정해야 함")
    y = TOP_Y - 58
    r.section_title(MARGIN_X, y, "출처와 근거")
    y = r.bullet_list(
        MARGIN_X,
        y - 18,
        (
            "WebRTC ICE/STUN/TURN model: MDN WebRTC connectivity, W3C WebRTC stats",
            "TURN operation: coturn project documentation and common TURN allocation behavior",
            "GCS-Saker 운영 로그: MediaMTX WHEP, coturn 403, 8189 UDP/TCP 개방 이후 실제 연결 확인",
            "내부 PoC 제약: 현재 49160~49200 relay range는 운영 용량 산정 전의 작은 검증 범위",
        ),
        width=78,
        size=8.6,
        leading=12.3,
    )
    y -= 12
    r.section_title(MARGIN_X, y, "주의")
    y = r.bullet_list(
        MARGIN_X,
        y - 18,
        (
            "TURN port 소비량은 BUNDLE, RTCP mux, audio/video m-line, UDP/TCP/TLS 정책, stale allocation 정리에 따라 달라진다.",
            "N:M viewer 수가 증가하면 TURN보다 먼저 브라우저 decoder, dashboard rendering, viewer network가 병목이 될 수 있으므로 end-to-end 지표를 같이 봐야 한다.",
            "SFU와 Rust TURN은 장점이 있지만, 현재 단계에서는 direct ICE와 TURN 운영 한계 제거가 우선이다.",
        ),
        width=78,
        size=8.6,
        leading=12.3,
    )
    r.footer()


def build() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    register_font()
    r = Report(OUTPUT)
    draw_cover(r)
    draw_considerations(r)
    draw_capacity_model(r)
    draw_signaling_overview(r)
    draw_stun_logic(r)
    draw_turn_logic(r)
    draw_whep_whip_logic(r)
    for option in OPTIONS:
        draw_option(r, option)
    draw_benchmark_plan(r)
    draw_roadmap(r)
    draw_sources(r)
    r.save()


if __name__ == "__main__":
    build()
    print(OUTPUT)
