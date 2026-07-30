<#
.SYNOPSIS
    Responde SI o NO a "¿hay que rehacer esto?" para el lanzador de escritorio.

.DESCRIPTION
    Compara la fecha de una referencia (el ejecutable compilado, o la marca que
    npm deja al instalar) contra la del codigo fuente. Vive en un archivo propio
    y no incrustado en abrir_escritorio.bat porque un `for /f` de cmd con una
    tuberia de PowerShell dentro exige un escapado que falla en silencio: la
    comprobacion devuelve vacio, el lanzador concluye "esta al dia" y abre una
    version vieja del programa sin avisar.

    Ante la duda responde SI. Recompilar de mas cuesta tiempo; abrir un binario
    obsoleto cuesta una sesion entera de depuracion sobre codigo que ya no es el
    que se esta ejecutando.

.PARAMETER Modo
    dependencias : compara package.json y package-lock.json contra la marca de
                   la ultima instalacion de npm.
    compilacion  : compara el codigo fuente y la configuracion contra el .exe.

.PARAMETER Raiz
    Carpeta del repositorio. Por defecto, dos niveles por encima de este script.

.OUTPUTS
    La palabra SI o NO en la salida estandar.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('dependencias', 'compilacion')]
    [string]$Modo,

    [string]$Raiz
)

Set-StrictMode -Version Latest

if (-not $Raiz) {
    $Raiz = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

function Resolver {
    param([string[]]$Relativas)
    foreach ($relativa in $Relativas) {
        Join-Path -Path $Raiz -ChildPath $relativa
    }
}

# Devuelve la fecha de modificacion mas reciente de un conjunto de rutas, que
# pueden ser archivos sueltos o carpetas a recorrer. Las rutas ausentes se
# ignoran: un proyecto sin src-tauri/capabilities sigue siendo valido.
function FechaMasReciente {
    param([string[]]$Rutas)

    $maxima = [datetime]::MinValue
    foreach ($ruta in $Rutas) {
        if (-not (Test-Path -LiteralPath $ruta)) { continue }

        $elemento = Get-Item -LiteralPath $ruta
        if ($elemento.PSIsContainer) {
            $hijos = @(Get-ChildItem -LiteralPath $ruta -Recurse -File -ErrorAction SilentlyContinue)
            foreach ($hijo in $hijos) {
                if ($hijo.LastWriteTime -gt $maxima) { $maxima = $hijo.LastWriteTime }
            }
        }
        elseif ($elemento.LastWriteTime -gt $maxima) {
            $maxima = $elemento.LastWriteTime
        }
    }
    return $maxima
}

try {
    switch ($Modo) {
        'dependencias' {
            # npm reescribe node_modules\.package-lock.json en cada instalacion,
            # asi que sirve de marca fiable de "cuando se instalo por ultima vez".
            $referencia = Join-Path $Raiz 'desktop\node_modules\.package-lock.json'
            $fuentes = Resolver @(
                'desktop\package.json',
                'desktop\package-lock.json'
            )
        }
        'compilacion' {
            $referencia = Join-Path $Raiz 'desktop\src-tauri\target\release\uts-nexus-desktop.exe'
            $fuentes = Resolver @(
                'desktop\src',
                'desktop\src-tauri\src',
                'desktop\src-tauri\capabilities',
                'desktop\package.json',
                'desktop\index.html',
                'desktop\vite.config.ts',
                'desktop\src-tauri\Cargo.toml',
                'desktop\src-tauri\tauri.conf.json'
            )
        }
    }

    if (-not (Test-Path -LiteralPath $referencia)) {
        Write-Output 'SI'
        exit 0
    }

    $fechaReferencia = (Get-Item -LiteralPath $referencia).LastWriteTime
    $fechaFuentes = FechaMasReciente -Rutas $fuentes

    if ($fechaFuentes -gt $fechaReferencia) { Write-Output 'SI' } else { Write-Output 'NO' }
    exit 0
}
catch {
    # Un fallo aqui no debe impedir abrir la app, pero tampoco puede hacernos
    # creer que todo esta al dia: se responde SI y el lanzador rehace el trabajo.
    Write-Output 'SI'
    exit 0
}
