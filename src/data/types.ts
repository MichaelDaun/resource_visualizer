/**
 * Data model for the support map. The YAML files in /data are validated
 * against these shapes by src/data/validate.ts.
 */

export const ACTOR_TYPES = [
  "region",
  "municipality",
  "university",
  "business-support",
  "science-park",
  "research-institute",
  "public-agency",
  "eu-fund",
  "network",
  "other",
] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const INITIATIVE_KINDS = ["project", "service", "funding", "programme"] as const;
/**
 * - project: time-limited, often externally funded effort
 * - service: ongoing offering such as loans, advice or test beds
 * - funding: grants, vouchers or calls that companies apply for
 * - programme: a structured course such as an incubator or accelerator
 */
export type InitiativeKind = (typeof INITIATIVE_KINDS)[number];

export const STATUSES = ["planned", "ongoing", "completed"] as const;
export type Status = (typeof STATUSES)[number];

export const SUPPORT_TYPES = [
  "advisory",
  "financing",
  "skills",
  "digitalisation",
  "innovation",
  "sustainability",
  "internationalisation",
  "networking",
] as const;
export type SupportType = (typeof SUPPORT_TYPES)[number];

export const ACTOR_RELATION_TYPES = ["owns", "manages", "collaborates"] as const;
export type ActorRelationType = (typeof ACTOR_RELATION_TYPES)[number];

export interface Location {
  /** Human-readable place name, e.g. "Kalmar". */
  place: string;
  lat: number;
  lng: number;
  /** OpenStreetMap building the actor is in, e.g. "way/617886929"; highlighted on the map. */
  building?: string;
}

export interface Actor {
  id: string;
  name: string;
  type: ActorType;
  description?: string;
  website?: string;
  /** First location is the primary one. Omit for national/EU actors without a natural place on the map. */
  locations?: Location[];
  /** Marks entries whose details are invented placeholders. */
  example?: boolean;
}

export interface Initiative {
  id: string;
  name: string;
  kind: InitiativeKind;
  status: Status;
  description?: string;
  website?: string;
  /** "YYYY" or "YYYY-MM". */
  start?: string;
  end?: string;
  supportTypes: SupportType[];
  /** Geographic reach in free text, e.g. "Kalmar län". */
  area?: string;
  /** Actor id of the organisation running the initiative. */
  lead: string;
  partners?: string[];
  funders?: string[];
  /** Who to contact, e.g. "Joao Minelmio, strategisk projektledare". */
  contact?: string;
  /**
   * Municipalities (by name, e.g. "Hultsfred") the initiative is meant for,
   * when that differs from where its lead and partners are.
   */
  serves?: string[];
  example?: boolean;
}

export interface ActorRelation {
  from: string;
  to: string;
  type: ActorRelationType;
  note?: string;
}

export interface Dataset {
  actors: Actor[];
  initiatives: Initiative[];
  relations: ActorRelation[];
}
