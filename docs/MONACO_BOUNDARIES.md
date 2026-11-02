# Monaco boundaries and tunnel wall contact

The old fixed 16.2 m barrier offsets intersected where Monaco's streets pass
close together. Removing the intersection discarded a large part of the inner
wall: its surviving length was about 1,855 m for a 3,337 m lap. This left multiple
corners and the harbour return without a useful visible boundary.

`CompactTrackBoundary` now limits each side by the separation from non-adjacent
road sections and by inside-turn curvature. It narrows progressively before a
constrained section. The asphalt edge, white edge line, kerb and driving targets
follow that clearance; a wall is not simply added across an existing racing line.
Both closed wall outlines now follow essentially the entire lap (approximately
3,421 / 3,247 m, reflecting outer/inner path lengths). The geographic centreline
is unchanged. The other seven circuits retain their existing road/wall offsets.

The renderer and collider share `TunnelLayout`. Concrete side walls and the roof
have a 0.30 m shell; the driving opening is 12.4 m either side of the centre and
5.8 m high. End caps close the concrete thickness, not the driving portals.

Monaco's barriers and tunnel side walls use `TrackWallCollision`, a static 16 m
spatial grid. Body/tyre circles and wing-tip probes are checked within each 120 Hz
physics step. Sweeps catch thin wing tips crossing a wall at high speed. Normal
impulse and tangential friction stop a direct impact and permit a glancing slide.
Car-to-car separation is constrained against the same walls immediately. Monaco's
old radial position clamp is replaced by contact with the actual boundaries.
Cars remain on the road surface: this is horizontal wall contact, not a jumping,
overturning, structural-damage or full three-dimensional rigid-body simulation.

AI speed/route planning uses the available driving corridor, with room for the
complete wing/tyre envelope while a wall narrows. It does not forbid passing by
corner name or assign a common tactical action to the field. Individual driver
strategies and performance limits are preserved. Bounds/offsets are reused within
route queries, and the cubic boundary sampler avoids allocating interpolation
weight arrays. There are no per-car mesh raycasts or per-frame collider rebuilds.

`tests/monaco-walls.mjs` covers full-lap wall coverage, actual asphalt clearance,
shared visible/collision tunnel faces, high-speed impacts on both sides at
15/30/60/144 fps, exterior contacts, car-to-car pushes, glancing slides, reverse
control, open portals and an eleven-rival lap without wall/car contacts or road
departures. Reverse control is exercised through the existing physics control
interface; player input bindings are unchanged. Existing keyboard/solo/pack lap,
traffic, wheel and audio regression checks also run.
