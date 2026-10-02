import { HttpError } from './budget.mjs';

// Read bounded ISO BMFF boxes without decoding video in the Worker.
export function videoDuration(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (start, end) => new TextDecoder().decode(bytes.subarray(start, end));
  function boxes(start, end) {
    const result = [];
    while (start < end) {
      if (end - start < 8) throw new HttpError(415, 'Invalid MP4.');
      const size = view.getUint32(start);
      if (size < 8 || start + size > end) throw new HttpError(415, 'Invalid MP4 box.');
      result.push({ type: text(start + 4, start + 8), start: start + 8, end: start + size });
      start += size;
    }
    return result;
  }
  const top = boxes(0, bytes.length);
  const moov = top.find(b => b.type === 'moov');
  if (top[0]?.type !== 'ftyp' || !moov || !top.some(b => b.type === 'mdat'))
    throw new HttpError(415, 'Upload a complete MP4.');
  const header = boxes(moov.start, moov.end).find(b => b.type === 'mvhd');
  if (!header || header.end - header.start < 20 || bytes[header.start] !== 0)
    throw new HttpError(415, 'Unsupported MP4 movie header.');
  const scale = view.getUint32(header.start + 12);
  const duration = view.getUint32(header.start + 16) / scale;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 10.1)
    throw new HttpError(415, 'Videos must be at most 10 seconds.');
  return duration;
}
