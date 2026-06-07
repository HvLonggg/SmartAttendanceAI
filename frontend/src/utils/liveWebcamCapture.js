/**
 * Chụp nhiều khung liên tiếp từ react-webcam (base64) → Blob[],
 * phục vụ POST /api/recognize-live (liveness chống ảnh/video trên màn hình).
 */
export async function captureSequentialWebcamFrames(webcamRef, { count = 3, gapMs = 280 } = {}) {
  const blobs = [];
  for (let i = 0; i < count; i += 1) {
    const src = webcamRef?.current?.getScreenshot?.();
    if (!src) {
      throw new Error('NO_SCREENSHOT');
    }
    // eslint-disable-next-line no-await-in-loop
    const blob = await fetch(src).then((r) => r.blob());
    blobs.push(blob);
    if (i < count - 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, gapMs));
    }
  }
  return blobs;
}

export function buildRecognizeLiveFormData(blobs) {
  const fd = new FormData();
  blobs.forEach((b, i) => {
    fd.append('frames', b, `live_${i}.jpg`);
  });
  return fd;
}
