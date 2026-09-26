// CPU integration check: real forest geometry, mocked image decoding and peer.
// This is not browser/visual or live-texture acceptance evidence.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createServer} from 'vite';
import {SPATIAL_REVIEW_REQUEST, SPATIAL_REVIEW_CATALOG, SPATIAL_REVIEW_ASSET_REQUEST, SPATIAL_REVIEW_ASSET_RESPONSE} from '@alterno-dev/spatial-review';
const vite = await createServer({configFile:false, appType:'custom', server:{middlewareMode:true,hmr:false}});
const listeners = new Set(), messages = [];
const peer = {postMessage(message) {messages.push(message);}};
globalThis.window = {location:{origin:'https://forest.example'}, parent:peer, opener:null, setTimeout, clearTimeout,
  addEventListener(type, listener) {if(type === 'message') listeners.add(listener);},
  removeEventListener(type, listener) {listeners.delete(listener);}};
globalThis.__FOREST_REVIEW_BUILD__ = 'cpu-integration-check';
const originalLoad = THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load = function(url,onLoad) {
  const texture = new THREE.DataTexture(new Uint8Array([128,128,128,255]),1,1);
  queueMicrotask(() => onLoad?.(texture)); return texture;
};
let dispose;
const send = (data, origin='https://spatial-review.alterno.dev') => listeners.forEach(listener => listener({data, origin, source:peer}));
async function waitFor(type, id) {
  for(let i=0;i<300;i++) {const message=messages.find(m=>m.type===type && m.requestId===id); if(message)return message; await new Promise(r=>setTimeout(r,100));}
  throw new Error(`No response for ${id}`);
}
try {
  const {startForestReview} = await vite.ssrLoadModule('/app/forest/spatial-review.ts');
  const start = performance.now();
  dispose = await startForestReview(new AbortController().signal, console.log);
  send({type:SPATIAL_REVIEW_REQUEST, requestId:'denied'}, 'https://untrusted.example');
  assert.ok(messages.some(m=>m.type==='spatial-review:connection-rejected' && m.requestId==='denied'));
  send({type:SPATIAL_REVIEW_REQUEST,requestId:'catalog',profile:'scene',progressive:true,
    geometryTransfer:{capability:'geometry-transfer-v1',maxBytes:64*1024*1024},capabilities:['asset-stream-v1','scene-assemblies-v1']});
  const message = await waitFor(SPATIAL_REVIEW_CATALOG,'catalog');
  const catalog = message.payload ?? message.index ?? message.catalog;
  if (!catalog) throw new Error(`Unexpected catalog fields: ${Object.keys(message)}`);
  const actors = catalog.scene.actors;
  for (const asset of catalog.assetCatalog.assets) {
    for (const representation of asset.stream.representations) {
      assert.ok(representation.estimatedBytes <= 64*1024*1024, `${asset.id} exceeds the transfer budget`);
    }
  }
  assert.equal(catalog.scene.navigationSequences[0].stops.length, 10);
  assert.equal(catalog.scene.navigationSequences[0].segments.length, 0);
  assert.equal(new Set(actors.map(a=>a.actorId)).size,actors.length);
  assert.ok(actors.length <= 5000, `Official editor accepts at most 5,000 actors; found ${actors.length}`);
  assert.ok(actors.filter(a=>a.category==='Trees').length>1000);
  const categories = Object.fromEntries([...new Set(actors.map(actor => actor.category))].map(category => [category, actors.filter(actor => actor.category === category).length]));
  console.log(JSON.stringify({actors:actors.length,categories,assets:catalog.assetCatalog.assets.length,catalogBytes:JSON.stringify(catalog).length,startupMs:Math.round(performance.now()-start),heapMiB:Math.round(process.memoryUsage().heapUsed/1024/1024)}));
  for (const assetId of ['tree-variant-0','rock-variant-0',actors.find(a=>a.actorId.startsWith('grass-patch-')).assetId,'terrain-0']) {
    const id=`asset-${assetId}`;
    send({type:SPATIAL_REVIEW_ASSET_REQUEST,requestId:id,assetId,buildId:catalog.buildId,profile:'review',stream:{capability:'asset-stream-v1',representationId:'detail',priority:'interactive',maxBytes:64*1024*1024}});
    const result=await waitFor(SPATIAL_REVIEW_ASSET_RESPONSE,id);
    assert.equal(result.ok,true,JSON.stringify({assetId,error:result.error,message:result.message}));
    console.log(JSON.stringify({assetId,ok:result.ok}));
  }
  dispose(); assert.equal(listeners.size,0);
} finally {
  dispose?.(); THREE.TextureLoader.prototype.load=originalLoad; await vite.close(); delete globalThis.window;
}
