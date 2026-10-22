# Data reference

All content lives in three YAML files in [`/data`](../data). They can be edited
directly on GitHub (open the file, click the pencil icon, commit). Every change
is checked automatically; if something is wrong, the check on the commit or pull
request turns red and lists what to fix. Locally, run `npm run validate`.

Field names and ids are in English; names, descriptions and other text shown to
users are in Swedish.

## `actors.yaml` – organisations

```yaml
- id: region-kalmar            # unique, lowercase-with-dashes, never change once used
  name: Region Kalmar län      # shown in the UI
  type: region                 # see actor types below
  description: Kort text om vad aktören gör för SMF.   # optional
  website: https://regionkalmar.se                    # optional
  locations:                   # optional; first entry is the main one
    - { place: Kalmar, lat: 56.6614, lng: 16.3628 }
    - { place: Växjö, lat: 56.8555, lng: 14.8275 }    # extra sites are drawn as small rings
  example: true                # optional; marks invented or unverified details
```

Leave out `locations` for actors without a natural place on the map, such as
national agencies and EU funds. They are shown in the "Nationellt & EU" box.

Coordinates can be copied from a map service: right-click a place in Google Maps
or OpenStreetMap and copy the latitude and longitude.

| `type`               | Shown as                 |
| -------------------- | ------------------------ |
| `region`             | Region                   |
| `municipality`       | Kommun                   |
| `university`         | Lärosäte                 |
| `business-support`   | Företagsfrämjare         |
| `science-park`       | Science park / inkubator |
| `research-institute` | Forskningsinstitut       |
| `public-agency`      | Myndighet                |
| `eu-fund`            | EU-fond                  |
| `network`            | Nätverk / förening       |
| `other`              | Övrig aktör              |

## `initiatives.yaml` – projects and services

```yaml
- id: dika
  name: DIKA
  kind: project                # project (time-limited) or service (ongoing offering)
  status: ongoing              # planned, ongoing or completed
  description: Vad insatsen erbjuder och till vem.   # optional
  website: https://…                                  # optional
  start: "2024-01"             # optional, "YYYY" or "YYYY-MM" in quotes
  end: "2026-12"               # optional
  supportTypes: [digitalisation, skills]              # at least one, see below
  area: Kalmar län             # optional, free text
  lead: linnaeus-university    # actor id of who runs it (required)
  partners: [almi-kalmar]      # optional actor ids
  funders: [region-kalmar, eu-erdf]                   # optional actor ids
  related: [sister-project-a]  # optional ids of sister initiatives
  example: true                # optional
```

On the map, an initiative is placed next to the main location of its `lead`.

A sister relation only needs to be listed on one of the two initiatives.

| `supportTypes`         | Shown as             |
| ---------------------- | -------------------- |
| `advisory`             | Rådgivning           |
| `financing`            | Finansiering         |
| `skills`               | Kompetens            |
| `digitalisation`       | Digitalisering       |
| `innovation`           | Innovation           |
| `sustainability`       | Hållbarhet           |
| `internationalisation` | Internationalisering |
| `networking`           | Nätverkande          |

## `relations.yaml` – direct links between actors

For relations that are not about a specific initiative.

```yaml
- from: region-kalmar
  to: almi-kalmar
  type: owns                   # owns, manages or collaborates
  note: Delägare tillsammans med Almi Företagspartner AB.   # optional
```

| `type`         | Shown as                                 |
| -------------- | ---------------------------------------- |
| `owns`         | Äger / delägare i (and "Ägs av")         |
| `manages`      | Förvaltar (and "Förvaltas av")           |
| `collaborates` | Samverkar med                            |

## Adding a new category

Allowed values are defined in [`src/data/types.ts`](../src/data/types.ts), their
Swedish labels in [`src/i18n/sv.ts`](../src/i18n/sv.ts) and colours in
[`src/theme.ts`](../src/theme.ts). A new value needs an entry in all three.
