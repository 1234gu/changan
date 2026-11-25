param(
    [string]$Distro = 'Ubuntu-24.04',
    [int]$Port = 8311,
    [string]$RemoteSubnet = '192.168.50.0/24'
)

$ErrorActionPreference = 'Stop'

$principal = [Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent()
)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script from an elevated PowerShell session.'
}

$tailscaleIp = (& tailscale.exe ip -4 | Select-Object -First 1).Trim()
$wslAddresses = & wsl.exe -d $Distro -- hostname -I
$wslIp = (($wslAddresses -split '\s+') | Where-Object { $_ } | Select-Object -First 1).Trim()
if (-not $tailscaleIp -or -not $wslIp) {
    throw 'Could not determine the Tailscale or WSL IPv4 address.'
}

$ruleName = "Changan Thor Gateway $Port"
& netsh interface portproxy delete v4tov4 listenaddress=$tailscaleIp listenport=$Port | Out-Null
& netsh interface portproxy add v4tov4 `
    listenaddress=$tailscaleIp `
    listenport=$Port `
    connectaddress=$wslIp `
    connectport=$Port `
    protocol=tcp
if ($LASTEXITCODE -ne 0) {
    throw "netsh portproxy failed with exit code $LASTEXITCODE"
}

Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule -ErrorAction Stop
New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalAddress $tailscaleIp `
    -LocalPort $Port `
    -RemoteAddress $RemoteSubnet `
    -Profile Any | Out-Null

Write-Host "Changan gateway: ${tailscaleIp}:${Port} -> ${wslIp}:${Port}"
Write-Host "Allowed source: $RemoteSubnet"
