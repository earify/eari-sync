const fs = require("fs");

// api.ts already done; finish indexer + sync-engine unused catch bindings
let ix = fs.readFileSync("plugin/src/indexer.ts", "utf8");
ix = ix.split("    } catch (e) {\n      // fall through to adapter listing\n    }").join("    } catch {\n      // fall through to adapter listing\n    }");
ix = ix.split("    } catch (e) {\n      // missing or unreadable directory\n    }").join("    } catch {\n      // missing or unreadable directory\n    }");
fs.writeFileSync("plugin/src/indexer.ts", ix, "utf8");

let s = fs.readFileSync("plugin/src/sync-engine.ts", "utf8");
s = s.split("catch (e) { /* ignore */ }").join("catch { /* ignore */ }");
s = s.split("catch (e) { /* missing is fine */ }").join("catch { /* missing is fine */ }");
s = s.split("catch (e) { /* already exists */ }").join("catch { /* already exists */ }");
s = s.split("catch (e) { /* best effort */ }").join("catch { /* best effort */ }");
s = s.split("catch (e) { /* already closed */ }").join("catch { /* already closed */ }");
s = s.split("catch (e) { /* unreadable dir */ return; }").join("catch { /* unreadable dir */ return; }");
fs.writeFileSync("plugin/src/sync-engine.ts", s, "utf8");

// bump 0.2.2
for (const p of ["plugin/manifest.json", "plugin/package.json"]) {
  let m = fs.readFileSync(p, "utf8");
  m = m.replace(/"version":\s*"0\.2\.1"/, '"version": "0.2.2"');
  fs.writeFileSync(p, m, "utf8");
}
let v = JSON.parse(fs.readFileSync("plugin/versions.json", "utf8"));
v["0.2.2"] = "1.4.0";
fs.writeFileSync("plugin/versions.json", JSON.stringify(v, null, 2) + "\n", "utf8");
console.log("0.2.2 prepared");
