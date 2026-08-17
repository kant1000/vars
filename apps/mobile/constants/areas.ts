// Same area names as the landing page's "Area you operate in" select
// (apps/landing/src/components/PioneerSection.tsx), minus "Other" (no
// coordinate to map it to). Coordinates are approximate neighborhood
// centroids, not precise addresses — consistent with the app's existing
// center + radius zone model (see vendor-zone-setup.tsx), not a street-level
// pin. Used wherever a fallback picker is needed when GPS detection isn't
// usable (indoors, permission denied, wrong location) — fully static, no
// Google Places/Geocoding API involved. VARS is Lagos-only for now.
export interface LagosArea {
  name: string;
  lat: number;
  lng: number;
}

export const LAGOS_AREAS: LagosArea[] = [
  { name: 'Victoria Island', lat: 6.4281, lng: 3.4219 },
  { name: 'Lekki', lat: 6.4698, lng: 3.5852 },
  { name: 'Ikoyi', lat: 6.4541, lng: 3.4316 },
  { name: 'Ajah', lat: 6.4698, lng: 3.6015 },
  { name: 'Surulere', lat: 6.5059, lng: 3.3629 },
  { name: 'Yaba', lat: 6.5158, lng: 3.3707 },
  { name: 'Ikeja', lat: 6.6018, lng: 3.3515 },
  { name: 'Gbagada', lat: 6.5533, lng: 3.3891 },
  { name: 'Ogba', lat: 6.6280, lng: 3.3459 },
  { name: 'Maryland', lat: 6.5700, lng: 3.3667 },
  { name: 'Magodo', lat: 6.6167, lng: 3.3833 },
  { name: 'Mushin', lat: 6.5333, lng: 3.3500 },
  { name: 'Festac', lat: 6.4667, lng: 3.2833 },
  { name: 'Isolo', lat: 6.5333, lng: 3.3167 },
  { name: 'Ikorodu', lat: 6.6194, lng: 3.5106 },
  { name: 'Alimosho', lat: 6.5833, lng: 3.2500 },
  { name: 'Agege', lat: 6.6167, lng: 3.3167 },
  { name: 'Oshodi', lat: 6.5500, lng: 3.3500 },
];
