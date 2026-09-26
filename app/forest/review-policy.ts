// Static discovery and runtime authorization share this exact public policy.
import discovery from '../../public/.well-known/spatial-review.json';
export const reviewDiscovery = discovery;
export const REVIEW_EDITOR = discovery.capabilities.liveCapture.editorOriginPolicy.origins[0];
