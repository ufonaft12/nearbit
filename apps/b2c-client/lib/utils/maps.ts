import { vibrate } from './vibrate';

export function openInWaze(storeName: string, lat?: number | null, lng?: number | null) {
  const url =
    lat != null && lng != null
      ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
      : `https://waze.com/livemap/directions?q=${encodeURIComponent(storeName + ' Israel')}`;
  vibrate(30);
  window.open(url, '_blank', 'noopener');
}

export function openInMaps(storeName: string, lat?: number | null, lng?: number | null) {
  const url =
    lat != null && lng != null
      ? `https://maps.google.com/maps?q=${lat},${lng}`
      : `https://maps.google.com/maps?q=${encodeURIComponent(storeName + ' Israel')}`;
  vibrate(30);
  window.open(url, '_blank', 'noopener');
}
