# Inicia a ponte do AdsPower neste PC (para o app do NAS controlar os perfis).
# Uso: clique com o direito > "Executar com o PowerShell"  (ou: powershell -ExecutionPolicy Bypass -File tools\iniciar-ponte.ps1)
# Na primeira vez gera um token e guarda em tools\bridge-token.txt; depois reaproveita o mesmo.
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$tokFile = Join-Path $dir 'bridge-token.txt'
if (-not (Test-Path $tokFile)) {
  (-join ((48..57) + (97..122) | Get-Random -Count 28 | ForEach-Object { [char]$_ })) | Set-Content -NoNewline $tokFile
}
$token = (Get-Content $tokFile -Raw).Trim()
$port = if ($env:BRIDGE_PORT) { $env:BRIDGE_PORT } else { '50326' }

# IP da placa que sai para a rede (a que tem gateway)
$ip = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).IPv4Address.IPAddress

# Firewall: libera a porta só para a rede local (precisa de administrador na primeira vez)
$regra = 'JRH AdsPower Ponte'
if (-not (Get-NetFirewallRule -DisplayName $regra -ErrorAction SilentlyContinue)) {
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($admin) {
    New-NetFirewallRule -DisplayName $regra -Direction Inbound -Protocol TCP -LocalPort $port -RemoteAddress LocalSubnet -Action Allow | Out-Null
    Write-Host "Firewall: porta $port liberada para a rede local." -ForegroundColor Green
  } else {
    Write-Host "ATENÇÃO: falta liberar a porta $port no Firewall. Abra o PowerShell como administrador e rode:" -ForegroundColor Yellow
    Write-Host "  New-NetFirewallRule -DisplayName '$regra' -Direction Inbound -Protocol TCP -LocalPort $port -RemoteAddress LocalSubnet -Action Allow" -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host 'No app do NAS (Configurações > Conexões), preencha:' -ForegroundColor Cyan
Write-Host "  AdsPower · URL ............ http://${ip}:$port"
Write-Host "  AdsPower · token da ponte . $token"
Write-Host '  AdsPower · API key ........ (a mesma do AdsPower; vazio se a "Verificação de API" estiver desligada)'
Write-Host ''
$env:BRIDGE_TOKEN = $token
$env:BRIDGE_PORT = $port
node (Join-Path $dir 'pc-bridge.js')
