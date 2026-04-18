# Pas de bestandsnamen aan naar wens
$inputFile = "C:\mispl\Release\mispl.code-snippets.json"
$outputFile = "C:\mispl\Release\mispl.code-snippets_aangepast.json"

# Lees het bestand in als een array van platte tekstregels
$lines = Get-Content -Path $inputFile -Encoding UTF8
$lastPrefixArgs = $null

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]

    # Zoek naar de "prefix" regel en bewaar de argumenten die tussen de ( ) staan
    if ($line -match '"prefix":\s*".*?\((.*?)\)"') {
        $lastPrefixArgs = $matches[1]
    }

    # Zoek naar de "body" regel. 
    # Deze regex zoekt specifiek naar: "body": "Functienaam(Argumenten)",
    if ($line -match '^(\s*"body":\s*")([A-Za-z0-9_\.]+)\((.*?)\)(",?)$') {
        
        # Alleen uitvoeren als er argumenten tussen de haakjes staan
        if ($lastPrefixArgs -ne $null -and $matches[3] -ne "") {
            $funcName = $matches[2]
            $bodyArgsStr = $matches[3]

            $pArgs = $lastPrefixArgs -split ','
            $bArgs = $bodyArgsStr -split ','

            # Alleen vervangen als we exact evenveel argumenten in de prefix als in de body vonden
            if ($pArgs.Count -eq $bArgs.Count) {
                $newArgs = @()

                for ($j = 0; $j -lt $pArgs.Count; $j++) {
                    $pArg = $pArgs[$j].Trim()
                    $bArg = $bArgs[$j].Trim()

                    # Pak het laatste woord uit de prefix (de variabelenaam, bijv. "TableName" uit "String TableName")
                    $words = $pArg -split '\s+'
                    $varName = $words[-1]

                    # Bepaal het kleine voorvoegsel op basis van de letter in de body
                    $typeLetter = "x_"
                    switch ($bArg) {
                        "I"  { $typeLetter = "i" }
                        "S"  { $typeLetter = "s" }
                        "L"  { $typeLetter = "l" }
                        "F"  { $typeLetter = "f" }
                        "D"  { $typeLetter = "d" }
                        "T"  { $typeLetter = "t" }
                        "DT" { $typeLetter = "dt" }
                        "Tm" { $typeLetter = "tm" }
                        "X"  { $typeLetter = "x_" }
                    }

                    $newArgs += "${typeLetter}${varName}"
                }

                # Bouw de nieuwe regel op (behoudt originele inspringing en leestekens!)
                $newLine = $matches[1] + $funcName + "(" + ($newArgs -join ',') + ")" + $matches[4]
                
                # Overschrijf de regel in het geheugen
                $lines[$i] = $newLine
            }
        }
    }
}

# Sla alle regels weer op in het nieuwe bestand
$lines | Set-Content -Path $outputFile -Encoding UTF8

Write-Host "✅ Snippets succesvol aangepast en opgeslagen in $outputFile" -ForegroundColor Green