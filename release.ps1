# ============================================
# MISPL Release Script (Robuuste versie)
# Bouwt een .vsix en kopieert replaceWords.json
# Output gaat naar de map: Release
# ============================================

Write-Host "=== MISPL Release Script ==="

# 1. Projectpad instellen
$projectPath = "C:\mispl"
Set-Location $projectPath

# 2. Release-map instellen
$releasePath = Join-Path $projectPath "Release"
if (-not (Test-Path $releasePath)) {
    Write-Host "Release map bestaat niet. Aanmaken..."
    New-Item -ItemType Directory -Path $releasePath | Out-Null
}

# 3. Controleer of npm beschikbaar is
Write-Host "Controleren op npm..."
$npmCmd = Get-Command "npm" -ErrorAction SilentlyContinue

if (-not $npmCmd) {
    Write-Host "FOUT: 'npm' is niet beschikbaar."
    Write-Host "Installeer eerst Node.js (inclusief npm) vanaf https://nodejs.org/"
    Write-Host "Na installatie: herstart PowerShell en probeer dit script opnieuw."
    exit 1
}

Write-Host "npm gevonden op: $($npmCmd.Source)"

# 4. VSCE zoeken
Write-Host "Controleren op VSCE..."

# Zoek via PATH
$vsceCmd = Get-Command "vsce" -ErrorAction SilentlyContinue

# Zoek expliciet in de npm globale map
$npmVsce = Join-Path "$env:APPDATA\npm" "vsce.cmd"
if (-not $vsceCmd -and (Test-Path $npmVsce)) {
    $vsceCmd = $npmVsce
}

# Indien nog steeds niet gevonden → proberen te installeren
if (-not $vsceCmd) {
    Write-Host "VSCE niet gevonden. Installeren met npm..."
    & $npmCmd.Source install -g @vscode/vsce

    # Na installatie opnieuw zoeken
    $vsceCmd = Get-Command "vsce" -ErrorAction SilentlyContinue
    if (-not $vsceCmd -and (Test-Path $npmVsce)) {
        $vsceCmd = $npmVsce
    }

    if (-not $vsceCmd) {
        Write-Host "FOUT: VSCE kon niet worden geïnstalleerd of gevonden."
        Write-Host "Voer handmatig uit: npm install -g @vscode/vsce"
        exit 1
    }
}

Write-Host "VSCE gevonden op: $($vsceCmd.Source)"

# 5. VSIX bouwen
Write-Host "Bouwen van VSIX..."

# Bestandsnaam met timestamp
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$vsixFile = Join-Path $releasePath "mispl-$timestamp.vsix"

# VSCE uitvoeren
& $vsceCmd.Source package --out $vsixFile

if ($LASTEXITCODE -ne 0) {
    Write-Host "VSIX build mislukt (exitcode $LASTEXITCODE)."
    exit 1
}

Write-Host "VSIX gebouwd: $vsixFile"

# 6. replaceWords.json kopiëren
$replaceWordsSrc = Join-Path $projectPath "replaceWords.json"
$replaceWordsDst = Join-Path $releasePath "replaceWords.json"

if (Test-Path $replaceWordsSrc) {
    Write-Host "Kopieer replaceWords.json..."
    Copy-Item $replaceWordsSrc $replaceWordsDst -Force
} else {
    Write-Host "WAARSCHUWING: replaceWords.json niet gevonden!"
}

# 7. Klaar
Write-Host "=== Release voltooid ==="
Write-Host "Bestanden beschikbaar in: $releasePath"
Write-Host " - $(Split-Path $vsixFile -Leaf)"
Write-Host " - replaceWords.json (indien aanwezig)"
