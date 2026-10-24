const fs = require("fs");
for (const p of ["plugin/manifest.json", "plugin/package.json"]) {
  let s = fs.readFileSync(p, "utf8");
  s = s.replace(/"version":\s*"0\.1\.0"/, '"version": "0.2.0"');
  fs.writeFileSync(p, s, "utf8");
  console.log(p, "->", /"version":\s*"([^"]+)"/.exec(s)?.[1]);
}
