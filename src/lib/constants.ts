/** Real True To Detail business constants — not mock data. */
export const supportContact = {
  email: "info@truetodetail.co.uk",
  phone: "07359 591800",
};

/** Links out to the main True To Detail marketing site. */
export const ttdSiteLinks = {
  website: "https://www.truetodetail.co.uk",
  services: "https://www.truetodetail.co.uk/mobile-car-detailing",
  areas: "https://www.truetodetail.co.uk/areas",
  faq: "https://www.truetodetail.co.uk/#faq",
  terms: "https://www.truetodetail.co.uk/terms",
  privacy: "https://www.truetodetail.co.uk/privacy",
};

export type VehicleSize = "small" | "midsize" | "largesuv";

export const VEHICLE_SIZE_LABELS: Record<VehicleSize, string> = {
  small: "Small Car",
  midsize: "Mid-Size",
  largesuv: "Large SUV / 4×4",
};

export interface DetailPackage {
  id: string;
  name: string;
  tagline: string;
  durationLabel: string;
  /** Planning duration used to size schedule blocks — the low end of the real range. */
  durationMinutes: number;
  priceBySize: Record<VehicleSize, number>;
}

/** Same three packages and pricing as the truetodetail.co.uk booking widget. */
export const DETAIL_PACKAGES: DetailPackage[] = [
  {
    id: "essential",
    name: "Essential Car Detail",
    tagline: "Quick refresh",
    durationLabel: "2–3 hrs",
    durationMinutes: 150,
    priceBySize: { small: 80, midsize: 90, largesuv: 105 },
  },
  {
    id: "full-valet",
    name: "Full Valet Car Detail",
    tagline: "Our most popular service",
    durationLabel: "4–5 hrs",
    durationMinutes: 270,
    priceBySize: { small: 140, midsize: 155, largesuv: 175 },
  },
  {
    id: "premium-detail",
    name: "Premium Full Car Detail",
    tagline: "Best for resale / transformation",
    durationLabel: "6–7 hrs",
    durationMinutes: 390,
    priceBySize: { small: 220, midsize: 240, largesuv: 270 },
  },
];

export interface DetailAddon {
  id: string;
  label: string;
  price: number;
}

export type AddonId = string;

export const DETAIL_ADDONS: DetailAddon[] = [
  { id: "engine-bay", label: "Engine Bay Clean", price: 40 },
  { id: "pet-hair", label: "Pet Hair Removal", price: 25 },
  { id: "odour", label: "Odour Treatment", price: 30 },
  { id: "seat-shampoo", label: "Seat Shampoo (extra heavy)", price: 30 },
  { id: "steam", label: "Interior Steam Sanitisation", price: 35 },
];

/** Detail-in-progress checklist, shown to the customer as a lightweight sub-status under IN_PROGRESS. */
export const DETAIL_STAGE_KEYS = [
  "initial_inspection",
  "wheels_prewash",
  "exterior_wash",
  "interior",
  "protection",
  "final_qc",
] as const;
export type DetailStageKey = (typeof DETAIL_STAGE_KEYS)[number];

export const DETAIL_STAGE_LABELS: Record<DetailStageKey, string> = {
  initial_inspection: "Initial inspection",
  wheels_prewash: "Wheels & pre-wash",
  exterior_wash: "Exterior wash",
  interior: "Interior",
  protection: "Protection",
  final_qc: "Final QC",
};

/** Recommended re-detail interval, used to power the customer dashboard's "Recommended" card. */
export const MAINTENANCE_DETAIL_INTERVAL_WEEKS = 6;
