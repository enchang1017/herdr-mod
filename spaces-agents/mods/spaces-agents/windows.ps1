param(
  [ValidateSet('hash', 'snapshot', 'registry', 'parent', 'monitor', 'connect')]
  [string]$Mode,
  [string]$Payload
)
$ErrorActionPreference = 'Stop'

function ModFiles([string]$Root) {
  Get-ChildItem -LiteralPath $Root -Recurse -File | Where-Object {
    $_.Name -notin @('gpui-kit.d.ts', 'jsconfig.json') -and
    $_.FullName.Substring($Root.Length) -notmatch '[\\/]\.'
  } | Sort-Object FullName
}

switch ($Mode) {
  'hash' {
    $root = (Resolve-Path -LiteralPath $Payload).Path.TrimEnd('\', '/')
    $lines = ModFiles $root | ForEach-Object { $_.FullName.Substring($root.Length).Replace('\','/') + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    $bytes = [Text.Encoding]::UTF8.GetBytes(($lines -join "`n"))
    [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
  }
  'snapshot' {
    $data = $Payload | ConvertFrom-Json
    $sourceRoot = (Resolve-Path -LiteralPath $data.source).Path.TrimEnd('\', '/')
    $appRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
    $allowedRoot = [IO.Path]::GetFullPath((Join-Path $appRoot 'data/spaces-agents/upstream')) + [IO.Path]::DirectorySeparatorChar
    $destination = [IO.Path]::GetFullPath($data.destination).TrimEnd('\', '/')
    if (!$destination.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Snapshot destination must be inside data/spaces-agents/upstream' }
    if (Test-Path -LiteralPath $destination) {
      if (!$data.replace) { throw 'Snapshot already exists' }
      if ((Get-Item -LiteralPath $destination).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Snapshot cannot be a directory link' }
      # The absolute destination was checked above. Remove only its files;
      # leave unrelated folders and the enclosing app data intact.
      foreach ($item in Get-ChildItem -LiteralPath $destination -Recurse -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Snapshot cannot contain links' }
      }
      Get-ChildItem -LiteralPath $destination -Recurse -File -Force | ForEach-Object { Remove-Item -LiteralPath $_.FullName }
    }
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    foreach ($file in ModFiles $sourceRoot) {
      $relative = $file.FullName.Substring($sourceRoot.Length).TrimStart('\', '/')
      $target = Join-Path $destination $relative
      New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
      Copy-Item -LiteralPath $file.FullName -Destination $target
    }
  }
  'registry' {
    $entries = @($Payload | ConvertFrom-Json)
    foreach ($entry in $entries) {
      if ($entry.pid -and (Get-Process -Id $entry.pid -ErrorAction SilentlyContinue)) { "pid $($entry.pid)" }
      if ($entry.transcript -and (Test-Path -LiteralPath $entry.transcript -PathType Leaf)) { "file $($entry.transcript)" }
    }
  }
  'parent' { (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId }
  'monitor' {
    $data = $Payload | ConvertFrom-Json
    $targetId = [int]$data.pid
    $process = Get-Process -Id $targetId
    $perf = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "IDProcess=$targetId" | Select-Object -First 1
    if (!$perf) { throw "No performance sample for process $targetId" }
    $sample = @{cpu=([double]$perf.PercentProcessorTime / [Environment]::ProcessorCount);mb=($process.WorkingSet64 / 1MB)}
    if ($data.withChildren) {
      $sample.children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$targetId" | Where-Object { $_.ProcessId -ne $PID } | ForEach-Object Name)
    }
    $sample | ConvertTo-Json -Compress
  }
  'connect' {
    $Payload | hc connect
    if ($LASTEXITCODE -ne 0) { throw "hc connect exited $LASTEXITCODE" }
  }
  default { throw 'Unknown helper mode' }
}
