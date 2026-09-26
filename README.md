# Verdant Forest

A full-screen, real-time temperate woodland. The scene uses actual curved and folded geometry for its vegetation, with shared meshes, instanced placement, distance detail levels and adaptive rendering resolution.

Desktop: drag to look; WASD or arrows to move; Q/E or Space to descend/rise; Shift to move faster; wheel to move along the view direction; R to return to the trail. Double-click captures the mouse and Escape releases it. On touch devices, use the left thumb to move, the right side to look, and the two small flight controls to change height.

The application lives in `app/forest`. `engine.ts` owns rendering and resource lifecycle, `vegetation.ts` builds and updates the vegetation, and the botanical modules generate the geometry. `surfaces.ts`, `details.ts` and `trunk-life.ts` add terrain, decay, litter, roots, moss and climbing ivy. The rendering pipeline combines physically based materials, directional shadows, contact occlusion and depth-bounded atmospheric scattering. Reduced-motion preferences disable wind and drifting particles.

This is a Vinext/Vite project hosted with ChatGPT Sites. Keep the starter's build and hosting helpers intact. `npm run build` runs its verified production build; the hosting manifest identifies the existing Site. Public publication uses the Sites lifecycle, with the exact source revision pushed before packaging and saving.

Texture sources and licenses are in `public/credits.txt`. Touch devices load the smaller files under `public/textures/mobile`.

## Verification

The supplied cloud browser has WebGL disabled. Therefore this build's native EGL images are explicitly offline scene-data renders, not browser screenshots or browser FPS measurements. The native renderer uses the application geometry and exported production shaders, with adaptations for OpenGL texture/depth representation. Its timings describe software rendering in that environment only.

The scripts under `scripts` export reproducible geometry/shader inputs, validate camera behavior, report typed-array memory and scene draw budgets, and render the inspection images. Large intermediate geometry and frame sequences are ignored by Git. `PLAN.md`, `GATES.md` and `gates` record implementation and verification evidence, including unresolved environment limits.

## Alterno Spatial Review

Connect this website's URL in [Alterno Spatial Review](https://spatial-review.alterno.dev).
The editor discovers `/.well-known/spatial-review.json` and opens the dedicated
`/spatial-review` capture page. Keep that page open while reviewing. Ordinary
forest visits do not load the review SDK.

The capture provides independent trees and rocks, terrain tiles, woodland context
and the existing inspection viewpoints. Shapes and placements come from the
forest's construction code; custom shader appearance and atmospheric lighting are
approximations. A consumer supporting `asset-stream-v1` is required.

See [integration scope and verification](docs/spatial-review-integration-plan.md)
for source mapping, supported content, access policy and remaining validation.
