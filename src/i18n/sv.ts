/**
 * All user-facing text. The UI is Swedish; add another file with the same
 * shape to support more languages.
 */
import type { EdgeType } from "../data/graph";
import type { ActorType, InitiativeKind, Status, SupportType } from "../data/types";

export const sv = {
  appTitle: "Stödkartan",
  appSubtitle: "Stöd till små och medelstora företag i Kalmar och Kronobergs län",
  appTagline: "Kalmar & Kronoberg",
  demoMark: "Demo",
  demoTitle: "Demoversion. Uppgifterna är hämtade ur offentliga källor och inte granskade.",
  searchPlaceholder: "Sök aktör, insats eller ort",
  searchNoResults: "Inga träffar",
  viewMap: "Karta",
  viewNetwork: "Nätverk",
  viewFinder: "Hitta stöd",
  filters: "Urval",
  filterSupportTypes: "Typ av stöd",
  filterStatus: "Status",
  filterKinds: "Typ av insats",
  filterActorTypes: "Aktörer",
  clearFilters: "Återställ",
  onlyThis: "bara",
  onlyThisTitle: (label: string) => `Visa bara ${label.toLocaleLowerCase("sv-SE")}`,
  legend: "Teckenförklaring",
  legendNodes: "Symboler",
  legendActor: "Aktör",
  legendInitiative: "Insats",
  legendShelf: "Nationella aktörer och EU-fonder står i rutan till vänster på kartan.",
  themeToggle: { midsommar: "Byt till mörkt läge", natt: "Byt till ljust läge" } as Record<string, string>,
  legendRelations: "Relationer",
  offMapColumn: "Nationellt och EU",
  close: "Stäng",
  back: "Tillbaka",
  website: "Webbplats",
  locations: "Plats",
  area: "Område",
  period: "Period",
  supportTypes: "Stöd inom",
  ledBy: "Drivs av",
  exampleNotice: "Uppgifterna är ofullständiga eller inte kontrollerade ännu.",
  noDescription: "Ingen beskrivning ännu.",
  emptyHint: "Välj en kommun eller en symbol för att se vad som finns där.",
  countVisible: (shown: number, total: number) => (shown === total ? `${total} poster` : `${shown} av ${total} poster`),
  attribution: "Kartdata © OpenStreetMap-bidragsgivare, SCB, Natural Earth",
  attributionShort: "© OpenStreetMap, SCB",
  insetTitle: "Visa hela Kalmar och Kronobergs län",
  zoomIn: "Zooma in",
  zoomOut: "Zooma ut",
  zoomReset: "Visa båda länen",
  toggleFilters: "Urval och teckenförklaring",
  showOnMap: "Visa på kartan",

  finder: {
    title: "Hitta stöd för ditt företag",
    intro:
      "Svara på två frågor så visar vi vilka projekt, tjänster och program som kan passa – just nu och i närheten.",
    whereLabel: "Var finns företaget?",
    whereAny: "Hela Kalmar och Kronobergs län",
    needLabel: "Vad vill ni ha hjälp med?",
    needHint: "Välj ett eller flera.",
    results: (n: number) => (n === 1 ? "1 erbjudande" : `${n} erbjudanden`),
    resultsHint: "Sorterat efter hur väl det matchar och hur nära det finns.",
    noNeeds: "Välj minst ett område för att se förslag.",
    noResults: "Inget matchade. Prova att välja fler områden eller hela länet.",
    reach: { local: "I kommunen", county: "I länet", region: "Kalmar och Kronoberg", national: "Nationellt" },
    planned: "Startar snart",
    contact: "Gå till webbplatsen",
    disclaimer:
      "Listan bygger på offentliga uppgifter och kan vara ofullständig. Kontakta gärna aktören direkt eller företagsrådgivningen i din kommun.",
  },

  /** Plain-language descriptions of support types, used in the finder. */
  supportTypeHelp: {
    advisory: "Utveckla affären med stöd av en rådgivare",
    financing: "Lån, bidrag eller riskkapital",
    skills: "Utbildning och kompetens för er personal",
    digitalisation: "Digitala verktyg, data och AI",
    innovation: "Ta fram nya produkter, tjänster eller testa idéer",
    sustainability: "Energi, klimat och cirkulära affärer",
    internationalisation: "Sälja eller växa utomlands",
    networking: "Träffa andra företag och experter",
  } as Record<string, string>,

  places: {
    oland: "Öland",
    kinds: { county: "Län", municipality: "Kommun", area: "Område" },
    actorsHere: "Aktörer här",
    initiativesHere: "Insatser här",
    nothingHere: "Inga aktörer eller insatser registrerade här ännu.",
    summary: (actors: number, initiatives: number) =>
      `${actors} ${actors === 1 ? "aktör" : "aktörer"} · ${initiatives} ${initiatives === 1 ? "insats" : "insatser"}`,
    zoomHint: "Klicka på en kommun för att zooma in.",
    alsoIn: "Ingår i",
    wholeCounty: (name: string) => `Hela ${name}`,
    municipalities: "Kommuner",
  },
  filterCounties: "Län",

  sections: {
    partnerIn: "Partner i",
    funds: "Finansierar",
    ledBy: "Drivs av",
    funders: "Finansiärer",
    partners: "Partner",
    sameLead: "Mer från samma aktör",
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
