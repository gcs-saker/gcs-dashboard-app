const OPUS_CLOCK_RATE = 48_000;
const OPUS_MAX_AVERAGE_BITRATE = 32_000;
const PACKET_TIME_MS = 20;

export interface TalkbackAudioSettingsResult {
  compliant: boolean;
  mismatches: string[];
}

export function applyTalkbackOpusPolicy(sdp: string): string {
  const lines = sdp.split(/\r?\n/).filter(Boolean);
  const opusPayload = findOpusPayload(lines);
  if (!opusPayload) return sdp;
  const withoutPolicy = lines.filter((line) => !line.startsWith(`a=fmtp:${opusPayload} `) && line !== `a=ptime:${PACKET_TIME_MS}`);
  const audioIndex = withoutPolicy.findIndex((line) => line.startsWith("m=audio "));
  if (audioIndex < 0) return sdp;
  const policy = [
    `a=ptime:${PACKET_TIME_MS}`,
    `a=fmtp:${opusPayload} minptime=${PACKET_TIME_MS};useinbandfec=1;usedtx=0;stereo=0;sprop-stereo=0;maxaveragebitrate=${OPUS_MAX_AVERAGE_BITRATE}`,
  ];
  withoutPolicy.splice(audioSectionEnd(withoutPolicy, audioIndex), 0, ...policy);
  return `${withoutPolicy.join("\r\n")}\r\n`;
}

export function inspectTalkbackAudioSettings(settings: MediaTrackSettings): TalkbackAudioSettingsResult {
  const mismatches: string[] = [];
  if (settings.sampleRate !== undefined && settings.sampleRate !== OPUS_CLOCK_RATE) {
    mismatches.push(`sampleRate=${settings.sampleRate}`);
  }
  if (settings.channelCount !== undefined && settings.channelCount !== 1) {
    mismatches.push(`channelCount=${settings.channelCount}`);
  }
  for (const field of ["echoCancellation", "noiseSuppression", "autoGainControl"] as const) {
    if (settings[field] === false) mismatches.push(`${field}=false`);
  }
  return { compliant: mismatches.length === 0, mismatches };
}

function findOpusPayload(lines: string[]): string | null {
  const mapping = lines.find((line) => /^a=rtpmap:\d+ opus\/48000(?:\/\d+)?$/i.test(line));
  return mapping?.match(/^a=rtpmap:(\d+)/)?.[1] ?? null;
}

function audioSectionEnd(lines: string[], audioIndex: number): number {
  const nextMediaOffset = lines.slice(audioIndex + 1).findIndex((line) => line.startsWith("m="));
  return nextMediaOffset < 0 ? lines.length : audioIndex + nextMediaOffset + 1;
}

