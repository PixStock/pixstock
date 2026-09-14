/**
 * Serves the built vault with the headers it will be deployed behind.
 *
 *   npm run build -w @pixstock/vault
 *   node scripts/serve-vault.mjs [port]
 *
 * The headers are read from `apps/vault/vercel.json` rather than repeated
 * here, so this cannot drift from production. That matters for one of them in
 * particular: `connect-src 'none'` is the air gap a person can watch the
 * browser enforce, and a local server that quietly omitted it would make the
 * test worthless.
 *
 * Why the built app rather than the dev server: the service worker, the
 * precache and the manifest only exist in a build, and those are exactly what
 * a phone needs in order to keep working once it goes into airplane mode.
 *
 * This is also what runs inside the vault's container image, so the headers a
 * deployment serves and the ones checked locally are the same ones.
 *
 * Reaching it from a phone needs HTTPS — the camera and WebAuthn both require
 * a secure context — which means a deployment, or any tunnel pointed at this
 * port for a quick test.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const ROOT = join(process.cwd(), "apps/vault/dist");
// Railway and most hosts hand the port in the environment; the argument is
// for running it by hand.
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 5183);

if (!existsSync(join(ROOT, "index.html"))) {
  console.error(`No build at ${ROOT}. Run: npm run build -w @pixstock/vault`);
  process.exit(1);
}

const config = JSON.parse(readFileSync("apps/vault/vercel.json", "utf8"));

/** The headers vercel.json declares for a path. */
function headersFor(pathname) {
  const rule = config.headers?.find((entry) => entry.source === pathname);
  return rule ? Object.fromEntries(rule.headers.map((h) => [h.key, h.value])) : {};
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");

  // Contained to the build directory: this serves a phone on someone's
  // network, and path traversal out of it would serve them the repository.
  const wanted = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let file = join(ROOT, wanted === "/" ? "index.html" : wanted);
  if (!file.startsWith(ROOT)) file = join(ROOT, "index.html");

  // Single page: anything that is not a file is the app itself.
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, "index.html");

  const isDocument = file === join(ROOT, "index.html");
  res.writeHead(200, {
    "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
    ...headersFor(isDocument ? "/" : pathname),
  });
  res.end(readFileSync(file));
}).listen(PORT, "0.0.0.0", () => {
  // One line, and it says what a deployment log needs: which build, on which
  // port, behind which headers.
  console.log(`vault listening on ${PORT} — static build, production headers`);
});
