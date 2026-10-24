// Cloudflare DDNS updater — reads config from ~/eari-sync-data/ddns.json
// { token, zone, record, name }
// cron: */5 * * * * <node> ~/eari-sync/scripts/cf-ddns.cjs >> ~/eari-sync-data/ddns.log 2>&1
const fs = require("fs");
const path = require("path");

(async () => {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.env.HOME, "eari-sync-data", "ddns.json"), "utf8"));
    const ip = (await (await fetch("https://api.ipify.org")).text()).trim();
    const h = { Authorization: "Bearer " + cfg.token, "Content-Type": "application/json" };
    const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${cfg.zone}/dns_records/${cfg.record}`, { headers: h });
    const cur = (await r.json()).result?.content;
    if (ip && cur && ip !== cur) {
      const pr = await fetch(`https://api.cloudflare.com/client/v4/zones/${cfg.zone}/dns_records/${cfg.record}`, {
        method: "PUT",
        headers: h,
        body: JSON.stringify({ type: "A", name: cfg.name, content: ip, ttl: 300, proxied: false }),
      });
      console.log(new Date().toISOString(), "updated ->", ip, "success:", (await pr.json()).success);
    } else {
      console.log(new Date().toISOString(), "no change:", ip);
    }
  } catch (e) {
    console.error(new Date().toISOString(), "ddns error:", e.message);
    process.exit(1);
  }
})();
