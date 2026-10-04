/** Работа с микрофоном: формат записи, поток, уровень, коды ошибок. */

const CANDIDATES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];

export type MicErrorCode = "mic_denied" | "mic_missing" | "mic_insecure" | "unsupported";

/**
 * Формат записи: null — браузер не умеет MediaRecorder вовсе; "" — ни один из
 * кандидатов не подошёл, пишем в формате браузера по умолчанию.
 */
export function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function micErrorCode(err: unknown): MicErrorCode {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "mic_denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "mic_missing";
  return "unsupported";
}

export async function openMicrophone(): Promise<MediaStream> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error("insecure"), { scribeCode: "mic_insecure" as MicErrorCode });
  }
  return navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
}

/**
 * Уровень громкости 0..1 раз в 150 мс; возвращает функцию остановки.
 * Индикатор — подсказка, не условие записи: без AudioContext запись идёт,
 * просто без «пульса».
 */
export function watchLevel(stream: MediaStream, onLevel: (level: number) => void): () => void {
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return () => undefined;
  }
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  const timer = window.setInterval(() => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    onLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
  }, 150);
  return () => {
    window.clearInterval(timer);
    void context.close().catch(() => undefined);
  };
}
