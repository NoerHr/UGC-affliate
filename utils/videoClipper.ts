// Browser-based Video Clip Editor using Canvas + MediaRecorder API
import type { ClipSegment, ClipConfig, TransitionType } from '../types';

// Generate a unique ID for segments
export function generateSegmentId(): string {
  return `seg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Extract a single frame from video at a given timestamp
export function extractVideoFrame(
  video: HTMLVideoElement,
  timestamp: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('Canvas context failed'));

    video.currentTime = timestamp;
    video.onseeked = () => {
      ctx.drawImage(video, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
      video.onseeked = null;
    };
    video.onerror = () => reject(new Error('Video seek failed'));
  });
}

// Generate random cut points
export function randomCutVideo(
  duration: number,
  numCuts: number,
  minLen: number = 0.5,
  maxLen: number = 5
): ClipSegment[] {
  const segments: ClipSegment[] = [];
  const cutPoints: number[] = [];

  // Generate random cut points
  for (let i = 0; i < numCuts - 1; i++) {
    cutPoints.push(Math.random() * duration);
  }
  cutPoints.sort((a, b) => a - b);

  // Create segments from cut points
  const allPoints = [0, ...cutPoints, duration];
  for (let i = 0; i < allPoints.length - 1; i++) {
    const start = allPoints[i];
    const end = allPoints[i + 1];
    const len = end - start;

    if (len >= minLen && len <= maxLen) {
      segments.push({
        id: generateSegmentId(),
        start: Math.round(start * 100) / 100,
        end: Math.round(end * 100) / 100,
        label: `Cut ${i + 1}`,
        enabled: true
      });
    }
  }

  return segments;
}

// Smart cut at regular beat intervals
export function smartCutVideo(
  duration: number,
  beatInterval: number
): ClipSegment[] {
  const segments: ClipSegment[] = [];
  let current = 0;
  let i = 1;

  while (current < duration) {
    const end = Math.min(current + beatInterval, duration);
    segments.push({
      id: generateSegmentId(),
      start: Math.round(current * 100) / 100,
      end: Math.round(end * 100) / 100,
      label: `Beat ${i}`,
      enabled: true
    });
    current = end;
    i++;
  }

  return segments;
}

// Equal split into N parts
export function equalSplitVideo(
  duration: number,
  parts: number
): ClipSegment[] {
  const segLength = duration / parts;
  const segments: ClipSegment[] = [];

  for (let i = 0; i < parts; i++) {
    segments.push({
      id: generateSegmentId(),
      start: Math.round(i * segLength * 100) / 100,
      end: Math.round((i + 1) * segLength * 100) / 100,
      label: `Part ${i + 1}`,
      enabled: true
    });
  }

  return segments;
}

// Parse manual timestamps string like "0:02, 0:05.5, 0:08"
export function parseTimestamps(
  input: string,
  duration: number
): ClipSegment[] {
  const parts = input.split(',').map(s => s.trim()).filter(Boolean);
  const times: number[] = [0];

  for (const part of parts) {
    const segments = part.split(':');
    let seconds = 0;
    if (segments.length === 2) {
      seconds = parseFloat(segments[0]) * 60 + parseFloat(segments[1]);
    } else {
      seconds = parseFloat(segments[0]);
    }
    if (!isNaN(seconds) && seconds > 0 && seconds < duration) {
      times.push(seconds);
    }
  }

  times.push(duration);
  times.sort((a, b) => a - b);

  // Remove duplicates
  const unique = [...new Set(times)];

  const result: ClipSegment[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    result.push({
      id: generateSegmentId(),
      start: Math.round(unique[i] * 100) / 100,
      end: Math.round(unique[i + 1] * 100) / 100,
      label: `Segment ${i + 1}`,
      enabled: true
    });
  }

  return result;
}

// Create clip from segments using Canvas + MediaRecorder
export async function createClipFromSegments(
  videoElement: HTMLVideoElement,
  segments: ClipSegment[],
  config: ClipConfig,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const enabledSegments = segments.filter(s => s.enabled);
  if (enabledSegments.length === 0) throw new Error('No segments enabled');

  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth || 1280;
  canvas.height = videoElement.videoHeight || 720;
  const ctx = canvas.getContext('2d')!;

  const stream = canvas.captureStream(30);
  const mimeType = config.outputFormat === 'webm' ? 'video/webm;codecs=vp9' : 'video/webm;codecs=vp8';
  const recorder = new MediaRecorder(stream, {
    mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : 'video/webm'
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: config.outputFormat === 'webm' ? 'video/webm' : 'video/mp4' });
      resolve(blob);
    };
    recorder.onerror = () => reject(new Error('MediaRecorder error'));

    recorder.start();

    let segIndex = 0;
    let totalDuration = enabledSegments.reduce((sum, s) => sum + (s.end - s.start), 0);
    let elapsed = 0;

    const processSegment = async () => {
      if (segIndex >= enabledSegments.length) {
        // Handle fade out
        if (config.addFadeOut) {
          await applyFade(ctx, canvas, config.fadeDuration, 'out');
        }
        recorder.stop();
        return;
      }

      const seg = enabledSegments[segIndex];
      videoElement.currentTime = seg.start;
      videoElement.playbackRate = config.speed;

      await new Promise<void>(r => {
        videoElement.onseeked = () => r();
      });

      // Handle fade in for first segment
      if (segIndex === 0 && config.addFadeIn) {
        await applyFade(ctx, canvas, config.fadeDuration, 'in');
      }

      videoElement.play();

      const drawFrame = () => {
        if (videoElement.currentTime >= seg.end || videoElement.paused) {
          videoElement.pause();
          elapsed += seg.end - seg.start;
          onProgress?.(Math.round((elapsed / totalDuration) * 100));
          segIndex++;
          processSegment();
          return;
        }

        // Apply speed / reverse
        if (config.enableReverse) {
          ctx.save();
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        } else {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        }

        requestAnimationFrame(drawFrame);
      };

      drawFrame();
    };

    processSegment();
  });
}

// Apply fade effect
async function applyFade(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  duration: number,
  type: 'in' | 'out'
): Promise<void> {
  const frames = Math.round(duration * 30); // 30fps
  for (let i = 0; i < frames; i++) {
    const alpha = type === 'in' ? i / frames : 1 - (i / frames);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    await new Promise(r => setTimeout(r, 1000 / 30));
  }
}

// Export/download the clip
export function exportClip(blob: Blob, filename: string = 'clip'): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.${blob.type.includes('webm') ? 'webm' : 'mp4'}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Calculate total duration of enabled segments
export function calculateTotalDuration(segments: ClipSegment[]): number {
  return segments
    .filter(s => s.enabled)
    .reduce((sum, s) => sum + (s.end - s.start), 0);
}

// Format seconds to mm:ss.ms
export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 10);
  return `${m}:${s < 10 ? '0' : ''}${s}.${ms}`;
}
