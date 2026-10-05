export const MAX_VIDEO_DURATION_SEC = 15 * 60;

export function getVideoDurationSeconds(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(0);
      return;
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = Number(video.duration);
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read video duration.'));
    };
    video.src = url;
  });
}

export async function assertClientVideoDuration(file) {
  if (!file) return;
  const duration = await getVideoDurationSeconds(file);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(
      'Could not determine video duration. Please upload a video of 15 minutes or less.'
    );
  }
  if (duration > MAX_VIDEO_DURATION_SEC) {
    const minutes = Math.ceil(duration / 60);
    throw new Error(
      `Video is too long (${minutes} minutes). Maximum allowed length is 15 minutes.`
    );
  }
}
