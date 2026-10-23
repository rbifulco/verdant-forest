import * as THREE from 'three';
import {SceneAssetRegistry, SPATIAL_REVIEW_ASSET_STREAM_CAPABILITY} from '@alterno-dev/spatial-review';

const tuple = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];
const key = (n: number) => n.toFixed(5).replace('-', 'm').replace('.', '_');
export const placementKey = (matrix: THREE.Matrix4) => `${key(matrix.elements[12])}-${key(matrix.elements[14])}`;

// Review uses the original geometry and standard material fields. Shader-only
// wind, transmission, moss, bark relief and atmosphere are intentionally absent.
export function reviewMaterial(source: THREE.Material): THREE.Material {
  const material = source.clone();
  material.name = source.name || 'Forest surface (standard material approximation)';
  return material;
}

/** Expand the custom seven-float grass placement into standard instancing.
 * No blade geometry is duplicated; conversion occurs only on a family request. */
export function expandGrass(source: THREE.Mesh) {
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(source.geometry.index);
  for (const [name, attribute] of Object.entries(source.geometry.attributes)) {
    if (!name.startsWith('forest')) geometry.setAttribute(name, attribute);
  }
  const placements = source.geometry.getAttribute('forestPlacement');
  const sizes = source.geometry.getAttribute('forestScale');
  const mesh = new THREE.InstancedMesh(geometry, source.material, placements.count);
  const pose = new THREE.Object3D();
  for (let i = 0; i < placements.count; i++) {
    pose.position.set(placements.getX(i), placements.getY(i), placements.getZ(i));
    pose.rotation.set(0, placements.getW(i), 0);
    pose.scale.set(sizes.getX(i), sizes.getY(i), sizes.getZ(i));
    pose.updateMatrix(); mesh.setMatrixAt(i, pose.matrix);
  }
  mesh.name = 'Grass clumps';
  return mesh;
}

export function registerReviewRoot(registry: SceneAssetRegistry, root: THREE.Object3D,
  identity: {actorId: string; assetId?: string; name: string; category: string; sourceRef: string},
  revision: string, produce?: () => THREE.Object3D) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  let bytes = 0, triangles = 0;
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    // Compact grass has world-space conservative bounds set by its factory.
    if (object.userData.compact && geometry.boundingSphere) {
      bounds.union(geometry.boundingSphere.getBoundingBox(new THREE.Box3()).applyMatrix4(object.matrixWorld));
    } else {
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (object instanceof THREE.InstancedMesh) {
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, matrix); matrix.premultiply(object.matrixWorld);
          bounds.union(geometry.boundingBox!.clone().applyMatrix4(matrix));
        }
      } else bounds.union(geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld));
    }
    // Reserve JSON-sized attributes as well as owned typed transfer copies.
    for (const attribute of Object.values(geometry.attributes) as THREE.BufferAttribute[]) bytes += attribute.count * attribute.itemSize * 8;
    bytes += (geometry.index?.count ?? 0) * 8;
    const instances = object.userData.compact ? geometry.getAttribute('forestPlacement').count : object instanceof THREE.InstancedMesh ? object.count : 1;
    bytes += instances * 16 * 8;
    triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3 * instances;
  });
  if (bounds.isEmpty()) return;
  const position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  root.matrixWorld.decompose(position, rotation, scale);
  const euler = new THREE.Euler().setFromQuaternion(rotation, 'XYZ');
  registry.registerDeferred({
    ...identity, assetId: identity.assetId ?? identity.actorId,
    transform: {position: tuple(position), rotation: [euler.x, euler.y, euler.z].map(THREE.MathUtils.radToDeg) as [number,number,number], scale: tuple(scale)},
    bounds: {center: tuple(bounds.getCenter(new THREE.Vector3())), size: tuple(bounds.getSize(new THREE.Vector3()))},
    stream: {capability: SPATIAL_REVIEW_ASSET_STREAM_CAPABILITY, revision, representations: [{
      id: 'detail', purpose: 'detail', revision, estimatedBytes: Math.ceil(bytes),
      triangles: Math.ceil(triangles), attributes: ['position', 'normal', 'uv', 'color'],
    }]},
    async produceRepresentation({signal, maxBytes}) {
      signal.throwIfAborted();
      if (bytes > maxBytes) throw new Error(`${identity.name} needs a larger geometry transfer budget (${Math.ceil(bytes)} bytes).`);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      signal.throwIfAborted();
      return produce ? produce() : root;
    },
  });
}

/** Tree wood/leaf batches have matching matrices. Restore each tree boundary
 * while keeping the eight canonical designs shared across placements. */
export function registerTrees(registry: SceneAssetRegistry, meshes: THREE.InstancedMesh[], revision: string, maxCoordinate = Infinity) {
  for (let batch = 0; batch < meshes.length; batch += 2) {
    const wood = meshes[batch], leaves = meshes[batch + 1];
    if (!leaves || wood.count !== leaves.count) throw new Error('Tree component batches do not match');
    for (let i = 0; i < wood.count; i++) {
      const root = new THREE.Group(), matrix = new THREE.Matrix4();
      wood.getMatrixAt(i, matrix); matrix.decompose(root.position, root.quaternion, root.scale);
      if (Math.max(Math.abs(root.position.x), Math.abs(root.position.z)) > maxCoordinate) continue;
      const trunk = new THREE.Mesh(wood.userData.lods?.[2] ?? wood.geometry, wood.material); trunk.name = 'Trunk and branches';
      const canopy = new THREE.Mesh(leaves.userData.lods?.[2] ?? leaves.geometry, leaves.material); canopy.name = 'Canopy leaves';
      root.add(trunk, canopy);
      const variant = wood.userData.reviewVariant as number;
      registerReviewRoot(registry, root, {
        actorId: `tree-${wood.userData.reviewPlacementIds?.[i] ?? placementKey(matrix)}`, assetId: `tree-variant-${variant}`,
        name: `${['Oak', 'Beech', 'Oak', 'Birch'][variant % 4]} at ${matrix.elements[12].toFixed(1)}, ${matrix.elements[14].toFixed(1)}`,
        category: 'Trees', sourceRef: 'app/forest/vegetation.ts#createVegetation',
      }, revision);
    }
  }
}

/** Split the original grid without resampling its surface, UVs or vertex colors.
 * The full terrain exceeds the peer's single-family budget. */
export function terrainTiles(source: THREE.Mesh, segments: number, divisions = 4) {
  if (segments % divisions) throw new Error('Terrain subdivisions must divide evenly');
  const width = segments / divisions, stride = segments + 1;
  const tiles: THREE.Mesh[] = [];
  for (let z = 0; z < divisions; z++) for (let x = 0; x < divisions; x++) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.geometry.attributes)) {
      const data = new Float32Array((width + 1) ** 2 * attribute.itemSize);
      for (let row = 0; row <= width; row++) for (let column = 0; column <= width; column++) {
        const original = (z * width + row) * stride + x * width + column;
        const target = (row * (width + 1) + column) * attribute.itemSize;
        for (let component = 0; component < attribute.itemSize; component++) data[target + component] = attribute.getComponent(original, component);
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(data, attribute.itemSize));
    }
    const indices: number[] = [];
    for (let row = 0; row < width; row++) for (let column = 0; column < width; column++) {
      const a = row * (width + 1) + column, b = a + width + 1;
      indices.push(a,b,a+1,b,b+1,a+1);
    }
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, source.material);
    mesh.name = `Terrain tile ${x + 1}, ${z + 1}`; tiles.push(mesh);
  }
  return tiles;
}
