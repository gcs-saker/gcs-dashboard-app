import type {
  AudioCaptureMode,
  PublisherDeviceStatus,
  PublisherGpsStatus,
  PublisherStepId,
  PublisherStepState,
  WebcamPublisherStatus,
} from "./publisherContracts";

export function getGpsStatusLabel(status: PublisherGpsStatus): string {
  const labels: Record<PublisherGpsStatus, string> = {
    idle: "대기",
    requesting: "권한 요청",
    active: "수신 중",
    unavailable: "미지원",
    error: "오류",
  };
  return labels[status];
}

export function getDeviceStatusDetail(status: PublisherDeviceStatus, videoCount: number, audioCount: number): string {
  if (status === "loading") {
    return "장치 목록 확인 중";
  }
  if (status === "loaded") {
    return `카메라 ${videoCount}개 / 마이크 ${audioCount}개 감지`;
  }
  if (status === "unavailable") {
    return "브라우저 장치 목록 API를 사용할 수 없습니다.";
  }
  if (status === "error") {
    return "장치 목록을 읽지 못했습니다.";
  }
  return "장치 목록 대기";
}

export function getAudioModeDetail(mode: AudioCaptureMode): string {
  if (mode === "quality") {
    return "잡음/에코 처리를 켜지만 지연이 늘 수 있습니다.";
  }
  return "브라우저 음성 후처리를 줄여 지연을 우선합니다.";
}

export function isBusy(status: WebcamPublisherStatus): boolean {
  return [
    "requesting-camera",
    "creating-offer",
    "gathering-ice",
    "sending-offer",
    "signaling-complete",
    "connecting-media",
    "reconnecting",
  ].includes(status);
}

export function getStatusLabel(status: WebcamPublisherStatus): string {
  const labels: Record<WebcamPublisherStatus, string> = {
    idle: "대기",
    "requesting-camera": "카메라 권한 요청",
    previewing: "미리보기 준비",
    "creating-offer": "Offer 생성",
    "gathering-ice": "ICE 후보 수집",
    "sending-offer": "WHIP 전송",
    "signaling-complete": "시그널링 완료",
    "connecting-media": "미디어 연결",
    published: "송출 중",
    reconnecting: "재연결 중",
    error: "오류",
    unsupported: "지원 안 됨",
  };
  return labels[status];
}

export function getStatusDetail(status: WebcamPublisherStatus): string {
  const details: Record<WebcamPublisherStatus, string> = {
    idle: "카메라를 준비하면 WebRTC 송출 단계를 시작할 수 있습니다.",
    "requesting-camera": "브라우저 카메라와 마이크 권한을 요청하고 있습니다.",
    previewing: "카메라 미리보기가 준비됐습니다. 시그널링을 시작할 수 있습니다.",
    "creating-offer": "브라우저에서 WebRTC offer를 생성하고 있습니다.",
    "gathering-ice": "STUN/TURN ICE 서버를 이용해 후보를 수집하고 있습니다.",
    "sending-offer": "WHIP 엔드포인트로 offer SDP를 전송하고 있습니다.",
    "signaling-complete": "WHIP answer를 받았습니다. 미디어 연결을 확정합니다.",
    "connecting-media": "ICE 미디어 경로가 실제로 연결되는지 확인하고 있습니다.",
    published: "WebRTC 미디어 연결이 완료되어 송출 중입니다.",
    reconnecting: "송출 미디어 경로가 끊겨 재연결을 시도하고 있습니다.",
    error: "오류 내용을 확인한 뒤 다시 시도할 수 있습니다.",
    unsupported: "현재 브라우저 환경에서는 로컬 카메라 WebRTC 송출을 지원하지 않습니다.",
  };
  return details[status];
}

export function getPublisherSteps(status: WebcamPublisherStatus, failedStep: PublisherStepId | null): Array<{
  id: PublisherStepId;
  index: number;
  label: string;
  state: PublisherStepState;
}> {
  const activeStepByStatus: Partial<Record<WebcamPublisherStatus, PublisherStepId>> = {
    "requesting-camera": "camera",
    previewing: "camera",
    "creating-offer": "ice",
    "gathering-ice": "ice",
    "sending-offer": "signaling",
    "signaling-complete": "signaling",
    "connecting-media": "media",
    published: "media",
    reconnecting: "media",
  };
  const order: PublisherStepId[] = ["camera", "ice", "signaling", "media"];
  const labels: Record<PublisherStepId, string> = {
    camera: "카메라 준비",
    ice: "ICE 후보 수집",
    signaling: "WHIP 시그널링",
    media: "미디어 연결",
  };
  const activeStep = status === "error" ? failedStep : activeStepByStatus[status];
  const activeIndex = activeStep ? order.indexOf(activeStep) : -1;

  return order.map((id, index) => ({
    id,
    index: index + 1,
    label: labels[id],
    state: getPublisherStepState(status, index, activeIndex),
  }));
}

function getPublisherStepState(status: WebcamPublisherStatus, index: number, activeIndex: number): PublisherStepState {
  if (status === "error") {
    return index === Math.max(activeIndex, 0) ? "error" : index < Math.max(activeIndex, 0) ? "complete" : "pending";
  }
  if (status === "published") {
    return "complete";
  }
  if (activeIndex === -1) {
    return "pending";
  }
  if (index < activeIndex) {
    return "complete";
  }
  if (index === activeIndex) {
    return status === "previewing" || status === "signaling-complete" ? "complete" : "active";
  }
  return "pending";
}
