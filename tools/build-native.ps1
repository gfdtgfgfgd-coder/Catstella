$ErrorActionPreference = 'Stop'
$nativeSource = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../Antigravity-Cat-Widget/src/native/ForegroundHost.cs')).Path
$nativeVersion = (Get-FileHash -LiteralPath $nativeSource -Algorithm SHA256).Hash.Substring(0,12).ToLowerInvariant()
$nativeDirectory = Split-Path -Parent $nativeSource
$nativeOutput = Join-Path $nativeDirectory ('ForegroundHost.' + $nativeVersion + '.exe')
if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($nativeOutput)) -ne $nativeDirectory) { throw 'Unexpected native output directory' }
if (Test-Path -LiteralPath $nativeOutput) { Write-Output ('Native helper already built: ' + $nativeOutput); return }
& 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' '/nologo' '/target:exe' '/optimize+' ('/out:' + $nativeOutput) $nativeSource
if ($LASTEXITCODE -ne 0) { throw 'Native helper compilation failed' }
Write-Output ('Native helper built for the next desktop start: ' + $nativeOutput)
