$ErrorActionPreference = "Stop"
Set-Location "D:\.working\Antigravity\Vibe\Obsidian things\eari-sync\plugin\src"
$c = [System.Collections.Generic.List[string]](Get-Content sync-engine.ts -Encoding utf8)
$s = ($c | Select-String 'async syncNow\(\): Promise<void> \{').LineNumber
$e = -1
for ($i = $s; $i -lt $c.Count; $i++) {
  if ($c[$i] -eq '    });') {
    for ($j = $i + 1; $j -lt $c.Count; $j++) {
      if ($c[$j] -eq '  }') { $e = $j + 1; break }
    }
    break
  }
}
if ($e -lt 0) { throw "end not found" }
Write-Host "syncNow spans lines $s..$e"
$newText = @'
  async syncNow(onProgress?: (msg: string) => void): Promise<void> {
    return this.enqueue(async () => {
      if (this.syncing) return;
      this.syncing = true;
      this.stats = { up: 0, down: 0, conflicts: 0 };
      this.deps.onStatus("syncing");
      onProgress?.("동기화 중… (변경사항 확인)");
      try {
        await this.pullChanges();
        onProgress?.(this.stats.down > 0 ? `변경사항 적용 (↓${this.stats.down})` : "변경사항 없음, 업로드 확인 중…");
        await this.pushAll();
        await this.deps.saveSettings();
        const summary = `완료 — ↓${this.stats.down} · ↑${this.stats.up}` + (this.stats.conflicts ? ` · 충돌 ${this.stats.conflicts}` : "");
        onProgress?.(summary);
        this.deps.onStatus("done", `↓${this.stats.down} ↑${this.stats.up}`);
      } catch (e: any) {
        console.error("sync error", e);
        const msg = e?.message ?? String(e);
        onProgress?.(`오류 — ${msg}`);
        if (String(msg).includes("401") || String(msg).includes("unauthorized")) {
          this.deps.onStatus("auth", msg);
        } else {
          this.deps.onStatus("error", msg);
        }
      } finally {
        this.syncing = false;
      }
    });
  }
'@
$newList = New-Object System.Collections.Generic.List[string]
foreach ($line in ($newText -split "`r?`n")) { $newList.Add($line) }
$c.RemoveRange($s - 1, $e - $s + 1)
$c.InsertRange($s - 1, $newList)
Set-Content sync-engine.ts -Value $c -Encoding utf8
Write-Host "syncNow replaced OK"
