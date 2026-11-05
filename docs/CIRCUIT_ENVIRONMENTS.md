# Regional circuit backgrounds

The eight circuits use the existing bacinger geographic centerlines and their
published-length projection. Circuit locations were cross-checked against the
public [F1DB circuit records](https://github.com/f1db/f1db/tree/main/src/data/circuits):
`monza.yml`, `silverstone.yml`, `spa-francorchamps.yml`, `monaco.yml`, `suzuka.yml`,
`interlagos.yml`, `marina-bay.yml`, and `montreal.yml`.

The architectural and landscape descriptions below are design references for
original procedural models. Landmark coordinates and shore outlines are approximate
WGS84 anchors entered for this game; they are not a downloaded building survey,
GIS shoreline dataset, photogrammetry asset, or an exact reproduction of a venue.
Landmarks can move up to 300 m to clear the widened game road and existing stands.
The Monza banking feature follows its own curved ribbon and trims portions near
roads. The geographic centreline and lap timing are unchanged. Monaco subsequently adds adaptive boundary widths and physical wall contact; see MONACO_BOUNDARIES.md.

| Circuit | Location and reference features | Game interpretation |
|---|---|---|
| Monza | Lombardy, Parco di Monza, historic banked oval | Broadleaf park, warm green palette, aged curved concrete banking |
| Silverstone | Northamptonshire, former RAF Silverstone, the Wing | Open flat fields, airfield pavement remnants, hangars, segmented angular pit roof, overcast sky |
| Spa-Francorchamps | Wallonia, Ardennes woodland | Conifer groves, background ridges, lodge, cooler sky and haze |
| Monaco | Côte d’Azur, Port Hercule, Monte Carlo hillside | Terracotta roofs and stepped buildings, harbour yachts, Mediterranean shoreline, dry hillside and warm daylight |
| Suzuka | Mie, circuit amusement park | Large coloured-cabin Ferris wheel, greener park planting, distant rolling ground |
| Interlagos | São Paulo urban district | Low-rise concrete/terracotta neighbourhoods mixed with towers, warm green terrain and city haze |
| Marina Bay | Singapore waterfront and downtown | Bay outline, three-tower SkyPark interpretation, Flyer, emissive city windows, dark blue night reflections |
| Gilles Villeneuve | Île Notre-Dame, Saint Lawrence River | Two river channels, rowing basin, island vegetation, Biosphere and truss bridge interpretations |

Geographic projection uses each circuit's actual origin and the same scale as its
track. It preserves east/west and north/south. Decorative hills blend to zero well
outside the driving corridor. The playable road remains flat apart from the
existing grade-separated Suzuka crossing; these are not surveyed elevation data.
The distant São Paulo reservoirs and Montreal downtown are not moved next to the
road just to make them visible.

Useful location/architecture reference pages (listed for further comparison;
network access to these sites is unavailable in this execution environment):

- https://en.wikipedia.org/wiki/Autodromo_Nazionale_Monza
- https://en.wikipedia.org/wiki/Silverstone_Circuit
- https://en.wikipedia.org/wiki/Circuit_de_Spa-Francorchamps
- https://en.wikipedia.org/wiki/Circuit_de_Monaco
- https://en.wikipedia.org/wiki/Suzuka_International_Racing_Course
- https://en.wikipedia.org/wiki/Interlagos
- https://en.wikipedia.org/wiki/Marina_Bay_Street_Circuit
- https://en.wikipedia.org/wiki/Circuit_Gilles_Villeneuve

## Rendering and verification

- A shared 64 m spatial index answers prop/shore/tree clearance queries using local
  road segments instead of repeatedly scanning the full circuit.
- City props and landmark parts share primitive geometries and materials and use
  static instance batches in 300 m cells; the close dressing layer uses 450 m batches. Facade detail is a near-only batch.
- Water tiles share source vertex buffers and use bounded 320 m index batches.
  There is no extra water camera, reflection pass, or transparent ocean layer.
- Backgrounds add no dynamic lights or per-frame animation callbacks. A generated
  regional sky is reused for the visible background and filtered reflection input;
  the common park HDR no longer downloads during game startup.
- Distant foliage uses fewer triangles and an opaque material. Shadow casters are
  limited by tier and distance, including on the high preset.
- Grandstand terraces, roofs, and supports are merged. Distant seats become long
  benches; distant spectators use two-triangle masked silhouettes. Close spectators
  retain their original geometry, colours, and head detail.
- Brake boards share three materials/textures and three instanced draw batches.
- `tests/regional-scenery.mjs` checks landmark presence, finite geometry, road
  clearance, shore clipping, static instance budgets, regional skies, and quality
  culling on all eight circuits. Existing physics/AI and wheel/audio tests remain.
- Browser comparisons use Chromium/SwiftShader at 1280×720 and the medium preset.
  Reported draw calls/triangles describe scene submissions, not measured player
  FPS or a guarantee of performance on a particular GPU.

### Recorded start-line comparison for cfe72b6 (before the close-layer update)

Baseline: `f338b9f`. Same camera (80° FOV, 1.7 m eye height, 1100 m far plane),
medium quality, 1280×720, Chromium/SwiftShader. These are track/environment draws
without cars, HUD, or mirror; the initial shadow-update frame is excluded. Each
column totals the same eight forward start-line samples, with all new background
features enabled in the candidate.

| Metric | Baseline total | Regional backgrounds total | Change |
|---|---:|---:|---:|
| Submitted triangles | 1,567,681 | 1,335,455 | −14.8% |
| Draw calls | 1,399 | 1,321 | −5.6% |

[Per-circuit raw results](scenery-render-comparison.json). Some scenes keep similar
cost while showing more features. These measurements establish scene submission
budgets, not hardware FPS. The obsolete park HDR asset and its unused loading path have been removed;
regional skies are generated locally and reused for reflections.

## Close scenery and structure clearance update

The old grandstand guard only ran when a circuit had an `environment` field. The
original Monza, Silverstone and Spa definitions did not, so their grandstands
were never checked. At Silverstone's old 0.15-lap stand anchor, the roof/support
footprint crossed the actual asphalt around progress 0.1624–0.1667. The stand is
now about 60 m upstream; all twelve Silverstone stands are retained.

Every circuit now tests complete oriented footprints against road **segments**,
including returning road sections and canopy overhangs. An occupied-footprint
spatial index prevents stands, pits and close buildings from overlapping. Stands
try safe lateral offsets and then nearby positions along the track. The pit is
also validated before other facilities are placed. Woodland is generated after
facilities and buildings, so trees avoid their actual final positions. Pole and
brake-board placement also rejects adjacent road branches.

A separate close dressing layer follows the game road: Brazil has low-rise houses,
shops and paved forecourts along its outer perimeter, while the permanent venue's
infield remains open. Monaco and Singapore get street-front buildings on eligible
land sides. These are original procedural dressing, not surveyed individual
buildings. Park circuits get more woodland, low planting and marshal/service huts.
Road clearance and existing facilities take priority over filling every gap.

Close facades share one texture/material per circuit and vary colour through
instance attributes. Hedges, forecourts and service structures use shared primitive
geometries. They add no dynamic lights, per-frame callbacks or reflection cameras.

`tests/roadside-placement.mjs` reproduces the old Silverstone intrusion, checks the
actual complete road mesh against every stand/pit footprint on all eight maps,
checks facility overlap, and verifies close urban coverage and building clearance.
At the recorded build, Interlagos has 336 close-layer buildings, including 299 with
centres less than 55 m from a road centreline. A 100-position forward-view geometry
check sees close urban buildings at 98 of those positions. This is a visibility
fixture rather than a promise that every camera orientation sees a building.

[Roadside rendering comparison](roadside-render-comparison.json) records the same
eight fixed views before densification, after densification, and after instance
colour/spatial batching. The richer scene costs more than the sparse baseline;
the final batching reduces draws relative to the initial dense implementation. Triangle and
draw counts are not GPU FPS measurements. Historical start-line numbers above
apply specifically to cfe72b6, not to the current denser scene.
