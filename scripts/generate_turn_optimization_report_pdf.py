#!/usr/bin/env python3
"""Generate a Korean PDF report for TURN load reduction options."""

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
OUTPUT = REPO_ROOT / "docs/architecture/GCS-Saker_TURN_부하절감_최적화_보고서_v0.1.pdf"
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN_X = 44
TOP_Y = PAGE_HEIGHT - 52
BOTTOM_Y = 46
BODY_FONT = "AppleMyungjo"
HEAD_FONT = "AppleGothic"
BODY_FONT_PATH = "/System/Library/Fonts/Supplemental/AppleMyungjo.ttf"
HEAD_FONT_PATH = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"


@dataclass(frozen=True)
class Option:
    index: int
    title: str
    one_line: str
    basis: str
    expected: str
    method: list[str]
    difficulty: str
    risk: str
    metric: list[str]
    diagram: str
    priority: str


OPTIONS = [
    Option(
        1,
        "Direct ICE 성공률 올리기",
        "TURN을 더 빠르게 만들기보다, TURN을 안 타도 되는 연결을 직접 연결로 성공시키는 것이 가장 큰 절감책이다.",
        "WebRTC는 ICE server 설정을 통해 STUN/TURN 후보를 수집하고, 가능한 연결 경로를 선택한다. 직접 후보가 성공하면 미디어 packet이 TURN relay를 지나지 않는다.",
        "망 환경에 따라 TURN relay 트래픽 20~80% 감소 가능. 같은 사무실/전술망/고정 현장망에서는 특히 효과가 크다.",
        [
            "기본 `iceTransportPolicy`는 `all`로 유지하고, `relay` 강제는 진단/특수망 테스트에서만 사용한다.",
            "선택된 candidate pair의 local/remote candidate type을 `host`, `srflx`, `relay`로 기록한다.",
            "직접 연결 실패 원인을 NAT 유형, advertised host, 방화벽, MediaMTX candidate로 분류한다.",
        ],
        "중",
        "direct 후보를 무리하게 우선하면 제한망에서 연결 시간이 늘 수 있다. 실패 시 빠르게 TURN fallback이 되어야 한다.",
        ["relay 비율", "ICE connected latency", "first-frame latency", "packet loss"],
        "direct",
        "최상",
    ),
    Option(
        2,
        "MediaMTX candidate 정리",
        "외부 클라이언트가 실제로 닿을 수 있는 후보만 보게 해 direct ICE 실패율을 낮춘다.",
        "MediaMTX SDP candidate에 Docker/private/loopback 주소가 섞이면 외부 NAT 클라이언트는 잘못된 후보를 시도하고, 결과적으로 TURN relay로 빠질 가능성이 커진다.",
        "TURN fallback 비율 10~50% 감소 가능. 현재 #292의 핵심 작업이며, 운영 로그의 `403 Forbidden IP` 노이즈도 줄일 수 있다.",
        [
            "`MEDIAMTX_WEBRTC_ADDITIONAL_HOSTS`에 외부에서 도달 가능한 주소를 명확히 넣는다.",
            "공개망에서는 `MEDIAMTX_WEBRTC_IPS_FROM_INTERFACES=false` 후보를 검토한다.",
            "`TURN_EXTERNAL_IP`와 공유기 포트포워딩 주소가 일치하는지 확인한다.",
        ],
        "중",
        "공개망/폐쇄망 profile을 섞으면 내부망 direct 연결이 오히려 깨질 수 있다. profile 분리가 필요하다.",
        ["SDP candidate summary", "private/loopback candidate 수", "relay fallback 수", "coturn 403 로그"],
        "candidate",
        "최상",
    ),
    Option(
        3,
        "대시보드 WebRTC lazy 연결",
        "선택하지 않은 스트림까지 모두 WebRTC로 붙지 않게 해서 viewer 측 TURN allocation을 줄인다.",
        "대시보드에 4~8개 스트림 카드가 동시에 있으면, 각 player가 ICE 후보를 만들고 TURN allocation을 만들 수 있다. 사용자가 실제로 보는 스트림만 실시간 연결하면 세션 수가 줄어든다.",
        "동시 TURN allocation 30~70% 감소 가능. 스트림 수가 늘수록 효과가 커진다.",
        [
            "선택/확대/핀/팝업된 스트림만 WebRTC WHEP 연결을 연다.",
            "나머지 카드는 snapshot, paused preview, 낮은 주기 status, 또는 HLS lightweight preview로 둔다.",
            "탭 비활성/화면 밖 카드에는 연결을 정리하고 재진입 시 재연결한다.",
        ],
        "중상",
        "사용자가 스트림을 선택했을 때 최초 연결 시간이 약간 생길 수 있다. UI에는 연결 중 상태를 명확히 보여줘야 한다.",
        ["active WebRTC player 수", "TURN allocation 수", "dashboard CPU", "memory", "first interaction latency"],
        "lazy",
        "최상",
    ),
    Option(
        4,
        "로봇/드론 native ingest",
        "장비가 이미 만드는 H.264/H.265 스트림을 MediaMTX에 직접 넣어 송출 측 TURN 부담과 transcoding을 줄인다.",
        "드론/로봇/IP 카메라는 WebRTC보다 RTSP/RTP/SRT를 native로 지원하는 경우가 많다. 서버가 재인코딩하지 않고 pass-through하면 CPU와 지연을 줄일 수 있다.",
        "송출 측 TURN 사용 최대 100% 제거 가능. transcoding 회피 시 서버 CPU 20~60% 절감 가능. 장비 지원 프로토콜에 크게 의존한다.",
        [
            "장비별 ingest matrix를 만든다: RTSP, RTP, SRT, WHIP, vendor SDK.",
            "MediaMTX ingest를 우선 사용하고 dashboard 수신은 WHEP WebRTC로 유지한다.",
            "GPS/telemetry/명령은 영상 packet에 섞지 말고 MQTT/HTTP/MAVLink 계열로 분리한다.",
        ],
        "상",
        "프로토콜마다 방화벽, 인증, 재연결, timestamp 처리 방식이 다르다. 장비별 검증이 필요하다.",
        ["publisher TURN 사용률", "server CPU", "ingest-to-play latency", "transcoding 여부", "codec passthrough 여부"],
        "ingest",
        "상",
    ),
    Option(
        5,
        "TURN UDP 우선, TCP/TLS fallback",
        "실시간 미디어에는 UDP relay를 우선 사용하고, TCP/TLS TURN은 막힌 망의 최후 fallback으로 둔다.",
        "TCP는 packet 손실 시 뒤 packet까지 기다리는 head-of-line blocking 문제가 있어 실시간 미디어 지연과 jitter에 불리할 수 있다.",
        "relay latency 5~30% 개선 가능. packet loss가 있는 무선망에서는 체감 차이가 더 날 수 있다.",
        [
            "ICE server list 순서를 UDP TURN 우선으로 둔다.",
            "TCP/TLS TURN은 정책상 UDP가 막힌 망에서만 사용하게 한다.",
            "candidate type뿐 아니라 transport protocol도 getStats로 기록한다.",
        ],
        "하중",
        "기업/군망 중 UDP가 막힌 환경은 TCP/TLS fallback이 반드시 필요하다. UDP-only로 가면 연결성이 떨어진다.",
        ["selected candidate protocol", "RTT", "jitter", "packet loss", "relay Mbps"],
        "udp",
        "상",
    ),
    Option(
        6,
        "coturn quota / bandwidth guardrail",
        "정상 최적화가 아니라 폭주와 오남용을 막아 TURN 서버가 무너지는 상황을 줄인다.",
        "coturn은 relay endpoint port range와 quota, bandwidth 계열 운영 옵션을 제공한다. 제한값을 두면 비정상 클라이언트나 과도한 접속이 전체 서비스를 죽이는 일을 줄일 수 있다.",
        "평상시 속도 개선은 작지만, 장애 상황에서 트래픽 상한을 고정한다. 최악 상황 CPU/NIC 포화 방지 효과가 크다.",
        [
            "`total-quota`, `user-quota`, `max-bps` 후보값을 운영 환경별로 정한다.",
            "장비 계정과 viewer 계정의 TURN 권한을 분리한다.",
            "quota 초과 시 UI와 로그가 명확히 나오도록 error contract를 만든다.",
        ],
        "중",
        "상한을 너무 낮게 잡으면 정상 작전 중 스트림이 막힐 수 있다. 부하 테스트 후 단계적으로 적용해야 한다.",
        ["allocation 거절 수", "relay Mbps", "CPU", "NIC 사용률", "quota 초과 이벤트"],
        "quota",
        "상",
    ),
    Option(
        7,
        "TURN primary/secondary 분산",
        "3478/3479를 단순 백업이 아니라 부하 분산과 장애 격리 용도로 사용한다.",
        "coturn 성능 문서는 load balancing과 network optimization을 별도 주제로 다룬다. TURN은 relay 트래픽이 직접 NIC/CPU에 걸리므로 여러 인스턴스로 분산하는 것이 효과적이다.",
        "단일 TURN 서버 CPU/NIC 부하 30~50% 분산 가능. 실제 개선은 클라이언트 분배 정책에 따라 달라진다.",
        [
            "publisher와 viewer 또는 group/망 단위로 primary/secondary 우선순위를 다르게 준다.",
            "두 TURN 서버의 relay port range를 분리한다.",
            "한쪽 장애 시 ICE server API가 자동으로 healthy TURN만 반환하도록 한다.",
        ],
        "중",
        "브라우저의 ICE 선택은 서버가 완전히 통제하지 못한다. 분산은 ICE list 순서와 credential 정책으로 유도해야 한다.",
        ["TURN별 allocation 수", "TURN별 relay Mbps", "TURN별 CPU/NIC", "failover 성공률"],
        "balance",
        "상",
    ),
    Option(
        8,
        "폐쇄망 direct 후보 우선 profile",
        "폐쇄망에서는 내부 IP가 실제로 reachable하므로 공개망과 다른 candidate 정책을 쓴다.",
        "공개망에서는 private IP 후보가 외부 클라이언트에 쓸모없지만, 폐쇄망 한 대역에서는 private IP가 가장 빠른 직접 후보일 수 있다.",
        "폐쇄망 TURN 사용 50~90% 감소 가능. 내부 LAN 품질이 좋으면 거의 direct로 처리할 수 있다.",
        [
            "public, closed, hybrid profile을 분리한다.",
            "closed profile에서는 내부 도달 가능한 MediaMTX host와 자체 STUN/TURN을 사용한다.",
            "폐쇄망 smoke는 인터넷 차단 상태에서 direct/relay 비율을 따로 기록한다.",
        ],
        "중상",
        "profile을 잘못 적용하면 공개망 사용자가 private candidate만 받아 연결 실패할 수 있다.",
        ["closed profile relay 비율", "internal direct latency", "external dependency count", "offline smoke 성공률"],
        "closed",
        "상",
    ),
    Option(
        9,
        "Adaptive bitrate / resolution / fps",
        "TURN relay를 타는 스트림은 네트워크와 서버 부담을 고려해 품질을 동적으로 낮춘다.",
        "TURN relay 경로에서는 모든 미디어 packet이 서버 대역폭을 소비한다. bitrate와 fps를 낮추면 relay Mbps가 직접 줄어든다.",
        "TURN relay Mbps 20~60% 감소 가능. 영상 품질과 식별성이 낮아질 수 있다.",
        [
            "relay candidate 감지 시 기본 bitrate/fps downshift 정책을 적용한다.",
            "선택/확대 스트림은 고품질, 비선택 스트림은 저품질로 둔다.",
            "영상이 아닌 telemetry, AI event, thumbnail을 보조 정보로 활용한다.",
        ],
        "상",
        "너무 낮은 bitrate는 군집/사람/차량 식별성을 해칠 수 있다. 임무별 최소 품질 기준이 필요하다.",
        ["bitrate", "fps", "packet loss", "frame drop", "operator 식별 가능성"],
        "adaptive",
        "중상",
    ),
    Option(
        10,
        "coturn OS/NIC 튜닝",
        "TURN 서버 구현을 바꾸기 전에 운영체제 한계와 네트워크 큐를 먼저 튜닝한다.",
        "coturn 성능 문서는 비동기 I/O와 threading 모델, 파일 디스크립터 한계, 네트워크 최적화를 언급한다. 동시 세션은 OS limit에 막힐 수 있다.",
        "동시 세션 한계 2~5배 개선 가능성. 서버 NIC/CPU/커널 설정에 크게 의존한다.",
        [
            "systemd `LimitNOFILE`, ulimit, UDP buffer, ephemeral port, conntrack 상태를 점검한다.",
            "NIC RSS/RPS, interrupt 분산, 로그 레벨을 서버 스펙에 맞춘다.",
            "튜닝 전후 같은 relay smoke로 CPU/NIC/packet loss를 비교한다.",
        ],
        "중상",
        "커널/네트워크 튜닝은 잘못하면 서버 전체 네트워크 안정성에 영향을 준다. 단계별 적용과 rollback이 필요하다.",
        ["open files", "UDP receive errors", "CPU softirq", "NIC drops", "relay Mbps"],
        "os",
        "중상",
    ),
    Option(
        11,
        "Ephemeral TURN credential",
        "짧은 TTL의 TURN credential로 허가된 사용자와 장비만 relay를 쓰게 한다.",
        "TURN credential이 오래 열려 있거나 공유되면 무단 relay 사용으로 서버 부담이 생길 수 있다. coturn은 long-term credential과 REST/shared secret 계열 운용을 지원한다.",
        "정상 트래픽 속도 개선은 작지만, 무단/낭비 relay 사용을 크게 줄인다. 보안 측면의 절감책이다.",
        [
            "auth-policy 또는 media-control이 짧은 TTL credential을 발급한다.",
            "stream 권한과 TURN credential 발급을 연결한다.",
            "credential 만료와 refresh 실패 시 UX를 명확히 처리한다.",
        ],
        "중",
        "TTL이 너무 짧으면 정상 세션 중 재연결 실패가 늘 수 있다. clock sync와 refresh 타이밍이 중요하다.",
        ["credential 발급 수", "실패한 allocation", "무권한 relay 시도", "credential TTL"],
        "credential",
        "중",
    ),
    Option(
        12,
        "Rust TURN PoC",
        "coturn이 실제 CPU 병목으로 확인된 뒤에만 Rust TURN 대체 가능성을 실험한다.",
        "Rust는 메모리 안정성과 고성능 네트워크 서버 구현에 장점이 있지만, TURN은 구현 언어보다 relay 트래픽 자체와 운영 성숙도가 더 큰 변수다.",
        "CPU 0~30% 개선 가능성. 단, 실제 개선이 없거나 운영 리스크가 더 클 수 있다.",
        [
            "coturn과 Rust TURN을 같은 서버/같은 bitrate/같은 세션 수로 비교한다.",
            "기능 호환성: UDP/TCP/TLS, auth, realm, quota, log, metrics, browser 호환성을 검증한다.",
            "운영 전환이 아니라 shadow benchmark로만 시작한다.",
        ],
        "상",
        "운영 검증, 보안 업데이트, 문서, 장애 대응 경험이 coturn보다 부족할 수 있다.",
        ["CPU", "memory", "allocation latency", "relay RTT", "browser compatibility", "crash/restart"],
        "rust",
        "후순위",
    ),
]


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont(BODY_FONT, BODY_FONT_PATH))
    pdfmetrics.registerFont(TTFont(HEAD_FONT, HEAD_FONT_PATH))


def lines(text: str, width: int = 52) -> list[str]:
    out: list[str] = []
    for paragraph in text.split("\n"):
        paragraph = paragraph.strip()
        if not paragraph:
            out.append("")
        else:
            out.extend(wrap(paragraph, width=width, break_long_words=False, replace_whitespace=False))
    return out


class Pdf:
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
        c.setFillColor(colors.HexColor("#071B2D"))
        c.rect(0, PAGE_HEIGHT - 34, PAGE_WIDTH, 34, stroke=0, fill=1)
        c.setFont(HEAD_FONT, 8)
        c.setFillColor(colors.white)
        c.drawString(MARGIN_X, PAGE_HEIGHT - 22, "GCS-Saker TURN Load Reduction Report")
        c.drawRightString(PAGE_WIDTH - MARGIN_X, PAGE_HEIGHT - 22, f"{self.page:02d}")
        c.setFont(HEAD_FONT, 18)
        c.setFillColor(colors.HexColor("#101820"))
        c.drawString(MARGIN_X, TOP_Y, title)
        if subtitle:
            c.setFont(BODY_FONT, 9.5)
            c.setFillColor(colors.HexColor("#607080"))
            c.drawString(MARGIN_X, TOP_Y - 19, subtitle)
        c.setStrokeColor(colors.HexColor("#C6D0DB"))
        c.line(MARGIN_X, TOP_Y - 30, PAGE_WIDTH - MARGIN_X, TOP_Y - 30)

    def footer(self) -> None:
        self.c.setFont(BODY_FONT, 7.5)
        self.c.setFillColor(colors.HexColor("#6C7680"))
        self.c.drawString(MARGIN_X, 28, "A4AI / GCS-Saker internal technical report")
        self.c.drawRightString(PAGE_WIDTH - MARGIN_X, 28, f"page {self.page}")

    def heading(self, x: float, y: float, text: str) -> float:
        self.c.setFont(HEAD_FONT, 11)
        self.c.setFillColor(colors.HexColor("#0A4F7A"))
        self.c.drawString(x, y, text)
        return y - 15

    def para(self, x: float, y: float, text: str, width: int = 62, size: float = 8.8, leading: float = 12) -> float:
        self.c.setFont(BODY_FONT, size)
        self.c.setFillColor(colors.HexColor("#101820"))
        for line in lines(text, width):
            if y < BOTTOM_Y + 10:
                break
            self.c.drawString(x, y, line)
            y -= leading
        return y

    def bullet(self, x: float, y: float, items: list[str], width: int = 60) -> float:
        self.c.setFont(BODY_FONT, 8.4)
        self.c.setFillColor(colors.HexColor("#101820"))
        for item in items:
            wrapped = lines(item, width)
            if not wrapped:
                continue
            self.c.circle(x + 3, y + 3, 1.8, fill=1, stroke=0)
            self.c.drawString(x + 12, y, wrapped[0])
            y -= 11.5
            for line in wrapped[1:]:
                self.c.drawString(x + 12, y, line)
                y -= 11.5
            y -= 2
        return y

    def callout(self, x: float, y: float, w: float, h: float, title: str, body: str, fill: str = "#EFF6FF") -> None:
        self.c.setFillColor(colors.HexColor(fill))
        self.c.setStrokeColor(colors.HexColor("#75AADB"))
        self.c.roundRect(x, y - h, w, h, 8, stroke=1, fill=1)
        self.c.setFont(HEAD_FONT, 9)
        self.c.setFillColor(colors.HexColor("#064B7A"))
        self.c.drawString(x + 10, y - 16, title)
        self.para(x + 10, y - 31, body, width=58, size=7.9, leading=10.5)

    def small_box(self, x: float, y: float, w: float, h: float, text: str, fill: str) -> None:
        self.c.setFillColor(colors.HexColor(fill))
        self.c.setStrokeColor(colors.HexColor("#8DA2B5"))
        self.c.roundRect(x, y - h, w, h, 7, stroke=1, fill=1)
        self.c.setFont(HEAD_FONT, 7.8)
        self.c.setFillColor(colors.HexColor("#102030"))
        for idx, line in enumerate(lines(text, 12)):
            self.c.drawCentredString(x + w / 2, y - 15 - idx * 9, line)

    def arrow(self, x1: float, y1: float, x2: float, y2: float) -> None:
        self.c.setStrokeColor(colors.HexColor("#506070"))
        self.c.line(x1, y1, x2, y2)
        self.c.line(x2, y2, x2 - 5, y2 + 3)
        self.c.line(x2, y2, x2 - 5, y2 - 3)

    def diagram(self, kind: str, x: float, y: float, w: float, h: float) -> None:
        self.c.setFillColor(colors.HexColor("#FBFCFE"))
        self.c.setStrokeColor(colors.HexColor("#D9E2EC"))
        self.c.roundRect(x, y - h, w, h, 9, stroke=1, fill=1)
        if kind == "direct":
            self.small_box(x + 20, y - 32, 78, 34, "Publisher", "#FFF7E8")
            self.small_box(x + 160, y - 32, 78, 34, "MediaMTX", "#E8F2FF")
            self.small_box(x + 300, y - 32, 78, 34, "Dashboard", "#EEFDF5")
            self.small_box(x + 160, y - 108, 78, 34, "TURN fallback", "#FFECEC")
            self.arrow(x + 98, y - 49, x + 160, y - 49)
            self.arrow(x + 238, y - 49, x + 300, y - 49)
            self.arrow(x + 98, y - 66, x + 160, y - 108)
            self.arrow(x + 238, y - 108, x + 300, y - 66)
        elif kind == "candidate":
            labels = ["host", "srflx", "relay", "private/loopback 제거"]
            for i, label in enumerate(labels):
                self.small_box(x + 24 + i * 95, y - 48, 76, 38, label, ["#EEFDF5", "#E8F2FF", "#FFF7E8", "#FFECEC"][i])
                if i < len(labels) - 1:
                    self.arrow(x + 100 + i * 95, y - 68, x + 119 + i * 95, y - 68)
        elif kind == "lazy":
            labels = ["선택 스트림", "WebRTC 연결", "비선택 스트림", "paused/snapshot"]
            coords = [(x + 35, y - 36), (x + 210, y - 36), (x + 35, y - 105), (x + 210, y - 105)]
            for label, (bx, by) in zip(labels, coords):
                self.small_box(bx, by, 105, 36, label, "#E8F2FF" if "WebRTC" in label else "#F8FAFC")
            self.arrow(x + 140, y - 54, x + 210, y - 54)
            self.arrow(x + 140, y - 123, x + 210, y - 123)
        elif kind == "ingest":
            labels = ["Drone H.264", "RTSP/SRT/RTP", "MediaMTX", "WHEP Viewer"]
            for i, label in enumerate(labels):
                self.small_box(x + 18 + i * 100, y - 58, 82, 38, label, "#EEFDF5" if i != 1 else "#FFF7E8")
                if i < 3:
                    self.arrow(x + 100 + i * 100, y - 77, x + 118 + i * 100, y - 77)
        elif kind == "udp":
            self.small_box(x + 30, y - 48, 92, 36, "UDP TURN 우선", "#EEFDF5")
            self.small_box(x + 180, y - 48, 92, 36, "TCP/TLS fallback", "#FFF7E8")
            self.small_box(x + 330, y - 48, 92, 36, "제한망", "#FFECEC")
            self.arrow(x + 122, y - 66, x + 180, y - 66)
            self.arrow(x + 272, y - 66, x + 330, y - 66)
        elif kind == "quota":
            labels = ["정상 사용자", "quota", "TURN", "폭주 차단"]
            for i, label in enumerate(labels):
                self.small_box(x + 30 + i * 95, y - 58, 78, 38, label, "#E8F2FF" if i < 3 else "#FFECEC")
                if i < 3:
                    self.arrow(x + 108 + i * 95, y - 76, x + 125 + i * 95, y - 76)
        elif kind == "balance":
            self.small_box(x + 30, y - 60, 90, 38, "ICE API", "#E8F2FF")
            self.small_box(x + 205, y - 30, 92, 38, "TURN 3478", "#EEFDF5")
            self.small_box(x + 205, y - 100, 92, 38, "TURN 3479", "#EEFDF5")
            self.arrow(x + 120, y - 78, x + 205, y - 49)
            self.arrow(x + 120, y - 78, x + 205, y - 119)
        elif kind == "closed":
            labels = ["공개망 profile", "공인 후보", "폐쇄망 profile", "내부 후보"]
            coords = [(x + 35, y - 36), (x + 210, y - 36), (x + 35, y - 105), (x + 210, y - 105)]
            for label, (bx, by) in zip(labels, coords):
                self.small_box(bx, by, 105, 36, label, "#E8F2FF")
            self.arrow(x + 140, y - 54, x + 210, y - 54)
            self.arrow(x + 140, y - 123, x + 210, y - 123)
        elif kind == "adaptive":
            labels = ["relay 감지", "bitrate↓", "fps↓", "TURN Mbps↓"]
            for i, label in enumerate(labels):
                self.small_box(x + 30 + i * 95, y - 58, 78, 38, label, "#FFF7E8" if i < 3 else "#EEFDF5")
                if i < 3:
                    self.arrow(x + 108 + i * 95, y - 76, x + 125 + i * 95, y - 76)
        elif kind == "os":
            labels = ["fd limit", "UDP buffer", "RPS/RSS", "NIC drops↓"]
            for i, label in enumerate(labels):
                self.small_box(x + 30 + i * 95, y - 58, 78, 38, label, "#F8FAFC")
                if i < 3:
                    self.arrow(x + 108 + i * 95, y - 76, x + 125 + i * 95, y - 76)
        elif kind == "credential":
            labels = ["Auth", "짧은 TTL", "TURN credential", "허가된 relay"]
            for i, label in enumerate(labels):
                self.small_box(x + 22 + i * 105, y - 58, 88, 38, label, "#E8F2FF")
                if i < 3:
                    self.arrow(x + 110 + i * 105, y - 76, x + 127 + i * 105, y - 76)
        elif kind == "rust":
            self.small_box(x + 60, y - 45, 95, 38, "coturn 기준", "#E8F2FF")
            self.small_box(x + 230, y - 45, 95, 38, "Rust TURN PoC", "#FFF7E8")
            self.small_box(x + 145, y - 112, 95, 38, "동일 부하 비교", "#EEFDF5")
            self.arrow(x + 155, y - 65, x + 188, y - 112)
            self.arrow(x + 230, y - 65, x + 198, y - 112)
        else:
            self.small_box(x + 40, y - 60, 100, 38, "측정", "#E8F2FF")
            self.small_box(x + 205, y - 60, 100, 38, "최적화", "#FFF7E8")
            self.small_box(x + 370, y - 60, 100, 38, "검증", "#EEFDF5")
            self.arrow(x + 140, y - 78, x + 205, y - 78)
            self.arrow(x + 305, y - 78, x + 370, y - 78)


def cover(pdf: Pdf) -> None:
    pdf.new_page("GCS-Saker TURN 서버 부하절감 최적화 보고서", "12개 최적화 방안의 근거, 개선 수치, 방안, 난이도 정리")
    c = pdf.c
    c.setFillColor(colors.HexColor("#071B2D"))
    c.roundRect(MARGIN_X, TOP_Y - 255, PAGE_WIDTH - 2 * MARGIN_X, 185, 16, stroke=0, fill=1)
    c.setFont(HEAD_FONT, 25)
    c.setFillColor(colors.white)
    c.drawString(MARGIN_X + 26, TOP_Y - 126, "TURN 부담을 줄이는")
    c.drawString(MARGIN_X + 26, TOP_Y - 160, "12가지 실전 최적화")
    c.setFont(BODY_FONT, 11)
    c.drawString(MARGIN_X + 26, TOP_Y - 198, "Direct ICE, MediaMTX candidate, lazy player, native ingest, coturn tuning")
    pdf.callout(
        MARGIN_X,
        TOP_Y - 305,
        PAGE_WIDTH - 2 * MARGIN_X,
        96,
        "핵심 결론",
        "TURN 서버를 Rust로 바꾸기 전에, TURN을 타지 않아도 되는 연결이 TURN을 타는 상황을 줄이는 것이 먼저다. 가장 큰 효과는 Direct ICE 성공률, MediaMTX candidate 정리, 대시보드 WebRTC lazy 연결에서 나온다.",
    )
    y = TOP_Y - 430
    y = pdf.heading(MARGIN_X, y, "보고서 구성")
    pdf.bullet(
        MARGIN_X,
        y,
        [
            "총 16페이지: 표지, 판단 요약, 12개 상세 페이지, 실행 로드맵, 근거/출처.",
            "각 항목은 근거, 기대 개선 수치, 구현 방안, 난이도, 리스크, 측정 지표, 그림을 포함한다.",
            "개선 수치는 현재 GCS-Saker 구조에서 예상되는 범위이며, 실제 값은 candidate type과 relay Mbps 계측 후 확정한다.",
        ],
        width=70,
    )
    pdf.footer()


def summary(pdf: Pdf) -> None:
    pdf.new_page("요약 판단", "TURN을 줄이는 순서는 구조 개선 → 연결 정책 → 운영 튜닝 → 구현체 실험")
    pdf.diagram("default", MARGIN_X, TOP_Y - 55, PAGE_WIDTH - 2 * MARGIN_X, 145)
    y = TOP_Y - 230
    y = pdf.heading(MARGIN_X, y, "가장 먼저 할 것")
    y = pdf.bullet(
        MARGIN_X,
        y,
        [
            "1순위: #292 MediaMTX candidate 정리. 외부에서 닿지 않는 private/loopback 후보를 줄인다.",
            "2순위: selected ICE candidate type 계측. host/srflx/relay 비율을 모르면 개선 여부를 알 수 없다.",
            "3순위: 대시보드 lazy WebRTC 연결. 실제로 보는 스트림만 WHEP 연결을 연다.",
            "4순위: coturn guardrail. quota와 bandwidth 상한으로 폭주를 막는다.",
        ],
        width=72,
    )
    y = pdf.heading(MARGIN_X, y, "예상 조합 효과")
    pdf.callout(
        MARGIN_X,
        y,
        PAGE_WIDTH - 2 * MARGIN_X,
        82,
        "현실적 기대값",
        "#292 candidate 정리 + lazy WebRTC 연결 + direct ICE 우선 정책을 묶으면 TURN allocation과 relay traffic을 40~80%까지 줄일 가능성이 있다. 단, 외부망/NAT/장비 프로토콜에 따라 실제 수치는 달라진다.",
        fill="#EEFDF5",
    )
    y -= 105
    y = pdf.heading(MARGIN_X, y, "Rust TURN의 위치")
    pdf.para(
        MARGIN_X,
        y,
        "Rust TURN은 흥미로운 실험 카드지만 지금 당장의 운영 최적화 1순위는 아니다. coturn CPU가 실제 병목인지 확인하기 전에는 구현체 교체보다 relay 사용률 감소와 coturn 운영 튜닝이 더 안전하다.",
        width=74,
    )
    pdf.footer()


def option_page(pdf: Pdf, option: Option) -> None:
    pdf.new_page(f"{option.index:02d}. {option.title}", f"우선순위 {option.priority} / 난이도 {option.difficulty}")
    pdf.callout(MARGIN_X, TOP_Y - 48, PAGE_WIDTH - 2 * MARGIN_X, 58, "한 줄 판단", option.one_line)
    pdf.diagram(option.diagram, MARGIN_X, TOP_Y - 128, PAGE_WIDTH - 2 * MARGIN_X, 140)
    y = TOP_Y - 295
    left = MARGIN_X
    right = PAGE_WIDTH / 2 + 8
    y_left = y
    y_right = y
    y_left = pdf.heading(left, y_left, "근거")
    y_left = pdf.para(left, y_left, option.basis, width=39, size=8.2, leading=11)
    y_left = pdf.heading(left, y_left - 4, "기대 개선 수치")
    y_left = pdf.para(left, y_left, option.expected, width=39, size=8.2, leading=11)
    y_left = pdf.heading(left, y_left - 4, "리스크")
    pdf.para(left, y_left, option.risk, width=39, size=8.2, leading=11)
    y_right = pdf.heading(right, y_right, "구현 방안")
    y_right = pdf.bullet(right, y_right, option.method, width=34)
    y_right = pdf.heading(right, y_right - 2, "측정 지표")
    y_right = pdf.bullet(right, y_right, option.metric, width=34)
    pdf.callout(
        right,
        BOTTOM_Y + 92,
        PAGE_WIDTH - right - MARGIN_X,
        64,
        "적용 판단",
        f"난이도는 {option.difficulty}, 우선순위는 {option.priority}. 실제 적용 전후에 측정 지표를 같은 조건으로 비교한다.",
        fill="#FFF7E8",
    )
    pdf.footer()


def roadmap(pdf: Pdf) -> None:
    pdf.new_page("실행 로드맵", "작게 측정하고, 직접 연결률을 높인 뒤, TURN 튜닝과 실험으로 넘어간다")
    stages = [
        ("1단계", "#292 candidate 정리\nselected candidate type 저장\nrelay 비율 baseline"),
        ("2단계", "대시보드 lazy WebRTC\n선택/핀/팝업 stream만 연결\n비선택 preview 경량화"),
        ("3단계", "coturn guardrail\nUDP 우선\nprimary/secondary 분산"),
        ("4단계", "장비 native ingest matrix\nRTSP/SRT/RTP/WHIP benchmark\n폐쇄망 direct profile"),
        ("5단계", "adaptive bitrate/fps\nOS/NIC tuning\nRust TURN shadow benchmark"),
    ]
    y = TOP_Y - 70
    for idx, (stage, body) in enumerate(stages):
        x = MARGIN_X + (idx % 2) * 255
        if idx == 4:
            x = MARGIN_X + 126
        pdf.c.setFillColor(colors.HexColor("#F8FAFC"))
        pdf.c.setStrokeColor(colors.HexColor("#92A8BD"))
        pdf.c.roundRect(x, y - 100, 215, 86, 9, stroke=1, fill=1)
        pdf.c.setFont(HEAD_FONT, 11)
        pdf.c.setFillColor(colors.HexColor("#0A4F7A"))
        pdf.c.drawString(x + 12, y - 34, stage)
        pdf.para(x + 12, y - 52, body, width=28, size=8.2, leading=10.5)
        if idx % 2 == 1:
            y -= 115
    y = BOTTOM_Y + 145
    y = pdf.heading(MARGIN_X, y, "PR/이슈 작성 기준")
    pdf.bullet(
        MARGIN_X,
        y,
        [
            "각 단계는 독립 이슈로 관리한다. 단, candidate 계측과 lazy 연결은 같은 branch에서 묶어도 된다.",
            "PR에는 개선 수치 예상치가 아니라 실제 측정값을 적는다.",
            "테스트는 unit이 아니라 runtime smoke와 external NAT 검증까지 포함한다.",
            "공유기 포트 변경이 필요한 단계는 작업 전에 별도 승인/요청으로 분리한다.",
        ],
        width=72,
    )
    pdf.footer()


def sources(pdf: Pdf) -> None:
    pdf.new_page("근거와 출처", "공식 문서 중심으로 정리")
    y = TOP_Y - 58
    y = pdf.heading(MARGIN_X, y, "주요 근거")
    y = pdf.bullet(
        MARGIN_X,
        y,
        [
            "WebRTC 공식 문서: RTCPeerConnection은 ICE server 설정으로 STUN/TURN 후보를 수집하고, signaling을 통해 offer/answer와 ICE candidate를 교환한다.",
            "MDN WebRTC connectivity: WebRTC 연결은 signaling, SDP, ICE, NAT traversal이 결합되어 media/data 전송 경로를 만든다.",
            "coturn turnserver 문서: relay endpoint port range, external IP, fingerprint, credential, quota/bandwidth 관련 운영 옵션을 제공한다.",
            "coturn performance 문서: 비동기 I/O, threading, 파일 디스크립터 한계, 네트워크 최적화, load balancing이 TURN 성능에 영향을 준다.",
        ],
        width=72,
    )
    y = pdf.heading(MARGIN_X, y - 4, "참고 URL")
    y = pdf.bullet(
        MARGIN_X,
        y,
        [
            "https://webrtc.org/getting-started/peer-connections",
            "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity",
            "https://github.com/coturn/coturn",
            "https://github.com/coturn/coturn/wiki/turnserver",
            "https://github.com/coturn/coturn/wiki/TURN-Performance-and-Load-Balance",
        ],
        width=72,
    )
    y = pdf.heading(MARGIN_X, y - 4, "수치 해석 주의")
    pdf.para(
        MARGIN_X,
        y,
        "이 보고서의 개선 수치는 GCS-Saker 현재 구조를 기준으로 한 예상 범위다. 실제 수치는 Server-01/Server-02의 NIC, CPU, NAT, 공유기 포트포워딩, 장비 codec, 동시 viewer 수에 따라 달라진다. 따라서 첫 작업은 반드시 baseline 계측이다.",
        width=76,
    )
    pdf.footer()


def main() -> None:
    register_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdf = Pdf(OUTPUT)
    cover(pdf)
    summary(pdf)
    for option in OPTIONS:
        option_page(pdf, option)
    roadmap(pdf)
    sources(pdf)
    assert pdf.page == 16, f"expected 16 pages, got {pdf.page}"
    pdf.save()
    print(OUTPUT)
    print(f"pages={pdf.page}")


if __name__ == "__main__":
    main()
