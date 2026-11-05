# 서킷 환경 개선 기록 — 2026-11-05

이번 반영: 8개 서킷의 피트·패독과 대표 시설을 분리하고, 모나코 호텔·터널 연결부를 기준으로 구조를 수정했다. 실제 주행과 시작 화면은 같은 환경 모델을 사용한다.

**실물 수준의 전체 재현을 완료한 상태는 아니다.** 사진 원본 픽셀/온보드 프레임을 직접 대조하지 못했으며, 스파·인터라고스 등의 실제 노면 고저차와 건축물의 정확한 평면·치수는 남아 있다. 확인된 공식 텍스트와 게임을 위한 추정·단순화는 아래 표에서 구분한다.

이번에는 도로·충돌 계산·차량 물리·주행선·AI·입력·사운드를 변경하지 않았다. 실제 고저차를 반영하려면 노면뿐 아니라 주변 지형, 차량 접지 자세, 카메라, 구간별 AI 주행 검사가 함께 필요하므로 배경 산을 더하는 것으로 완료 처리하지 않는다.

## 구조 변경과 단순화

This is an architectural/environment pass for all eight circuits. It is **not a
completed surveyed reconstruction**. Published project descriptions informed the
structural changes; original photographs and onboard frames could not be viewed
as pixels through the available search connector. Do not describe the models as
photogrammetry, measured replicas or photo-validated reproductions.

Reference collection and its access ledger: [CIRCUIT_REFERENCES.md](CIRCUIT_REFERENCES.md).
The user does not need to upload every reference. The publicly accessible source
pages, photo URLs and official documents were found independently.

## Benchmark and expansion

The first benchmark was Monaco's hotel/underpass connection. The previous model
was an isolated, entirely closed grey U-shell extending 573 game metres from
Portier towards the chicane. SGM's actual tunnel-lighting project confirms the
hotel-over-road relationship, partial openings on the seaward side, and daylight-
like race lighting. The new model uses a flat slab, transverse beams, seaward
columns over a low parapet, white lamp strips, and hotel terrace levels above, with an approximate rooftop pool/restaurant pergola.
The same road frames generate the architecture in racing and the menu.

At the existing 1.5m driving eye height, the parapets remain visible and the roof
stays above the driving opening. After an initial matching-view render of the
benchmark, the shared atlas/batch/site-placement method was extended to the
other venue facilities. Each venue has separate proportions, structural rhythm
and context rather than a different colour on the same pit box.

| Circuit | Implemented structure and connected context | Explicit adaptation / remaining limits |
|---|---|---|
| Monaco | Hotel spanning the underpass; recessed terrace rhythm, open sea-side columns, flat beam ceiling; a shorter covered span; existing waterfront city and marina retained | 310m covered span and six terrace levels are game dimensions, not a survey. The hotel follows the existing distorted road projection. Exact Fairmont plan, room elevations, Casino architecture, hillside roads and quay locations remain unverified. |
| Monza | Park service courts and benches at Lesmo/Ascari/Parabolica; deeper broadleaf bands; two banked semicircles connected by straights instead of one short 145m arc | Oval radius 320m and 875m straights follow the official historical description; origin, orientation and transitions are approximate. Sections near current asphalt/facilities are trimmed, rather than modelling an actual flyover crossing. |
| Silverstone | Continuous faceted Wing roof with rising end profile, glass storey and red screen; pit garages and an airfield operations court; open fields/hangars retained | The 240m game pit footprint remains shorter/narrower than the real facility. Roof profiles interpret the Wing; precise cladding/roof survey and infield access roads are not complete. |
| Spa | Long roofed Raidillon terrace, stepped seating and rear service/glass volume; articulated pit roof; deeper conifer forest with local LOD batches | The playable road remains flat. This does **not** reproduce the defining Eau Rouge/Raidillon climb or the real hillside foundation. The official elevation map is available as text; road/terrain/vehicle/camera integration is still required. |
| Suzuka | Multi-level horizontal pit, park pavilions and a small coaster silhouette near the final sector, connected to the existing amusement-park setting/wheel | Pavilion/coaster plan is an original compressed interpretation, not an exact GP Racers layout. The existing grade-separated crossing remains; other real gradients are not reproduced. |
| Interlagos | Pit roof and green/yellow facade rhythm, garage frontages, event/service court around the early/final perimeter; existing perimeter housing retained | The road is still flat and the bowl-shaped track is not reconstructed. New court placement uses safe nearby space, not a surveyed stand location. Surrounding buildings are procedural blocks, not individual real houses. |
| Singapore | Fullerton-inspired stone cornices/colonnade, bridge arch/truss rhythm aligned with the existing Anderson approach, paved promenades, flat commercial roofs replacing Riviera-style pitched roofs, rippled water material | Fullerton dimensions/setback are adapted to the widened game road. Existing circuit labels/layout mix historical features and require a year-specific topology review. This pass does not silently alter that road/AI. |
| Montreal | Open pit terraces, Y-shaped supports and timber roof rhythm informed by Espace Paddock; island service court and Olympic Basin lane markers; finer water edges | Paddock dimensions use the existing 240m safe envelope. Basin/river polygons and remote bridge/Biosphere placements remain approximate. No real shoreline/GIS or bridge survey has been imported. |

## Placement and physical scope

- Road centreline, elevations, kerbs, barrier/collision layout, driving dynamics,
  racing line, opponent decisions, wheel input, haptics and audio are unchanged.
- Existing pit safety envelopes are reused, including roof overhangs. New ground
  facilities check full oriented roof/apron footprints against *all* road
  segments, water and reserved structures. They search a bounded local set of
  setbacks/along-road shifts; a failed location uses a documented nearby sector
  or is omitted. No arbitrary long-distance search is used for these new sites.
- The Monaco roof/hotel is deliberately overhead. At car height, the original
  tunnel wall bases remain coincident with visible concrete parapets; opening
  the upper seaward wall does not remove an existing collision boundary.
- Monaco's older Casino-like terrace no longer impersonates the hotel. Its
  source anchor has been corrected approximately and its previous 240m random
  relocation search restricted to 36m. It may be omitted if no safe site fits.
- Roadside pit aprons and rear service courts link garage fronts to their
  surroundings. Their tiles are checked against every road branch and all water
  corners before reservation; visual paving does not add a playable pit lane.
- All new elevated ground facilities use the highest corner and a foundation
  extending down to the lowest corner rather than leaving floating slabs.
- A landward exclusion beside the Monaco underpass removes a spurious inland
  sea pocket from the former coarse shoreline. This is an inferred correction
  from the hotel/coast relationship, not a new surveyed coastline.
- The historic Monza ribbon has vertical concrete sides down to the park ground;
  built sections reserve their footprint so new trees cannot grow through them.

## Rendering cost controls

- `VenueArchitecture.ts` batches box/beam/facade parts by material, 240m world
  cell and detail level. Each instance batch contains at most 384 parts.
- Generated 256px facade atlas shares one material. Floor UV repetition follows
  instance height, preventing a fixed number of floors from being stretched to
  every building height. No external photo texture downloads were added.
- There are no new dynamic lights, reflection cameras, scene animation loops or
  per-building shadow maps. Lighting strips are emissive/basic geometry.
- Broadleaf/conifer forest depth increases only at Monza/Spa. Tree instances now
  use bounded 128m world cells instead of long track strips spanning both sides,
  so distant trees do not unnecessarily select expensive near foliage/shadows.
  Far crown and trunk share one opaque, low-detail draw; the separate near trunk
  uses empty far geometry. Both LODs preserve the same ground contact height.
- Existing distance/tier removal, opaque far foliage, static transforms, shadow
  reuse and adaptive resolution remain. This pass **does not establish 120fps**.
- Water polygon edges refine to 1.5m in Monaco and 3m at the other waterfronts near
  shore/road boundaries. Normal/roughness maps reuse the existing environment
  reflection, with no extra reflection render or transparent fullscreen ocean.

## Intro presentation

Four named areas per circuit are retained. Updated choices include Club/Wing at
Silverstone, Raidillon at Spa, Monaco Portier/hotel, and Suzuka's final corner/
park. The existing sequence still waits until opacity reaches 1, holds 3000ms,
fades out, checks opacity is effectively zero, then moves the camera and fades
in. The 120fps request, reduced-motion support, interaction pause and disposal
before race start are retained.

## Verification

- Build: `npm run build -- --base=/f1/`.
- All-eight placement, actual road-mesh/roof clearance, finite geometry, shared
  material/instance budgets and tier/distance culling:
  `regional-scenery`, `roadside-placement`, `monaco-scenery`, `venue-architecture`.
- Menu regression: `circuit-menu`.
- Targeted Monaco renderer/collider relationship and driving regression:
  `monaco-walls`, including portal entry, high-speed/glancing/reverse contact and
  eleven autonomous cars. A full eight-circuit race suite was not repeated.
- Browser: same before/after camera poses at 1280x720, medium quality in
  Chromium/SwiftShader; forward cameras use 1.5m height. Screenshots/render errors
  and per-circuit draw submissions are recorded separately. These are scene
  submissions, not hardware FPS, and do not include the player's full HUD/mirror.

## 서킷별 측정 비용

같은 1280×720·중간 품질·동일 카메라에서 변경 전/후를 비교했다. 모나코는 터널/출구/헤어핀/항구의 항공·1.5m 전방 카메라 8개, 나머지는 피트와 대표 코너의 항공·전방 카메라 4개씩이다. 아래는 해당 샘플의 **프레임당 평균 제출량**이다. 그림자 갱신도 포함하며, 정적 그림자를 재사용하는 평상시 비용이나 전체 레이스/HUD/후방 미러를 포함한 프레임 시간으로 해석하면 안 된다.

| 서킷 | 샘플 수 | 드로 콜 전 → 후 | 삼각형 전 → 후 | 삼각형 변화 |
|---|---:|---:|---:|---:|
| 몬자 | 4 | 206.8 → 283.0 | 188,226 → 215,177 | +14.3% |
| 실버스톤 | 4 | 188.5 → 210.5 | 121,517 → 117,895 | -3.0% |
| 스파 | 4 | 126.2 → 176.8 | 86,342 → 93,038 | +7.8% |
| 모나코 | 8 | 252.4 → 267.8 | 164,592 → 181,633 | +10.4% |
| 스즈카 | 4 | 155.0 → 194.2 | 121,229 → 101,981 | -15.9% |
| 인터라고스 | 4 | 130.5 → 154.5 | 89,074 → 86,246 | -3.2% |
| 싱가포르 | 4 | 193.5 → 216.0 | 100,048 → 109,955 | +9.9% |
| 몬트리올 | 4 | 96.5 → 123.0 | 89,553 → 76,699 | -14.4% |

모든 서킷의 프레임이 빨라졌다고 주장하지 않는다. 새 시설과 숲의 깊이 때문에 드로 콜은 증가했다. 반면 원거리 나무의 불투명 재질·줄기 통합과 디테일 배치 변경으로 실버스톤·스즈카·인터라고스·몬트리올의 삼각형 제출량은 줄었다. 몬자·스파는 숲의 범위와 밀도를 늘리는 데 추가 비용을 사용했다. 실제 사용자 GPU에서 60/120fps 달성 여부는 측정하지 않았다.

전체 36개 비교 장면에서 JavaScript 렌더 예외는 없었다. 자동 배치·LOD·컬링·기초 접지 검사와 빌드 결과를 확인한 뒤 기존 GitHub Pages 배포 절차를 사용한다.


소개 카메라 역시 실제 `CircuitBackdrop.prepareShot/poseCamera` 계산으로 8개 서킷×4개 구간을 렌더링했다. 32개 화면을 검토했고 예외는 없었다. 각 구간의 0초/3초 위치 차이는 최대 약 1.02m/s로, 초점과 방향 기준이 구간 내에서 갑자기 바뀌지 않는다. 기존 3000ms 유지·완전 페이드 후 위치 교체 로직은 유지했다.

최종 검사: 빌드, 8개 서킷 환경/전체 지붕 배치/LOD·접지·컬링 검사, 메뉴 회귀 검사 통과. 모나코의 벽·터널 진입·11대 AI 주행 회귀 검사도 통과했다. 이후 추가한 해안선/옥상 표현은 환경 검사와 해당 8개 비교·4개 소개 시점으로 다시 확인했다.
