export type SettingsTab = "time" | "streaming" | "security" | "motion" | "map" | "account";
export type PolicySettingsTab = Exclude<SettingsTab, "time" | "motion">;

export const SETTINGS_TABS: readonly { id: SettingsTab; label: string }[] = [
  { id: "time", label: "시간 동기화" },
  { id: "streaming", label: "스트리밍" },
  { id: "security", label: "보안" },
  { id: "motion", label: "화면 효과" },
  { id: "map", label: "지도" },
  { id: "account", label: "계정/권한" },
] as const;

export const SETTINGS_POLICIES = {
  streaming: [["CCTV 기본", "4x4 / 저화질 preview"], ["선택 확대", "고화질 main stream"], ["Fallback", "WebRTC 실패 시 HLS 확인"], ["ICE", "자체 STUN/TURN 우선"]],
  security: [["세션", "HttpOnly refresh token"], ["접근", "허용 대역/권한 그룹"], ["감사", "인증/스트림 이벤트 기록"], ["보호", "CSRF / XSS 기본 정책"]],
  map: [["지도 소스", "공개망 위성 / 오프라인 타일"], ["기본 중심", "선택 스트림 GPS"], ["마커", "스트림/사용자 지정 핀"], ["축척", "500 m 기본"]],
  account: [["사용자", "닉네임 / 역할"], ["그룹", "상위/하위 조직 권한"], ["송출 계정", "장비별 최소 권한"], ["감사", "계정 변경 이력"]],
} satisfies Record<PolicySettingsTab, Array<[string, string]>>;

export function settingsTabTitle(tab: PolicySettingsTab): string {
  if (tab === "streaming") return "스트리밍 수신/송출 정책";
  if (tab === "security") return "인증/인가 및 감사 정책";
  if (tab === "map") return "지도 소스 및 마커 정책";
  return "계정/조직 권한 정책";
}
