import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Las notas de una versión llegan en Markdown: el mensaje de la etiqueta, que
/// es lo que GitHub pinta en la página de la release (títulos con `#`, `**`,
/// viñetas, separadores `---`) y con las líneas cortadas a unos 78 caracteres.
/// Pintado tal cual, el aviso de actualización enseñaba los símbolos y los
/// saltos a media frase. Mismo lector que el escritorio
/// (`desktop/src/domain/updates/notas-version.ts`); las dos pruebas fijan las
/// mismas salidas.
enum TipoBloqueNotas { titulo, parrafo, vineta }

class BloqueNotas {
  const BloqueNotas(this.tipo, this.texto);

  final TipoBloqueNotas tipo;
  final String texto;

  @override
  bool operator ==(Object other) =>
      other is BloqueNotas && other.tipo == tipo && other.texto == texto;

  @override
  int get hashCode => Object.hash(tipo, texto);

  @override
  String toString() => '$tipo: $texto';
}

final _vineta = RegExp(r'^\s*[-*+]\s+');
final _titulo = RegExp(r'^\s*(#{1,6})\s+');
final _separador = RegExp(r'^\s*([-*_])(\s*\1){2,}\s*$');

/// Quita el marcado en línea: negrita, cursiva, código y enlaces.
String textoPlano(String linea) {
  return linea
      .replaceAllMapped(RegExp(r'\[([^\]]+)\]\([^)]*\)'), (m) => m[1]!)
      .replaceAllMapped(RegExp(r'(\*\*|__)(.+?)\1'), (m) => m[2]!)
      .replaceAllMapped(
        RegExp(r'(^|[^\w*])[*_]([^*_\s][^*_]*?)[*_](?=[^\w*]|$)'),
        (m) => '${m[1]}${m[2]}',
      )
      .replaceAllMapped(RegExp(r'`([^`]*)`'), (m) => m[1]!)
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

List<BloqueNotas> leerNotasVersion(String markdown) {
  final bloques = <BloqueNotas>[];
  TipoBloqueNotas? tipoActual;
  final partes = <String>[];

  void cerrar() {
    final tipo = tipoActual;
    if (tipo == null) return;
    final texto = textoPlano(partes.join(' '));
    if (texto.isNotEmpty) bloques.add(BloqueNotas(tipo, texto));
    tipoActual = null;
    partes.clear();
  }

  final lineas = markdown.replaceAll(RegExp(r'\r\n?'), '\n').split('\n');
  for (final linea in lineas) {
    if (linea.trim().isEmpty || _separador.hasMatch(linea)) {
      cerrar();
      continue;
    }

    final titulo = _titulo.firstMatch(linea);
    if (titulo != null) {
      cerrar();
      // El título de nivel 1 repite el nombre y el número de la versión, que
      // la pantalla ya enseña encima.
      if (titulo[1]!.length > 1) {
        final texto = textoPlano(linea.substring(titulo.end));
        if (texto.isNotEmpty) {
          bloques.add(BloqueNotas(TipoBloqueNotas.titulo, texto));
        }
      }
      continue;
    }

    if (_vineta.hasMatch(linea)) {
      cerrar();
      tipoActual = TipoBloqueNotas.vineta;
      partes.add(linea.replaceFirst(_vineta, ''));
      continue;
    }

    // Una línea suelta continúa lo que haya abierto: así se deshace el corte
    // a 78 columnas, dentro de un párrafo o de una viñeta.
    tipoActual ??= TipoBloqueNotas.parrafo;
    partes.add(linea.trim());
  }
  cerrar();
  return bloques;
}

/// Las notas de una versión ya leídas, con la tipografía de la aplicación.
class NotasVersion extends StatelessWidget {
  const NotasVersion({super.key, required this.notas});

  final String notas;

  @override
  Widget build(BuildContext context) {
    final bloques = leerNotasVersion(notas);
    if (bloques.isEmpty) return const SizedBox.shrink();
    final palette = context.palette;
    final cuerpo = AppType.caption.copyWith(color: palette.muted, height: 1.4);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final (i, bloque) in bloques.indexed)
          Padding(
            padding: EdgeInsets.only(
              top: i == 0 ? 0 : (bloque.tipo == TipoBloqueNotas.titulo ? 10 : 6),
            ),
            child: switch (bloque.tipo) {
              TipoBloqueNotas.titulo => Text(
                bloque.texto,
                style: AppType.caption.copyWith(fontWeight: FontWeight.w700),
              ),
              TipoBloqueNotas.parrafo => Text(bloque.texto, style: cuerpo),
              TipoBloqueNotas.vineta => Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('•  ', style: cuerpo.copyWith(color: palette.primary)),
                  Expanded(child: Text(bloque.texto, style: cuerpo)),
                ],
              ),
            },
          ),
      ],
    );
  }
}
