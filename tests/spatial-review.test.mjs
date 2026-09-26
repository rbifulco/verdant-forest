import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import * as THREE from 'three';
import {SceneAssetRegistry, normalizeSpatialReviewDiscovery} from '@alterno-dev/spatial-review';
import {createServer} from 'vite';

const vite = await createServer({configFile: false, appType: 'custom', server: {middlewareMode: true}});
after(() => vite.close());
const {expandGrass, registerReviewRoot, registerTrees, terrainTiles} = await vite.ssrLoadModule('/app/forest/review-adapter.ts');
const {createCompactGrass} = await vite.ssrLoadModule('/app/forest/compact-grass.ts');
const {reviewDiscovery, REVIEW_EDITOR} = await vite.ssrLoadModule('/app/forest/review-policy.ts');

test('discovery resolves to the dedicated capture route with exact editor access', () => {
  const discovery = normalizeSpatialReviewDiscovery(reviewDiscovery, 'https://forest.example/.well-known/spatial-review.json');
  assert.equal(discovery.liveCapture, 'https://forest.example/spatial-review');
  assert.deepEqual(discovery.capabilities.liveCapture.editorOriginPolicy.origins, [REVIEW_EDITOR]);
});

test('compact grass exports all placements with the shader-equivalent transform', () => {
  const source = createCompactGrass(new Float32Array([12, 2, -3, Math.PI / 2, -5, 0, 9, 0]), new Float32Array([2,3,4,1,1,1]), 2, [new THREE.BoxGeometry(1,1,1)], new THREE.MeshStandardMaterial());
  const expanded = expandGrass(source);
  assert.equal(expanded.count, 2);
  assert.equal(expanded.geometry.getAttribute('forestPlacement'), undefined);
  const matrix = new THREE.Matrix4(); expanded.getMatrixAt(0, matrix);
  const point = new THREE.Vector3(1,0,0).applyMatrix4(matrix);
  assert.ok(point.distanceTo(new THREE.Vector3(12,2,-5)) < 1e-6);
  assert.equal(expanded.geometry.attributes.position, source.geometry.attributes.position);
});

test('tree placements remain separate while sharing a canonical wood and canopy asset', async () => {
  const registry = new SceneAssetRegistry('test');
  const wood = new THREE.InstancedMesh(new THREE.BoxGeometry(1,8,1), new THREE.MeshStandardMaterial(), 2);
  const leaves = new THREE.InstancedMesh(new THREE.SphereGeometry(3), new THREE.MeshStandardMaterial(), 2);
  wood.userData.reviewVariant = 0;
  for (let i = 0; i < 2; i++) {
    const matrix = new THREE.Matrix4().makeTranslation(i * 20, 0, 4);
    wood.setMatrixAt(i,matrix); leaves.setMatrixAt(i,matrix);
  }
  registerTrees(registry, [wood,leaves], 'test');
  const index = registry.toReviewIndex('scene', false, true, true, true);
  assert.equal(index.scene.actors.length, 2);
  assert.notEqual(index.scene.actors[0].actorId, index.scene.actors[1].actorId);
  assert.equal(index.scene.actors[0].assetId, index.scene.actors[1].assetId);
  const result = await registry.produceAssetRepresentation('tree-variant-0', 'review', 'detail', 64*1024*1024, 'interactive', new AbortController().signal);
  assert.ok(result?.bytes > 0);
  assert.ok(result.asset.nodes.some(node => node.name === 'Trunk and branches'));
  assert.ok(result.asset.nodes.some(node => node.name === 'Canopy leaves'));
});

test('deferred export honors cancellation and rejects insufficient transfer budgets', async () => {
  const registry = new SceneAssetRegistry('test');
  registerReviewRoot(registry, new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()), {actorId:'box',name:'Box',category:'Test',sourceRef:'tests/spatial-review.test.mjs'}, 'test');
  const abort = new AbortController(); abort.abort();
  await assert.rejects(registry.produceAssetRepresentation('box','review','detail',64*1024*1024,'interactive',abort.signal));
  await assert.rejects(registry.produceAssetRepresentation('box','review','detail',1,'interactive',new AbortController().signal));
});

 test('terrain tiling preserves every original triangle count and boundary coordinate', () => {
  const source = new THREE.Mesh(new THREE.PlaneGeometry(12, 12, 8, 8), new THREE.MeshStandardMaterial());
  const tiles = terrainTiles(source, 8);
  assert.equal(tiles.length, 16);
  assert.equal(tiles.reduce((count,tile) => count+tile.geometry.index.count,0), source.geometry.index.count);
  const overall = new THREE.Box3();
  for (const tile of tiles) {tile.geometry.computeBoundingBox(); overall.union(tile.geometry.boundingBox);}
  source.geometry.computeBoundingBox();
  assert.deepEqual(overall, source.geometry.boundingBox);
  assert.equal(tiles[0].geometry.attributes.position.getX(2), tiles[1].geometry.attributes.position.getX(0));
});
