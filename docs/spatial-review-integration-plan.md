# Verdant Forest spatial review

## Scope and access

The requested integration uses the released `@alterno-dev/spatial-review` 0.7.0
SDK and the official editor, https://spatial-review.alterno.dev. The capture
bridge accepts that exact origin and same-origin peers. No additional editor
origins or cross-origin loopback peers are enabled. The dedicated capture page
permits framing by the official editor. Normal page framing is unchanged.

Only the deliberately registered forest geometry, standard materials, public
texture sources/bytes, source references and viewpoints are exposed. The source
texture loader uses local `/textures/` URLs without credentials or query tokens.
This integration does not register page UI, cookies, storage or other app state.

## Entry points

- Discovery: `/.well-known/spatial-review.json` (public file).
- Capture: `/spatial-review` (client-only bootstrap, no WebGL renderer required).
- Local website: http://127.0.0.1:5179/ while the development server runs.
- Official editor: https://spatial-review.alterno.dev — connect the website URL.

Static discovery keeps all SDK, registry and capture work out of ordinary visits.
The public document also supplies the runtime origin policy. Cloudflare `_headers`
and a development middleware permit its exact-origin CORS fetch. The capture
page uses a `frame-ancestors` response header on the Sites host. GitHub Pages
publishes a separate static build; its discovery response has public CORS while
the runtime bridge still checks the exact editor origin.

## Representation and source mapping

| Subject | Boundary and identity | Authoritative source |
| --- | --- | --- |
| Trees | One actor per deterministic placement index within 240 m of the forest center; eight shared low-detail variants; named trunk/branches and canopy components | `app/forest/vegetation.ts#createVegetation`, `app/forest/trees.js#createTreeGeometry` |
| Rocks | One actor per variant/placement index; five shared canonical variants | `app/forest/surfaces.ts#createRocks`, `rockGeometry` |
| Terrain/trail | 16 exact grid tiles; no surface resampling; each below the transfer budget | `app/forest/surfaces.ts#createGround`, `app/forest/math.ts#heightAt` |
| Fallen logs | One actor per `DEADWOOD_PLACEMENTS` entry | `app/forest/surfaces.ts#DEADWOOD_PLACEMENTS`, `createDeadwood` |
| Grass, ferns, shrubs, herbs | Four grass quadrants grouped into one actor per cell; fern, shrub and herb actors sampled in eight central cells around the saved viewpoints | `app/forest/vegetation.ts#createVegetation` and botanical factories |
| Litter and mushrooms | Instanced context families; individual instances are asset detail, not independent scene actors | `app/forest/surfaces.ts#createLitter`, `createMushrooms` |
| Moss and trunk life | Twelve moss patches nearest the entrance and the first twelve authored trunk-life groups, paired into review actors; the full detail field remains on the ordinary website | `app/forest/details.ts#createForestDetails`, `app/forest/trunk-life.ts#createTrunkLife` |
| Inspection viewpoints | Ten existing saved camera/aim positions; no fabricated connecting journey | `app/forest/controls.ts#viewpoints` |

The forest is world-owned; it has no authored room/place assembly hierarchy.
Patch, scatter and detail-family membership is a context/review boundary, not a
claim that every blade or moss shoot is an independent Scene placement.

Source and review use the same metre scale, XYZ axes and transforms. SDK rotation
metadata is XYZ degrees. Feedback on a tree placement must update its source
placement before slope alignment and ground sinking are recomputed; asset edits
belong in the canonical botanical factory. Camera and aim Y coordinates include
`heightAt(x,z)` as in `createControls.jump`; subtract that height when applying
world-space feedback to the stored viewpoints. FOV is the runtime 58 degrees.

Tree IDs survive changes to a placement's coordinates, and patch IDs use grid
coordinates rather than current density or the first generated plant. Changing
procedural generation order or factory topology requires a new review baseline;
retain old feedback for explicit migration. Build identity hashes forest source
and public texture bytes, including uncommitted changes.

## Materials and exclusions

Capture clones preserve standard Three material fields, texture maps, vertex
colors, normals, UVs and real geometry. Grass's custom placement attributes are
converted to standard instance matrices on demand, preserving yaw and scale.

The standard-material representation is intentionally approximate: shader wind,
leaf transmission/veins, custom bark relief, procedural moss/ground coloration,
contact occlusion, atmospheric scattering, sky, lighting and particles are not
recreated. Do not use this representation as acceptance evidence for final
lighting or shader appearance. Material source is `app/forest/materials.ts`; map
slots and texture paths remain associated with those factory definitions.

Alternate LODs and far-tree pooling are excluded to avoid duplicate trees. Fixed
desktop seeds and density are used independent of viewport, motion settings or
camera position. The normal forest still uses its original adaptive renderer.
Saved viewpoints have no authored transition/timing curves; exported segments
are empty. Idle camera bob is not an authored journey.

## Lifecycle and budgets

All registrations and viewpoint metadata are complete before the bridge attaches.
The capture page constructs source geometry once without rendering; family
serialization and custom grass conversion are deferred. It requires a consumer
that negotiates `asset-stream-v1`; legacy complete-catalog consumers are not a
compatibility target. The registry/SDK enforces 64 MiB per geometry request,
96 MiB aggregate in flight, two concurrent requests and 24 queued requests.
Producer estimates account for attributes, indices and instance matrices.
Cancellation is checked before and after yielding. SDK caches bound deferred
serialized families and texture resources. All bridge listeners detach before
capture-owned resources are released on unmount/abort.

Terrain initially exceeded a single-family budget. It is now split into 16
original-grid tiles with matching shared boundaries and unchanged triangle count.
No capture processing runs every frame. Ordinary-page changes are limited to
stable construction metadata on the existing vegetation meshes.

## Verification

- Original production build: passed with direct `vinext build`.
- Existing test baseline: 3 passed, 2 failed before this change (starter preview
  metadata and unused starter animation CSS expectations).
- Final production build: passed. The full test suite has 8 passes and the
  same 2 baseline failures.
- `npx tsc --noEmit`: passed after implementation.
- `node --test tests/spatial-review.test.mjs`: 5 passed, covering discovery,
  grass transforms, shared tree assets/independent actors, cancellation/budgets,
  and terrain tiling.
- `node scripts/check-spatial-review.mjs`: CPU integration using real forest
  geometry with mocked image decoding and a simulated message peer. Verifies
  full catalog, unique actor IDs, ten saved viewpoints, rejected unauthorized
  origin, representative tree/rock/grass/terrain streamed geometry and teardown.
  This is not a browser render or a real texture transfer test.
- Final full capture check: 2,776 actors, 82 families,
  about 1.51 MB metadata, 215 MiB estimated aggregate asset geometry,
  and about 6.7 seconds startup in the local Node check.
  The official editor's 5,000 actor and 2,000 asset limits and a conservative
  256 MiB aggregate geometry estimate are enforced by this check in CI.
  These are CPU measurements, not browser FPS or hosted performance claims.
- Local HTTP: discovery and capture return 200; capture framing is restricted to
  the website and official editor. Official-editor CORS returned the exact allowed origin. Local bark texture
  returned `image/jpeg`; production copies remain unverified.
- The GitHub Pages workflow builds the client-only site at
  `https://rbifulco.github.io/verdant-forest/`. Its ordinary forest rendered in
  a live browser, the hosted capture reported ready, and discovery returned 200
  with CORS. The discovery points to a versioned capture URL so the editor does
  not reuse a cached build. The prior Sites deployment is independent.
- Live image byte transfer, visual comparison in the editor, and a human feedback
  export/application round trip remain unverified.

## Review loop

Connect the website in the official editor, select a named tree/rock/patch or
saved viewpoint, and export compact feedback. Resolve its source reference and
stable actor/asset ID using the table above. Apply placement changes to placement
inputs, canonical shape changes to factories, and viewpoint changes using the
height conversion above. Reload the capture and reconnect to receive a fresh
source-hashed build. Retire editor operations only after their intent is present
in source. Preserve unresolved feedback across new baselines.
