import { writeFile } from "node:fs/promises";
import { connectConsoleV1 } from "../bridge/console-v1-client.mjs";

// Produce a single HTML file for the Console's CSP-isolated upload path. The
// browser client is inlined from its actual implementation, with no CDN/imports.
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AWE Console connection sample</title>
<style>body{margin:0;padding:32px;background:#10141b;color:#e9edf4;font:16px system-ui;line-height:1.5}main{max-width:720px;margin:auto}h1{font-size:26px}button{background:#def09f;border:0;border-radius:6px;padding:12px 18px;margin:8px 8px 8px 0;cursor:pointer}button:disabled{opacity:.4}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#19202b;padding:20px;border-radius:8px}small{color:#a9b6c8}</style></head>
<body><main><small>AWE CONSOLE V1 · CONNECTION SAMPLE</small><h1>A cartridge connected to its console.</h1><p id="status">Connecting to the parent console…</p><button id="info" disabled>Read console information</button><button id="world" disabled>Read granted world</button><pre id="result">No request sent.</pre><p>This sample requests read access only. It does not access a wallet or issue transactions.</p></main>
<script>
const connectConsoleV1 = (${connectConsoleV1.toString()});
(async () => {
  const status = document.getElementById('status');
  const output = document.getElementById('result');
  try {
    // Browser-supplied referrer, never an origin copied from a handshake message.
    // Installations that suppress the referrer must configure a fixed origin here.
    if (!document.referrer) throw new Error('Configure the expected parent origin when the host suppresses document.referrer.');
    const expectedParentOrigin = new URL(document.referrer).origin;
    const client = await connectConsoleV1({ expectedParentOrigin });
    status.textContent = 'Connected through the Console v1 opaque-frame profile.';
    for (const [id, method] of [['info', 'console.info'], ['world', 'world.read']]) {
      const button = document.getElementById(id);
      button.disabled = false;
      button.onclick = async () => {
        try { output.textContent = JSON.stringify(await client.request(method), null, 2); }
        catch (error) { output.textContent = error.message; }
      };
    }
  } catch (error) { status.textContent = error.message; }
})();
</script></body></html>
`;
await writeFile(new URL("../examples/console-v1-cartridge.html", import.meta.url), html);
