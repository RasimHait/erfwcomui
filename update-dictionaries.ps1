# Пересоздаёт dictionaries/manifest.json: список словарей и их SHA-256.
# Приложение сверяет хэши и перекачивает только изменившиеся файлы.
# Запускайте после любого изменения словарей, перед коммитом:
#   powershell -ExecutionPolicy Bypass -File .\update-dictionaries.ps1

$folder = Join-Path $PSScriptRoot 'dictionaries'

$files = Get-ChildItem -Path $folder -File |
    Where-Object { $_.Extension -in '.dic', '.aff' } |
    Sort-Object Name |
    ForEach-Object {
        [ordered]@{
            name   = $_.Name
            size   = $_.Length
            sha256 = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }

$json = [ordered]@{ files = @($files) } | ConvertTo-Json -Depth 3
# UTF-8 без BOM
[System.IO.File]::WriteAllText((Join-Path $folder 'manifest.json'), $json + "`n")

Write-Host "manifest.json: $(@($files).Count) файлов"
