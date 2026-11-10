import { cp, lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const MARKER = "pokedoko-external-cloudflare-v1";
const RESOURCE_KEYS = ["d1_databases", "kv_namespaces", "services", "vectorize", "hyperdrive", "workflows", "dispatch_namespaces", "send_email", "mtls_certificates", "pipelines", "vpc_services", "vpc_networks", "secrets_store_secrets", "artifacts", "worker_loaders", "ai_search", "ai_search_namespaces", "analytics_engine_datasets"];
const HELP = `Prepare an existing build for a separate Cloudflare Workers account.

Usage:
  node scripts/prepare-cloudflare-deploy.mjs --account-id ACCOUNT_ID --kv-namespace NAMESPACE_ID [--name pokedoko] [--dry-run]
  node scripts/prepare-cloudflare-deploy.mjs --account-id ACCOUNT_ID --bucket BUCKET_NAME [--name pokedoko] [--dry-run]

Required: an existing real Cloudflare account ID (32 hexadecimal characters) and
exactly one existing KV namespace or R2 bucket in that account. KV is suitable
for the free-account setup and adds a daily 00:00 UTC (09:00 KST) Cron Trigger.
No login or remote resource creation is performed. --dry-run only runs Wrangler
with its mandatory --dry-run flag.
Output: dist/external-cloudflare/NAME/server/wrangler.json
The source build, Sites settings, Vite config and package files are untouched.`;

export function validateDeployOptions({ accountId, bucket, kvNamespace, name = "pokedoko" }) {
  const validId = value => typeof value === "string" && /^[a-f\d]{32}$/i.test(value) && !/^(.)\1{31}$/.test(value) && !/^(0123456789abcdef){2}$/i.test(value);
  if (!validId(accountId)) {
    throw new Error("--account-id requires your actual 32-character hexadecimal Cloudflare account ID; placeholders are rejected.");
  }
  if ((bucket !== undefined) === (kvNamespace !== undefined)) throw new Error("Choose exactly one of --kv-namespace or --bucket; they are mutually exclusive.");
  const validName = value => typeof value === "string" && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/.test(value);
  const placeholder = value => /(?:^|-)(?:your|example|placeholder|replace|changeme|todo)(?:-|$)/i.test(value);
  if (bucket !== undefined && (!validName(bucket) || bucket.length < 3 || bucket.length > 63 || placeholder(bucket) || ["site-creator-r2", "bucket", "bucket-name"].includes(bucket))) {
    throw new Error("--bucket requires an existing R2 bucket name (3–63 lowercase letters/numbers/hyphens). Sites/default placeholders are rejected.");
  }
  if (kvNamespace !== undefined && !validId(kvNamespace)) throw new Error("--kv-namespace requires the actual 32-character hexadecimal ID of an existing KV namespace; placeholders are rejected.");
  if (!validName(name) || name.length > 63 || placeholder(name)) throw new Error("--name must be a real workers.dev-compatible name of 1–63 lowercase letters/numbers/hyphens.");
  return { accountId: accountId.toLowerCase(), ...(kvNamespace !== undefined ? { kvNamespace: kvNamespace.toLowerCase() } : { bucket }), name };
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.values(value).some(hasValue);
  return value !== undefined && value !== null && value !== "" && value !== false;
}

async function assertNoSymlinks(directory) {
  const { readdir } = await import("node:fs/promises");
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Build contains a symlink; refusing to copy: ${target}`);
    if (entry.isDirectory()) await assertNoSymlinks(target);
  }
}

export async function prepareCloudflareDeploy(options, projectRoot = PROJECT_ROOT) {
  const { accountId, bucket, kvNamespace, name } = validateDeployOptions(options);
  const sourceServer = path.join(projectRoot, "dist/server");
  const sourceClient = path.join(projectRoot, "dist/client");
  let source;
  try {
    source = JSON.parse(await readFile(path.join(sourceServer, "wrangler.json"), "utf8"));
    if (!(await stat(sourceClient)).isDirectory()) throw new Error("client build missing");
  } catch (error) {
    throw new Error(`Run npm run build successfully before preparing deployment. ${error.message}`);
  }
  if (source.main !== "index.js" || source.no_bundle !== true || source.assets?.directory !== "../client") {
    throw new Error("Unsupported build layout. Expected the current Vinext server/index.js + client build; review the new framework output before deploying.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source.compatibility_date ?? "") || !source.compatibility_flags?.includes("nodejs_compat")) throw new Error("Missing verified Workers compatibility settings.");
  if (source.r2_buckets?.length !== 1 || source.r2_buckets[0].binding !== "BUCKET") throw new Error("Expected exactly one R2 BUCKET binding; review any new storage dependencies first.");
  if (Object.keys(source.r2_buckets[0]).some(key => !["binding", "bucket_name"].includes(key))) throw new Error("R2 binding has extra settings requiring explicit external mapping.");
  const unsupported = [...RESOURCE_KEYS, "durable_objects", "queues", "triggers", "vars", "env", "ai", "images", "browser", "ratelimits", "containers", "migrations"].filter(key => hasValue(source[key]));
  if (unsupported.length) throw new Error(`Build has additional settings requiring explicit external mapping: ${unsupported.join(", ")}`);
  if (!(await stat(path.join(sourceServer, "index.js"))).isFile()) throw new Error("Worker entry is not a file.");
  await Promise.all([assertNoSymlinks(sourceServer), assertNoSymlinks(sourceClient)]);
  if (await realpath(sourceServer) !== sourceServer || await realpath(sourceClient) !== sourceClient) throw new Error("Build directories must not be symlinks.");

  const outputParent = path.join(projectRoot, "dist/external-cloudflare");
  const output = path.join(outputParent, name);
  await mkdir(outputParent, { recursive: true });
  if (await realpath(outputParent) !== outputParent) throw new Error("Output parent must not be a symlink.");
  try {
    await lstat(output);
    throw new Error(`Output already exists: ${output}. Review it or rebuild the app before preparing a new snapshot; it will not be overwritten.`);
  } catch (error) { if (error.code !== "ENOENT") throw error; }

  const staging = await import("node:fs/promises").then(fs => fs.mkdtemp(path.join(outputParent, `${name}-preparing-`)));
  try {
    await cp(sourceServer, path.join(staging, "server"), { recursive: true, errorOnExist: true, force: false });
    await cp(sourceClient, path.join(staging, "client"), { recursive: true, errorOnExist: true, force: false });
    const config = {
      name,
      account_id: accountId,
      main: "index.js",
      compatibility_date: source.compatibility_date,
      compatibility_flags: [...source.compatibility_flags],
      no_bundle: true,
      ...(source.rules ? { rules: source.rules } : {}),
      assets: { ...source.assets, directory: "../client" },
      ...(kvNamespace ? {
        kv_namespaces: [{ binding: "SCHEDULE_CACHE", id: kvNamespace }],
        triggers: { crons: ["0 0 * * *"] },
      } : { r2_buckets: [{ binding: "BUCKET", bucket_name: bucket }] }),
      workers_dev: true,
      preview_urls: false,
      observability: { enabled: true },
    };
    await writeFile(path.join(staging, "server/wrangler.json"), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await writeFile(path.join(staging, "preparation.json"), `${JSON.stringify({ format: MARKER, preparedAt: new Date().toISOString(), source: "dist/server + dist/client", workerName: name, storage: kvNamespace ? "kv" : "r2", note: "Prepared locally; no deployment or remote validation performed." }, null, 2)}\n`);
    await rename(staging, output);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  return { output, configPath: path.join(output, "server/wrangler.json") };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) { console.log(HELP); return; }
  const options = { name: "pokedoko" };
  let dryRun = false;
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--dry-run") { dryRun = true; continue; }
    const key = { "--account-id": "accountId", "--bucket": "bucket", "--kv-namespace": "kvNamespace", "--name": "name" }[flag];
    if (!key || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Unknown or incomplete option: ${flag}. Use --help.`);
    if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    seen.add(flag);
    options[key] = args[++index];
  }
  const result = await prepareCloudflareDeploy(options);
  console.log(`Prepared local snapshot: ${result.configPath}`);
  console.log("No login, namespace/bucket creation or deployment has been performed.");
  if (dryRun) {
    const wrangler = path.join(PROJECT_ROOT, "node_modules/wrangler/bin/wrangler.js");
    const child = spawnSync(process.execPath, [wrangler, "deploy", "--config", result.configPath, "--dry-run", "--outdir", path.join(result.output, "dry-run"), "--experimental-autoconfig=false"], {
      cwd: result.output,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: options.accountId, WRANGLER_SEND_METRICS: "false" },
      stdio: "inherit",
      shell: false,
    });
    if (child.error) throw child.error;
    if (child.status !== 0) throw new Error(`Wrangler dry-run failed (${child.status ?? "terminated"}). Snapshot remains available for inspection.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`Cloudflare preparation stopped: ${error.message}`); process.exitCode = 1; });
}
