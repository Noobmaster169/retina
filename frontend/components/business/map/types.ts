/** What the map draws: one pin per located port, one lane per pair the shipments state. */

export interface MapPin {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Shipments loading or discharging here. Sets the pin's size. */
  count: number;
  href: string;
  loading: number;
  discharge: number;
  countryCode?: string | null;
  locode?: string | null;
  country?: string | null;
}

export interface MapLane {
  polId: string;
  podId: string;
  count: number;
  disputed: number;
}

/** A pin with its place on the drawing, and a lane with both its ends, once projected. */
export interface PlacedPin extends MapPin {
  x: number;
  y: number;
}

export interface PlacedLane extends MapLane {
  pol: PlacedPin;
  pod: PlacedPin;
  d: string;
}
