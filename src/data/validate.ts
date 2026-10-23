import {
  ACTOR_RELATION_TYPES,
  ACTOR_TYPES,
  INITIATIVE_KINDS,
  STATUSES,
  SUPPORT_TYPES,
  type Dataset,
} from "./types";

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

type Row = Record<string, unknown>;

/**
 * Checks raw YAML content against the data model and returns a list of
 * human-readable problems. An empty list means the data is valid.
 */
export function validateDataset(raw: { actors: unknown; initiatives: unknown; relations: unknown }): string[] {
  const errors: string[] = [];
  const err = (where: string, msg: string) => errors.push(`${where}: ${msg}`);

  const asList = (value: unknown, file: string): Row[] => {
    if (value == null) return [];
    if (!Array.isArray(value)) {
      err(file, "expected a list of entries");
      return [];
    }
    return value as Row[];
  };

  const actors = asList(raw.actors, "actors.yaml");
  const initiatives = asList(raw.initiatives, "initiatives.yaml");
  const relations = asList(raw.relations, "relations.yaml");

  const ids = new Map<string, string>();
  const registerId = (row: Row, where: string) => {
    const id = row.id;
    if (typeof id !== "string" || !ID_PATTERN.test(id)) {
      err(where, `id must be lowercase-with-dashes, got ${JSON.stringify(id)}`);
      return;
    }
    if (ids.has(id)) err(where, `duplicate id "${id}" (also used in ${ids.get(id)})`);
    ids.set(id, where);
  };

  const requireString = (row: Row, key: string, where: string) => {
    if (typeof row[key] !== "string" || (row[key] as string).trim() === "") err(where, `"${key}" is required`);
  };
  const optionalString = (row: Row, key: string, where: string) => {
    if (row[key] !== undefined && typeof row[key] !== "string") err(where, `"${key}" must be text`);
  };
  const oneOf = (row: Row, key: string, allowed: readonly string[], where: string) => {
    if (!allowed.includes(row[key] as string)) {
      err(where, `"${key}" must be one of ${allowed.join(", ")}, got ${JSON.stringify(row[key])}`);
    }
  };
  /** Catches typos and leftovers such as a misspelt field name. */
  const knownKeys = (row: Row, allowed: string[], where: string) => {
    for (const key of Object.keys(row ?? {})) {
      if (!allowed.includes(key)) err(where, `unknown field "${key}" (allowed: ${allowed.join(", ")})`);
    }
  };
  const idList = (row: Row, key: string, where: string): string[] => {
    const value = row[key];
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
      err(where, `"${key}" must be a list of ids`);
      return [];
    }
    return value as string[];
  };

  actors.forEach((a, i) => {
    const where = `actors.yaml #${i + 1}${typeof a.id === "string" ? ` (${a.id})` : ""}`;
    registerId(a, where);
    knownKeys(a, ["id", "name", "type", "description", "website", "locations", "example"], where);
    requireString(a, "name", where);
    oneOf(a, "type", ACTOR_TYPES, where);
    optionalString(a, "description", where);
    optionalString(a, "website", where);
    if (a.locations !== undefined) {
      if (!Array.isArray(a.locations) || a.locations.length === 0) {
        err(where, `"locations" must be a non-empty list (omit it for actors without a place)`);
      } else {
        (a.locations as Row[]).forEach((loc, j) => {
          const w = `${where} location #${j + 1}`;
          requireString(loc, "place", w);
          const { lat, lng } = loc;
          if (typeof lat !== "number" || lat < 55 || lat > 70) err(w, `"lat" must be a latitude within Sweden`);
          if (typeof lng !== "number" || lng < 10 || lng > 25) err(w, `"lng" must be a longitude within Sweden`);
          knownKeys(loc, ["place", "lat", "lng", "building"], w);
          if (loc.building !== undefined && !(typeof loc.building === "string" && /^way\/\d+$/.test(loc.building))) {
            err(w, `"building" must be an OpenStreetMap way such as "way/617886929"`);
          }
        });
      }
    }
  });

  const actorIds = new Set(actors.map((a) => a.id as string));

  initiatives.forEach((p, i) => {
    const where = `initiatives.yaml #${i + 1}${typeof p.id === "string" ? ` (${p.id})` : ""}`;
    registerId(p, where);
    knownKeys(
      p,
      [
        "id",
        "name",
        "kind",
        "status",
        "description",
        "website",
        "start",
        "end",
        "supportTypes",
        "area",
        "lead",
        "partners",
        "funders",
        "serves",
        "contact",
        "example",
      ],
      where,
    );
    requireString(p, "name", where);
    oneOf(p, "kind", INITIATIVE_KINDS, where);
    oneOf(p, "status", STATUSES, where);
    optionalString(p, "description", where);
    optionalString(p, "website", where);
    optionalString(p, "area", where);
    optionalString(p, "contact", where);
    for (const key of ["start", "end"]) {
      const v = p[key];
      if (v !== undefined && !(typeof v === "string" && DATE_PATTERN.test(v))) {
        err(where, `"${key}" must be written as "YYYY" or "YYYY-MM" in quotes, got ${JSON.stringify(v)}`);
      }
    }
    if (typeof p.start === "string" && typeof p.end === "string" && p.start > p.end) {
      err(where, `"start" is after "end"`);
    }
    if (!Array.isArray(p.supportTypes) || p.supportTypes.length === 0) {
      err(where, `"supportTypes" must list at least one of ${SUPPORT_TYPES.join(", ")}`);
    } else {
      for (const s of p.supportTypes) {
        if (!SUPPORT_TYPES.includes(s)) err(where, `unknown support type ${JSON.stringify(s)}`);
      }
    }
    if (!actorIds.has(p.lead as string)) err(where, `"lead" refers to unknown actor ${JSON.stringify(p.lead)}`);
    const serves = p.serves;
    if (serves !== undefined && (!Array.isArray(serves) || serves.some((v) => typeof v !== "string"))) {
      err(where, `"serves" must be a list of municipality names, e.g. [Hultsfred, Vimmerby]`);
    }
    for (const key of ["partners", "funders"]) {
      for (const id of idList(p, key, where)) {
        if (!actorIds.has(id)) err(where, `"${key}" refers to unknown actor "${id}"`);
        if (id === p.lead && key === "partners") err(where, `lead "${id}" is also listed as partner`);
      }
    }
  });

  relations.forEach((r, i) => {
    const where = `relations.yaml #${i + 1}`;
    knownKeys(r, ["from", "to", "type", "note"], where);
    for (const key of ["from", "to"]) {
      if (!actorIds.has(r[key] as string)) err(where, `"${key}" refers to unknown actor ${JSON.stringify(r[key])}`);
    }
    oneOf(r, "type", ACTOR_RELATION_TYPES, where);
    optionalString(r, "note", where);
  });

  return errors;
}

export function assertDataset(raw: { actors: unknown; initiatives: unknown; relations: unknown }): Dataset {
  const errors = validateDataset(raw);
  if (errors.length > 0) throw new Error(`Invalid data:\n  ${errors.join("\n  ")}`);
  return {
    actors: (raw.actors ?? []) as Dataset["actors"],
    initiatives: (raw.initiatives ?? []) as Dataset["initiatives"],
    relations: (raw.relations ?? []) as Dataset["relations"],
  };
}
