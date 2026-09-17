// Inject a crypto.randomUUID() polyfill into the DSH frontend index.html.
//
// Browsers only expose crypto.randomUUID() in secure contexts (HTTPS /
// localhost). On plain HTTP LAN access (e.g. http://192.168.x.x:3080) it is
// undefined and breaks the DSH Web UI. This script patches the served
// index.html with a tiny polyfill built on crypto.getRandomValues (the one
// WebCrypto API that IS available in insecure contexts).
//
// Usage: node inject-polyfill.js

const fs = require("fs");
const { execSync } = require("child_process");

const candidates = [
  // npm global install layout (@deepseek-ai/dsh nests its deps)
  "/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html",
  // hoisted layout
  "/usr/local/lib/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html",
];

let indexFile = candidates.find((p) => fs.existsSync(p));
if (!indexFile) {
  try {
    indexFile = execSync(
      'find /usr/local/lib/node_modules -path "*dsh-web-frontend/dist/index.html" | head -1',
    )
      .toString()
      .trim();
  } catch {
    indexFile = "";
  }
}

if (!indexFile) {
  console.error("WARNING: frontend index.html not found, skipping polyfill");
  process.exit(0);
}

let html = fs.readFileSync(indexFile, "utf8");

if (html.includes("randomUUID polyfill")) {
  console.log("Polyfill already present in " + indexFile);
  process.exit(0);
}

const RANDOM_UUID_POLYFILL = `<script>
/* crypto.randomUUID polyfill for non-secure contexts (LAN HTTP) */
(function(){if(typeof crypto.randomUUID!=="function"){crypto.randomUUID=function(){var b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;var h=Array.from(b,function(x){return x.toString(16).padStart(2,"0")});return h.join("").replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/,"$1-$2-$3-$4-$5")};}})();
</script>
`;

// Browser-side isLoopback override.
//
// DSH's browser half derives connection.isLoopback from the address-bar
// hostname (dsh-client-connection). A remote browser (LAN IP / domain) is
// "non-loopback", so ui-settings builds its describe mirror in memory mode
// and the provider directory fails with "settings are unavailable in this
// browser". The Caddy proxy already presents requests upstream as loopback
// (header_up Host/Origin), so align the browser side here: wrap the module
// loader so the connection plugin's apply flips isLoopback to true the
// moment it returns, before cordis notifies any dependent fiber. Same
// technique as dsh-web-startup-auth.
const IS_LOOPBACK_OVERRIDE = `<script>
/* Present remote browsers as loopback so settings/credentials become available.
 * 0.1.5-rc.1: the loader-wrapper approach broke with the lazy module system.
 * This version pre-defines the embedded-carrier transport global instead:
 * connection install reads __DSH_TRANSPORT__.ownsHost as the loopback signal,
 * while rpc/stream fall back to page fetch + default carriers (identical to
 * an unmodified page). One official field, no loader surgery. */
(function(){
  var t = globalThis.__DSH_TRANSPORT__
  if (t === undefined || t.ownsHost !== true) {
    globalThis.__DSH_TRANSPORT__ = Object.assign(Object.create(null), t, { ownsHost: true })
  }
})()
</script>
`;

html = html.replace("</head>", RANDOM_UUID_POLYFILL + IS_LOOPBACK_OVERRIDE + "</head>");
fs.writeFileSync(indexFile, html);
console.log("Polyfill injected into " + indexFile);