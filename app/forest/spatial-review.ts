import * as THREE from 'three';
import {SceneAssetRegistry, attachSceneAssetRegistryBridge, createSpatialReviewEditorAuthorization} from '@alterno-dev/spatial-review';
import {createGround, createRocks, createDeadwood, createLitter, createMushrooms} from './surfaces';
import {createVegetation} from './vegetation';
import {createForestDetails} from './details';
import {configureTextures, materialsReady, windUniform, clockUniform} from './materials';
import {expandGrass, placementKey, registerReviewRoot, registerTrees, reviewMaterial, terrainTiles} from './review-adapter';
import {viewpoints} from './controls';
import {heightAt} from './math';
import {FOREST_EXTENT} from './config';
import {REVIEW_EDITOR} from './review-policy';

declare const __FOREST_REVIEW_BUILD__: string;
export async function startForestReview(signal: AbortSignal, status: (text: string) => void) {
  const revision = __FOREST_REVIEW_BUILD__;
  const scene = new THREE.Scene();
  const registry = new SceneAssetRegistry(revision);
  let detach: (() => void) | undefined;
  let disposed = false;
  const reviewMaterials = new Map<THREE.Material, THREE.Material>();
  function dispose() {
    if (disposed) return; disposed = true; detach?.();
    signal.removeEventListener('abort', dispose);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const geometry of object.userData.lods ?? []) geometries.add(geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    for (const [source, replacement] of reviewMaterials) {materials.add(source); materials.add(replacement);}
    for (const material of materials) for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    scene.clear();
  }
  signal.throwIfAborted(); signal.addEventListener('abort', dispose, {once: true});
  try {
    // Fixed desktop geometry and seeds; no camera culling, duplicate LODs,
    // rendering loop, sky, particles, input controller or postprocessing.
    configureTextures(false); windUniform.value = 0; clockUniform.value = 0;
    const ground = createGround(scene), rocks = createRocks(scene);
    const litter = createLitter(scene), mushrooms = createMushrooms(scene);
    status('Preparing trees and woodland plants…');
    const vegetation = await createVegetation(scene, false, signal);
    signal.throwIfAborted();
    const logs = createDeadwood(scene, vegetation.bark);
    const beforeDetails = new Set(scene.children);
    createForestDetails(scene, vegetation.treePositions, rocks, vegetation.bark, false, vegetation.treeSurfaces);
    const details = scene.children.filter(object => !beforeDetails.has(object));
    await materialsReady(); signal.throwIfAborted();
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const convert = (source: THREE.Material) => {
        if (!reviewMaterials.has(source)) reviewMaterials.set(source, reviewMaterial(source));
        return reviewMaterials.get(source)!;
      };
      object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
    });
    status('Preparing review catalog…');
    const add = (root: THREE.Object3D, id: string, name: string, sourceRef: string, category = 'Forest floor', produce?: () => THREE.Object3D) =>
      registerReviewRoot(registry, root, {actorId: id, name, sourceRef, category}, revision, produce);
    const tiles = terrainTiles(ground, FOREST_EXTENT.terrainSegments);
    for (let i = 0; i < tiles.length; i++) {
      scene.add(tiles[i]);
      add(tiles[i], `terrain-${i}`, tiles[i].name, 'app/forest/surfaces.ts#createGround', 'Terrain');
    }
    for (let variant = 0; variant < rocks.length; variant++) {
      const batch = rocks[variant];
      for (let i = 0; i < batch.count; i++) {
        const root = new THREE.Mesh(batch.geometry, batch.material), matrix = new THREE.Matrix4();
        batch.getMatrixAt(i, matrix); matrix.decompose(root.position, root.quaternion, root.scale);
        registerReviewRoot(registry, root, {actorId: `rock-${variant}-${i}`, assetId: `rock-variant-${variant}`, name: `Rock ${variant + 1}.${i + 1}`, category: 'Rocks', sourceRef: 'app/forest/surfaces.ts#createRocks'}, revision);
      }
    }
    add(litter, 'leaf-litter', 'Fallen leaves', 'app/forest/surfaces.ts#createLitter');
    add(mushrooms, 'mushrooms', 'Mushroom patches', 'app/forest/surfaces.ts#createMushrooms');
    logs.forEach((log, i) => add(log, `deadwood-${i}`, `Fallen log ${i + 1}`, 'app/forest/surfaces.ts#DEADWOOD_PLACEMENTS', 'Deadwood'));
    const trees = scene.children.filter(o => o.userData.kind === 'tree') as THREE.InstancedMesh[];
    // Keep individual trees across the playable forest and its camera horizon.
    // The remote editor caps a catalog at 5,000 actors.
    registerTrees(registry, trees, revision, 240);
    const grassCells = new Map<string, THREE.Mesh[]>();
    for (const object of scene.children) {
      if (!(object instanceof THREE.Mesh) || object.userData.kind !== 'grass' || object.userData.lodLevel > 0) continue;
      const key = String(object.userData.reviewKey).replace(/-\d+$/, '');
      const patches = grassCells.get(key) ?? [];
      patches.push(object);
      grassCells.set(key, patches);
    }
    for (const [key, patches] of grassCells) {
      const root = new THREE.Group();
      root.name = `Grass cell ${key}`;
      scene.add(root);
      for (const patch of patches) root.add(patch);
      add(root, `grass-patch-${key}`, root.name, 'app/forest/vegetation.ts#createVegetation', 'Understory', () => {
        const expanded = new THREE.Group();
        for (const patch of patches) expanded.add(expandGrass(patch));
        return expanded;
      });
    }
    for (const object of scene.children) {
      if (!(object instanceof THREE.Mesh) || !['fern', 'shrub', 'herb'].includes(object.userData.kind) || object.userData.lodLevel > 0) continue;
      const kind = object.userData.kind as string;
      const matrix = new THREE.Matrix4();
      if (object instanceof THREE.InstancedMesh) {
        if (!object.count) continue;
        object.getMatrixAt(0, matrix);
      } else {
        const placements = object.geometry.getAttribute('forestPlacement');
        if (!placements?.count) continue;
        matrix.makeTranslation(placements.getX(0), placements.getY(0), placements.getZ(0));
      }
      const id = `${kind}-patch-${object.userData.reviewKey ?? placementKey(matrix)}`;
      add(object, id, `${kind[0].toUpperCase() + kind.slice(1)} patch ${placementKey(matrix)}`, 'app/forest/vegetation.ts#createVegetation', 'Understory');
    }
    for (let i = 0; i < details.length; i += 4) {
      const root = new THREE.Group();
      root.name = `Woodland details ${i + 1}–${Math.min(i + 4, details.length)}`;
      scene.add(root);
      for (const object of details.slice(i, i + 4)) root.add(object);
      add(root, `detail-group-${i / 4}`, root.name, 'app/forest/details.ts#createForestDetails');
    }
    signal.throwIfAborted();
    registry.registerNavigationSequence({
      id: 'forest-viewpoints', name: 'Forest inspection viewpoints',
      sourceRef: 'app/forest/controls.ts#viewpoints',
      stops: Object.entries(viewpoints).map(([id, view]) => ({
        id, name: id.replaceAll('_', ' '),
        camera: [view.position[0], view.position[1] + heightAt(view.position[0], view.position[2]), view.position[2]],
        target: [view.target[0], view.target[1] + heightAt(view.target[0], view.target[2]), view.target[2]],
        fov: 58, sourceRef: `app/forest/controls.ts#viewpoints.${id}`,
      })),
      // The runtime jumps between saved views; it authors no connecting path.
      segments: [],
    });
    const authorization = createSpatialReviewEditorAuthorization({
      allowOfficialEditor: true, allowedOrigins: [], allowLoopbackPeers: false,
      advertiseEditorOriginPolicy: {publicOrigins: [REVIEW_EDITOR]},
    });
    detach = attachSceneAssetRegistryBridge(registry, {
      authorization, maxGeometryBytes: 64 * 1024 * 1024,
      maxConcurrentAssetRequests: 2, maxInFlightBytes: 96 * 1024 * 1024, maxQueuedAssetRequests: 24,
    });
    status('Forest ready for spatial review. Keep this page open.');
    return dispose;
  } catch (error) {dispose(); throw error;}
}
