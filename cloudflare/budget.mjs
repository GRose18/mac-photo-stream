// Both providers must remain on Free plans. These are additional app-local guards.
export const LIMITS = Object.freeze({
  bytes: 800_000_000,
  objects: 40_000,
  imageBytes: 1_000_000,
  writesPerDay: 2_000,
  readsPerDay: 10_000,
  transferBytesPerDay: 60_000_000,
});
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function charge(usage, kind, now = new Date(), transferBytes = 8192) {
  const day = now.toISOString().slice(0, 10);
  const next = usage?.day === day ? { ...usage } : { day, writes: 0, reads: 0, deletes: 0, transferBytes: 0 };
  const ceiling = kind === 'reads' ? LIMITS.readsPerDay : LIMITS.writesPerDay;
  next[kind] ||= 0;
  if (next[kind] >= ceiling) throw new HttpError(429, 'Daily photo budget reached. Retry tomorrow; keep your local copy.');
  next[kind]++;
  next.transferBytes = (next.transferBytes || 0) + transferBytes;
  if (next.transferBytes > LIMITS.transferBytesPerDay)
    throw new HttpError(429, 'Daily transfer budget reached. Retry tomorrow; keep your local copy.');
  return next;
}
export function reserve(totals, size) {
  if (!Number.isSafeInteger(size) || size < 4 || size > LIMITS.imageBytes)
    throw new HttpError(413, 'Upload must be at most 1 MB.');
  const next = { bytes: (totals?.bytes || 0) + size, objects: (totals?.objects || 0) + 1 };
  if (next.bytes > LIMITS.bytes || next.objects > LIMITS.objects)
    throw new HttpError(507, 'Storage safety limit reached. No photos were removed. Keep your local copy.');
  return next;
}
