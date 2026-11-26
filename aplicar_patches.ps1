<#
  Aplica os patches de desempenho do mundo "Clebao!" nos packs INSTALADOS do Minecraft Bedrock.

  Seguranca:
   - Por padrao so SIMULA (mostra o que faria). Nada e alterado sem -Aplicar.
   - So mexe em packs cujo manifest.json tem o MESMO uuid E a MESMA versao do patch.
   - Antes de sobrescrever, guarda o arquivo original como <arquivo>.orig_clebao (uma vez so).
   - Nunca toca em mundos (minecraftWorlds) nem apaga packs.
   - -Reverter restaura todos os .orig_clebao encontrados nos packs-alvo.

  Uso (PowerShell, com o Minecraft FECHADO), dentro da pasta _patches_clebao:
     .\aplicar_patches.ps1                          # simula
     .\aplicar_patches.ps1 -Aplicar                 # aplica os recomendados
     .\aplicar_patches.ps1 -Aplicar -Somente ImprovisedGuns   # aplica so os que contem "ImprovisedGuns"
     .\aplicar_patches.ps1 -Aplicar -Opcional       # inclui a pasta _opcional
     .\aplicar_patches.ps1 -Reverter                # desfaz (restaura .orig_clebao)
  Se o Windows bloquear o script:  powershell -ExecutionPolicy Bypass -File .\aplicar_patches.ps1
#>
param(
  [switch]$Aplicar,
  [switch]$Opcional,
  [switch]$Reverter,
  [string]$Somente = "",
  [string]$Raiz = (Join-Path $env:APPDATA "Minecraft Bedrock\Users\Shared\games\com.mojang")
)

$ErrorActionPreference = "Stop"
$base = Split-Path -Parent $MyInvocation.MyCommand.Path
$alvos = Get-Content -Raw -Encoding UTF8 (Join-Path $base "alvos.json") | ConvertFrom-Json

function Read-Manifest([string]$path) {
  try {
    $txt = Get-Content -Raw -Encoding UTF8 $path
    $txt = [regex]::Replace($txt, '(?m)^\s*//.*$', '')
    return $txt | ConvertFrom-Json
  } catch { return $null }
}
function Format-Version($v) {
  if ($null -eq $v) { return "" }
  if ($v -is [System.Array]) { return ($v -join ".") }
  return [string]$v
}

# indice dos packs instalados: "uuid|versao" -> pasta
$index = @{}
foreach ($sub in @("behavior_packs", "resource_packs", "development_behavior_packs", "development_resource_packs")) {
  $dir = Join-Path $Raiz $sub
  if (-not (Test-Path $dir)) { continue }
  foreach ($pack in Get-ChildItem $dir -Directory) {
    $m = Read-Manifest (Join-Path $pack.FullName "manifest.json")
    if ($null -eq $m -or $null -eq $m.header) { continue }
    $key = ("{0}|{1}" -f $m.header.uuid, (Format-Version $m.header.version)).ToLower()
    if (-not $index.ContainsKey($key)) { $index[$key] = @() }
    $index[$key] += $pack.FullName
  }
}

$modo = if ($Reverter) { "REVERTER" } elseif ($Aplicar) { "APLICAR" } else { "SIMULACAO (nada sera alterado)" }
Write-Host "=== Modo: $modo" -ForegroundColor Cyan
Write-Host "=== Raiz dos packs: $Raiz"
$total = 0; $pulados = 0

foreach ($a in $alvos) {
  if ($a.opcional -and -not $Opcional) { continue }
  if ($Somente -and ($a.patch -notlike "*$Somente*")) { continue }
  $src = Join-Path $base ($a.patch -replace '/', '\')
  $key = ("{0}|{1}" -f $a.uuid, $a.versao).ToLower()
  Write-Host ""
  Write-Host ">>> $($a.nome)" -ForegroundColor Yellow
  if (-not $index.ContainsKey($key)) {
    Write-Host "    PULADO: nenhum pack instalado com uuid $($a.uuid) versao $($a.versao)." -ForegroundColor DarkYellow
    $pulados++; continue
  }
  foreach ($dest in $index[$key]) {
    Write-Host "    pack instalado: $dest"
    $files = Get-ChildItem $src -Recurse -File
    foreach ($f in $files) {
      $rel = $f.FullName.Substring($src.Length).TrimStart('\')
      $target = Join-Path $dest $rel
      $backup = "$target.orig_clebao"
      if ($Reverter) {
        if (Test-Path $backup) {
          Write-Host "    restaurar  $rel"
          Copy-Item $backup $target -Force; Remove-Item $backup -Force; $total++
        } elseif (Test-Path $target) {
          Write-Host "    (sem backup, mantido) $rel" -ForegroundColor DarkGray
        }
        continue
      }
      $acao = if (Test-Path $target) { "substituir" } else { "criar     " }
      Write-Host "    $acao $rel"
      if ($Aplicar) {
        $dir = Split-Path -Parent $target
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
        if ((Test-Path $target) -and -not (Test-Path $backup)) { Copy-Item $target $backup -Force }
        Copy-Item $f.FullName $target -Force
      }
      $total++
    }
  }
}
Write-Host ""
Write-Host "=== Arquivos processados: $total | packs nao encontrados: $pulados" -ForegroundColor Cyan
if (-not $Aplicar -and -not $Reverter) { Write-Host "=== Era so simulacao. Rode com -Aplicar para gravar." -ForegroundColor Cyan }
