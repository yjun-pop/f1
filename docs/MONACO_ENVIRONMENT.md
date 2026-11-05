# Monaco environment pilot

Monaco is the first dedicated scenery pass. It uses original procedural models
and the existing circuit/world coordinates, not a surveyed reconstruction of
individual buildings. Driving geometry, wall collisions, vehicle physics and AI
are unchanged. The other seven circuits retain their existing asset placement.

The scene contains 790 apartment/commercial blocks and 49 moored yachts. Street
frontages have recessed window/shutter artwork, shop glazing, awnings, floor
ledges, balcony slabs/rails and rooftop equipment. A Belle Époque inspired
terrace/dome composition replaces the old generic landmark block. Districts
extend behind the close streets, with raised foundations following hillside
terrain instead of floating lower floors. These are stylized architectural assets,
not replicas of Casino de Monte-Carlo or the Fairmont.

A shared 512px color/roughness facade atlas uses instance height in the vertex
shader to maintain 3.2m floor spacing. Local cells share geometries and materials;
there are no separate window objects or window lights. Distant blocks omit the
balcony geometry, and low graphics hides the remaining near accents. Each
instance batch contains at most 400 parts. Static city surfaces reuse index tiles
and a small paving texture. Trees/lamps/benches remain associated with checked
street lots.

The marina has shaped hulls, decks, cabins, glazing bands, railings and mooring
fingers. Every yacht envelope lies over water and at least 38m from the road
centreline, beyond the paved quay strip. The water reuses the existing sky
reflection with small normal/roughness maps; no reflection camera or extra
lighting pass is added. Shore cells refine from 24m down to 3m. The existing 30m
water/road clearance remains; this buffer receives paved working quays instead
of an artificial grass beach. Urban paving refines locally at the coast too.

The intro keeps its three-second holds and fades. Monaco's four views are Casino,
Fairmont Hairpin, Nouvelle Chicane (for the marina) and Piscine.

Validation:

- `node tests/regional-scenery.mjs`: regional assets, water clipping and culling.
- `node tests/roadside-placement.mjs`: full rendered road vs roofs/stands/pits and
  close building clearance on all eight circuits; no driving simulation.
- `node tests/monaco-scenery.mjs`: density, entire lot envelopes vs the asphalt,
  land/water placement, terrace supports, yacht envelopes, finite geometry,
  material/instance budgets and detail/distance culling.
- Browser captures use identical 1280×720 cameras before/after, including driver
  eye height and the intro areas. Build/type checking and title UI checks run too.

The complete landmark group has about 221k instanced triangles, 17.7k instances
and 14 materials, spread over approximately 518 individually culled meshes.
Five matched aerial/driver captures increased from 82–121 draw calls to roughly
154–200 and about 109k–164k visible triangles. The additional marina-focused
view uses roughly 240 draw calls. These are scene complexity counts,
not FPS measurements. The denser environment costs more than the old sparse
scene. The menu retains its 120fps target and adaptive pixel budget; actual frame
rate must be assessed on the player's GPU/display. Scenery-only deployments run
geometry/culling checks instead of the full race suite.
