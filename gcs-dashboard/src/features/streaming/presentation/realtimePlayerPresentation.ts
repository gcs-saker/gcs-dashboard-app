export function playbackErrorTitle(errorMessage: string | null): string {
  if (errorMessage?.includes("authentication")) return "인증 서버 미연결";
  if (errorMessage?.includes("404")) return "스트림 경로 없음";
  if (errorMessage?.includes("502")) return "시그널링 경로 점검 필요";
  return "수신 경로 오류";
}

export function playbackErrorDescription(errorMessage: string | null): string {
  if (errorMessage?.includes("authentication")) {
    return "현재 미리보기 환경에서 인증 API가 응답하지 않아 재생 권한을 확인하지 못했습니다.";
  }
  if (errorMessage?.includes("404")) return "송출 path가 아직 등록되지 않았거나 MediaMTX 경로와 일치하지 않습니다.";
  if (errorMessage?.includes("502")) return "Edge proxy에서 signaling upstream으로 연결하지 못했습니다.";
  return "실시간 재생 경로를 열 수 없습니다.";
}
