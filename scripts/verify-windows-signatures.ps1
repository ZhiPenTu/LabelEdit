param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference = 'Stop'
$files = Get-ChildItem -LiteralPath $Root -Recurse -File | Where-Object { $_.Extension -in '.exe', '.dll', '.pyd' }
if (!$files) { throw 'No production binaries found.' }
foreach ($file in $files) {
  $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
  if ($signature.Status -ne 'Valid') { throw "Executable signature invalid: $($file.Name)" }
}
