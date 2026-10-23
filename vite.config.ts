import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import vinext from "vinext";
import { defineConfig, type ViteDevServer } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

// Include source and image bytes so texture-only edits also invalidate reviews.
function forestReviewBuildId() {
  const hash = createHash('sha256');
  for (const directory of ['app/forest', 'public/textures']) {
    const files = readdirSync(directory, {recursive: true}) as string[];
    for (const file of files.sort()) {
      if (!/\.(ts|js|png|jpe?g|webp)$/i.test(file)) continue;
      hash.update(`${directory}/${file}`).update(readFileSync(`${directory}/${file}`));
    }
  }
  return `forest-${hash.digest('hex').slice(0, 16)}`;
}

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    define: {__FOREST_REVIEW_BUILD__: JSON.stringify(forestReviewBuildId())},
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      {
        name: 'forest-review-discovery-headers',
        configureServer(server: ViteDevServer) {
          // Vite serves public files before Vinext's route/header handling.
          server.middlewares.use((request, response, next) => {
            if (request.url?.split('?')[0] === '/.well-known/spatial-review.json') {
              response.setHeader('Access-Control-Allow-Origin', 'https://spatial-review.alterno.dev');
            }
            next();
          });
        },
      },
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
