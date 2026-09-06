import { describe, expect, it } from 'vitest';
import {
  ENTRADA_DE_ESCANER,
  exigirTipoReal,
  FORMATOS_INSTITUCIONALES,
  IMAGENES,
  nombreEnDisco,
  nombreParaDescarga,
} from '../src/shared/uploads.js';

/** Cabecera de archivo seguida de relleno, que es lo que ve el comprobador. */
function conFirma(...bytes: number[]): Buffer {
  return Buffer.concat([Buffer.from(bytes), Buffer.alloc(64)]);
}

const PNG = conFirma(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = conFirma(0xff, 0xd8, 0xff);
const PDF = conFirma(0x25, 0x50, 0x44, 0x46);
const ZIP = conFirma(0x50, 0x4b, 0x03, 0x04); // .xlsx y .docx son ZIP por dentro
const HTML = Buffer.from('<!doctype html><script>alert(1)</script>');

describe('comprobación de tipo real de un archivo subido', () => {
  it('acepta una imagen cuya firma coincide con lo declarado', () => {
    const tipo = exigirTipoReal({ mimetype: 'image/png', buffer: PNG }, IMAGENES);
    expect(tipo.extension).toBe('.png');
  });

  it('rechaza un archivo cuyo contenido no es el que declara', () => {
    // El caso concreto: HTML declarado como imagen. `file.mimetype` lo escribe
    // el cliente, así que sin mirar los bytes esto pasaba.
    expect(() => exigirTipoReal({ mimetype: 'image/png', buffer: HTML }, IMAGENES)).toThrow(
      /no es un documento válido/i,
    );
  });

  it('rechaza un mimetype que no está en la lista aunque los bytes sean válidos', () => {
    expect(() => exigirTipoReal({ mimetype: 'text/html', buffer: PNG }, IMAGENES)).toThrow(
      /no permitido/i,
    );
  });

  it('el error lleva statusCode 400, para que no salga como un 500 reintentable', () => {
    try {
      exigirTipoReal({ mimetype: 'image/png', buffer: HTML }, IMAGENES);
      expect.unreachable('debía lanzar');
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(400);
    }
  });

  it('un PDF declarado como Word se rechaza aunque los dos estén en la lista', () => {
    expect(() =>
      exigirTipoReal(
        {
          mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: PDF,
        },
        FORMATOS_INSTITUCIONALES,
      ),
    ).toThrow(/no es un documento válido/i);
  });

  it('reconoce el .docx por su firma de ZIP', () => {
    const tipo = exigirTipoReal(
      {
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: ZIP,
      },
      FORMATOS_INSTITUCIONALES,
    );
    expect(tipo.extension).toBe('.docx');
  });

  it('el escáner acepta foto, PDF y hoja de cálculo, y nada más', () => {
    expect(exigirTipoReal({ mimetype: 'image/jpeg', buffer: JPEG }, ENTRADA_DE_ESCANER).extension).toBe('.jpg');
    expect(exigirTipoReal({ mimetype: 'application/pdf', buffer: PDF }, ENTRADA_DE_ESCANER).extension).toBe('.pdf');
    expect(
      exigirTipoReal(
        { mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: ZIP },
        ENTRADA_DE_ESCANER,
      ).extension,
    ).toBe('.xlsx');
    expect(() =>
      exigirTipoReal({ mimetype: 'application/x-msdownload', buffer: ZIP }, ENTRADA_DE_ESCANER),
    ).toThrow(/no permitido/i);
  });
});

describe('nombres de archivo', () => {
  it('el nombre en disco sale del tipo reconocido, no del cliente', () => {
    const nombre = nombreEnDisco({ mimetype: 'image/png', extension: '.png', firma: () => true });
    expect(nombre).toMatch(/^\d+-[a-z0-9]+\.png$/);
  });

  it('el nombre de descarga pierde comillas y saltos de línea', () => {
    // Un salto de línea en `Content-Disposition` hace que `res.setHeader`
    // lance ERR_INVALID_CHAR y la descarga se caiga con un 500.
    expect(nombreParaDescarga('acta"; x\r\nX-Otro: 1', 'formato.pdf')).toBe('acta; xX-Otro: 1');
  });

  it('cae al nombre por defecto cuando no queda nada utilizable', () => {
    expect(nombreParaDescarga('"""', 'formato.pdf')).toBe('formato.pdf');
    expect(nombreParaDescarga(undefined, 'formato.pdf')).toBe('formato.pdf');
  });
});
