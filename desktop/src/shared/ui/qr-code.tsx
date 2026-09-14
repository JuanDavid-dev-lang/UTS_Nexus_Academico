import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { cn } from '@/shared/lib/cn';

/** Margen en módulos. La norma pide cuatro; con menos, algunos lectores no encuentran el borde. */
const ZONA_SILENCIO = 4;

/**
 * Un código QR dibujado como SVG.
 *
 * Un solo `<path>` con un cuadrado por módulo, no un `<rect>` por módulo: un QR
 * de versión 6 son unos 1 700 módulos y React no tiene por qué reconciliar
 * cada uno cada quince segundos.
 *
 * El texto no se interpreta aquí: lo compone el servidor, que es quien tiene el
 * secreto con el que va firmado. Esto solo lo pinta.
 */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  /** Texto para lectores de pantalla: qué es este código. */
  label: string;
  className?: string;
}) {
  const { lado, trazo } = useMemo(() => {
    // Corrección «M» (15 %): aguanta un reflejo del proyector o una esquina
    // tapada sin volver el código tan denso como la «H».
    const qr = qrcode(0, 'M');
    qr.addData(value, 'Byte');
    qr.make();

    const modulos = qr.getModuleCount();
    let d = '';
    for (let fila = 0; fila < modulos; fila++) {
      for (let columna = 0; columna < modulos; columna++) {
        if (qr.isDark(fila, columna)) {
          d += `M${columna + ZONA_SILENCIO} ${fila + ZONA_SILENCIO}h1v1h-1z`;
        }
      }
    }
    return { lado: modulos + ZONA_SILENCIO * 2, trazo: d };
  }, [value]);

  return (
    <svg
      viewBox={`0 0 ${lado} ${lado}`}
      role="img"
      aria-label={label}
      // Sin suavizado: un borde difuminado entre módulos es lo que hace fallar
      // la lectura desde lejos.
      shapeRendering="crispEdges"
      className={cn('block aspect-square', className)}
    >
      <rect width={lado} height={lado} fill="var(--qr-ground)" />
      <path d={trazo} fill="var(--qr-module)" />
    </svg>
  );
}
