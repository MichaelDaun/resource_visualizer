/**
 * All user-facing text. The UI is Swedish; add another file with the same
 * shape to support more languages.
 */
import type { EdgeType } from "../data/graph";
import type { ActorType, InitiativeKind, Status, SupportType } from "../data/types";

export const sv = {
  appTitle: "Stödkartan",
  appSubtitle: "Stöd till små och medelstora företag",
  demoBadge: "Demo – exempeldata",
  demoBadgeTitle: "Uppgifterna är exempel och inte verifierade.",
  searchPlaceholder: "Sök aktör eller insats…",
  searchNoResults: "Inga träffar",
  viewMap: "Karta",
  viewNetwork: "Nätverk",
  filters: "Filter",
  filterSupportTypes: "Typ av stöd",
  filterStatus: "Status",
  filterKinds: "Typ av insats",
  filterActorTypes: "Aktörer",
  clearFilters: "Visa allt",
  legend: "Förklaring",
  legendNodes: "Noder",
  legendActor: "Aktör (färgen visar typ)",
  legendInitiative: "Insats (färgen visar typ)",
  themeMenu: "Utseende",
  themes: { fjord: "Fjord", midsommar: "Midsommar", natt: "Natt" } as Record<string, string>,
  themeDescriptions: {
    fjord: "Ljust och skarpt",
    midsommar: "Varmt och lekfullt",
    natt: "Mörkt och lysande",
  } as Record<string, string>,
  legendRelations: "Relationer",
  offMapColumn: "Nationellt & EU",
  close: "Stäng",
  website: "Webbplats",
  locations: "Plats",
  area: "Område",
  period: "Period",
  supportTypes: "Typ av stöd",
  exampleNotice: "Uppgifterna är ofullständiga eller inte kontrollerade ännu.",
  noDescription: "Ingen beskrivning ännu.",
  emptyHint: "Klicka på en nod eller en kommun för att se vad som finns där.",
  countVisible: (shown: number, total: number) => `${shown} av ${total} noder visas`,
  zoomIn: "Zooma in",
  zoomOut: "Zooma ut",
  zoomReset: "Återställ vy",
  toggleFilters: "Filter och förklaring",

  places: {
    oland: "Öland",
    kinds: { county: "Län", municipality: "Kommun", area: "Område" },
    actorsHere: "Aktörer här",
    initiativesHere: "Insatser här",
    nothingHere: "Inga aktörer eller insatser registrerade här ännu.",
    summary: (actors: number, initiatives: number) =>
      `${actors} ${actors === 1 ? "aktör" : "aktörer"} · ${initiatives} ${initiatives === 1 ? "insats" : "insatser"}`,
    zoomHint: "Klicka på en kommun för att zooma in.",
  },
  filterCounties: "Län",

  sections: {
    partnerIn: "Partner i",
    funds: "Finansierar",
    ledBy: "Drivs av",
    funders: "Finansiärer",
    partners: "Partner",
    sameLead: "Fler insatser från samma aktör",
    offersNow: "Erbjuder nu",
    planned: "Planerat",
    completed: "Avslutat",
    relations: "Relationer",
  },

  actorTypes: {
    region: "Region",
    municipality: "Kommun",
    university: "Lärosäte",
    "business-support": "Företagsfrämjare",
    "science-park": "Innovationsmiljö",
    "research-institute": "Forskningsinstitut",
    "public-agency": "Myndighet",
    "eu-fund": "EU-fond",
    network: "Nätverk / förening",
    other: "Övrig aktör",
  } satisfies Record<ActorType, string>,

  kinds: {
    project: "Projekt",
    service: "Löpande tjänst",
    funding: "Bidrag & utlysning",
    programme: "Program",
  } satisfies Record<InitiativeKind, string>,

  statuses: {
    planned: "Planerat",
    ongoing: "Pågående",
    completed: "Avslutat",
  } satisfies Record<Status, string>,

  supportTypeLabels: {
    advisory: "Rådgivning",
    financing: "Finansiering",
    skills: "Kompetens",
    digitalisation: "Digitalisering",
    innovation: "Innovation",
    sustainability: "Hållbarhet",
    internationalisation: "Internationalisering",
    networking: "Nätverkande",
  } satisfies Record<SupportType, string>,

  edgeTypes: {
    lead: "Driver",
    partner: "Partner",
    funds: "Finansierar",
    owns: "Äger / delägare",
    manages: "Förvaltar",
    collaborates: "Samverkar",
  } satisfies Record<EdgeType, string>,

  /** Phrases for actor–actor relations, read from the point of view of each end. */
  relationPhrases: {
    owns: { out: "Äger / delägare i", in: "Ägs av" },
    manages: { out: "Förvaltar", in: "Förvaltas av" },
    collaborates: { out: "Samverkar med", in: "Samverkar med" },
  },
};

export const t = sv;

/** Swedish genitive for place names, e.g. Hultsfred → Hultsfreds. */
function genitive(name: string): string {
  if (GENITIVE_EXCEPTIONS[name]) return GENITIVE_EXCEPTIONS[name];
  return /[aeiouyåäös]$/i.test(name) ? name : `${name}s`;
}
const GENITIVE_EXCEPTIONS: Record<string, string> = { Kalmar: "Kalmar", Falun: "Falu" };

export function municipalityName(name: string): string {
  return `${genitive(name)} kommun`;
}

export function countyName(name: string): string {
  return `${genitive(name)} län`;
}
