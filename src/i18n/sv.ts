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
  filterKinds: "Insatser",
  filterActorTypes: "Aktörer",
  clearFilters: "Visa allt",
  legend: "Förklaring",
  legendNodes: "Noder",
  legendActor: "Aktör (färgen visar typ)",
  legendRelations: "Relationer",
  offMapColumn: "Nationellt & EU",
  close: "Stäng",
  website: "Webbplats",
  locations: "Plats",
  area: "Område",
  period: "Period",
  supportTypes: "Typ av stöd",
  exampleNotice: "Uppgifterna är påhittade eller ofullständiga exempel.",
  noDescription: "Ingen beskrivning ännu.",
  emptyHint: "Klicka på en nod för att se detaljer och relationer.",
  countVisible: (shown: number, total: number) => `${shown} av ${total} noder visas`,
  zoomIn: "Zooma in",
  zoomOut: "Zooma ut",
  zoomReset: "Återställ vy",
  toggleFilters: "Filter och förklaring",

  sections: {
    leads: "Driver",
    partnerIn: "Partner i",
    funds: "Finansierar",
    ledBy: "Drivs av",
    funders: "Finansiärer",
    partners: "Partner",
    related: "Systerinsatser",
    relations: "Relationer",
  },

  actorTypes: {
    region: "Region",
    municipality: "Kommun",
    university: "Lärosäte",
    "business-support": "Företagsfrämjare",
    "science-park": "Science park / inkubator",
    "research-institute": "Forskningsinstitut",
    "public-agency": "Myndighet",
    "eu-fund": "EU-fond",
    network: "Nätverk / förening",
    other: "Övrig aktör",
  } satisfies Record<ActorType, string>,

  kinds: {
    project: "Projekt",
    service: "Löpande stöd",
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
    related: "Systerinsats",
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
