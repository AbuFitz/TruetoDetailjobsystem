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
  cookies: "https://www.truetodetail.co.uk/cookies",
};

export type VehicleSize = "small" | "midsize" | "largesuv";

export const VEHICLE_SIZE_LABELS: Record<VehicleSize, string> = {
  small: "Small Car",
  midsize: "Mid-Size",
  largesuv: "Large SUV / 4×4",
};

/**
 * Plain-English size guide with UK body-type names, shown wherever a size is
 * picked (this app's forms and the website's booking popup, which use the same
 * wording), by how big the car is: hatchbacks and coupes are small; saloons,
 * estates, crossovers and compact SUVs (Mokka, Juke, Evoque, Qashqai) are
 * mid-size; large SUVs, 4x4s and people carriers are large.
 */
export const VEHICLE_SIZE_GUIDE: Record<VehicleSize, { body: string; examples: string }> = {
  small: {
    body: "Hatchbacks and coupes",
    examples: "Ford Fiesta, VW Golf, Vauxhall Corsa, Audi TT",
  },
  midsize: {
    body: "Saloons, estates, crossovers and compact SUVs",
    examples: "BMW 3 Series, Skoda Octavia Estate, Vauxhall Mokka, Nissan Juke, Range Rover Evoque",
  },
  largesuv: {
    body: "Large SUVs, 4x4s and people carriers",
    examples: "Range Rover, Land Rover Discovery, BMW X5, Ford Galaxy",
  },
};

export const VEHICLE_SIZE_NOTE =
  "Not sure? Pick the closest and we will confirm before we arrive. Van and fleet cleaning is coming soon.";

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

/**
 * The detailer's checklist: four ticks, shown to the customer as a light
 * sub-status while their car is being detailed. Jobs started before the
 * shorter checklist keep the six older keys, so those stay valid.
 */
export const DETAIL_STAGE_KEYS = ["exterior", "interior", "protection", "final_check"] as const;
export const LEGACY_STAGE_KEYS = [
  "initial_inspection",
  "wheels_prewash",
  "exterior_wash",
  "final_qc",
] as const;
export type DetailStageKey =
  (typeof DETAIL_STAGE_KEYS)[number] | (typeof LEGACY_STAGE_KEYS)[number];

/** Display order across old and new keys. */
export const STAGE_DISPLAY_ORDER: string[] = [
  "initial_inspection",
  "wheels_prewash",
  "exterior_wash",
  "exterior",
  "interior",
  "protection",
  "final_qc",
  "final_check",
];

export const DETAIL_STAGE_LABELS: Record<string, string> = {
  exterior: "Exterior wash and wheels",
  interior: "Interior clean",
  protection: "Protection and finish",
  final_check: "Final check",
  initial_inspection: "Initial inspection",
  wheels_prewash: "Wheels & pre-wash",
  exterior_wash: "Exterior wash",
  final_qc: "Final QC",
};

/** Recommended re-detail interval, used to power the customer dashboard's "Recommended" card. */
export const MAINTENANCE_DETAIL_INTERVAL_WEEKS = 6;

/**
 * The number of qualifying (completed) visits the dashboard has always counted
 * toward TTD Rewards. What the reward itself is has not been defined in the
 * project, so nothing in the interface describes it.
 */
export const REWARD_VISITS_REQUIRED = 7;
