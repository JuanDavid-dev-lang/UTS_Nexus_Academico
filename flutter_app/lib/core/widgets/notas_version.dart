import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Las notas de una versión llegan en Markdown: el mensaje de la etiqueta, que
/// es lo que GitHub pinta en la página de la release (títulos con `#`, `**`,
/// viñetas, listas numeradas, citas, separadores `---`) y con las líneas
/// cortadas a unos 78 caracteres. Pintado tal cual, el aviso de actualización
/// enseñaba los símbolos y los saltos a media frase. Mismo lector que el
/// escritorio (`desktop/src/domain/updates/notas-version.ts`); las dos pruebas
/// fijan las mismas salidas: cambiar uno exige cambiar el otro.
enum TipoBloqueNotas { titulo, parrafo, vineta, numerada, cita }

/// Un trozo de texto con su formato en línea.
class Tramo {
  const Tramo(
    this.texto, {
    this.negrita = false,
    this.cursiva = false,
    this.codigo = false,
  });

  final String texto;
  final bool negrita;
  final bool cursiva;
  final bool codigo;

  bool mismoFormato(Tramo otro) =>
      negrita == otro.negrita &&
      cursiva == otro.cursiva &&
      codigo == otro.codigo;

  @override
  bool operator ==(Object other) =>
      other is Tramo && other.texto == texto && mismoFormato(other);

  @override
  int get hashCode => Object.hash(texto, negrita, cursiva, codigo);

  @override
  String toString() =>
      'Tramo($texto${negrita ? ', negrita' : ''}${cursiva ? ', cursiva' : ''}'
      '${codigo ? ', codigo' : ''})';
}

class BloqueNotas {
  const BloqueNotas(
    this.tipo,
    this.texto, {
    this.tramos = const [],
    this.nivel = 0,
    this.numero = 0,
  });

  final TipoBloqueNotas tipo;

  /// El texto sin marcado, para lectores de pantalla y pruebas.
  final String texto;
  final List<Tramo> tramos;

  /// Título: 2 o 3. Viñeta: 0 o 1 (anidada).
  final int nivel;

  /// Solo en las listas numeradas.
  final int numero;

  @override
  bool operator ==(Object other) =>
      other is BloqueNotas &&
      other.tipo == tipo &&
      other.texto == texto &&
      other.nivel == nivel &&
      other.numero == numero;

  @override
  int get hashCode => Object.hash(tipo, texto, nivel, numero);

  @override
  String toString() => '$tipo($nivel/$numero): $texto';
}

final _vineta = RegExp(r'^(\s*)[-*+]\s+');
final _numerada = RegExp(r'^\s*(\d{1,3})[.)]\s+');
final _cita = RegExp(r'^\s*>\s?');
final _titulo = RegExp(r'^\s*(#{1,6})\s+');
final _separador = RegExp(r'^\s*([-*_])(\s*\1){2,}\s*$');
final _valla = RegExp(r'^\s*(```|~~~)');

/// Formato en línea: `código`, **negrita** (o __negrita__), *cursiva* (o
/// _cursiva_). Un enlace se queda en su texto. Un guion bajo dentro de una
/// palabra (`nombre_de_archivo`) no es cursiva.
final _enLinea = RegExp(
  r'`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|(?<![\w*])\*(?!\s)([^*]+?)\*(?![\w*])|(?<![\w_])_(?!\s)([^_]+?)_(?![\w_])',
);

List<Tramo> tramosEnLinea(String linea) {
  final limpia = linea
      .replaceAllMapped(RegExp(r'\[([^\]]+)\]\([^)]*\)'), (m) => m[1]!)
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  final tramos = <Tramo>[];
  void agregar(Tramo tramo) {
    if (tramo.texto.isEmpty) return;
    if (tramos.isNotEmpty && tramos.last.mismoFormato(tramo)) {
      final previo = tramos.removeLast();
      tramos.add(
        Tramo(
          previo.texto + tramo.texto,
          negrita: tramo.negrita,
          cursiva: tramo.cursiva,
          codigo: tramo.codigo,
        ),
      );
    } else {
      tramos.add(tramo);
    }
  }

  var desde = 0;
  for (final m in _enLinea.allMatches(limpia)) {
    agregar(Tramo(limpia.substring(desde, m.start)));
    if (m[1] != null) {
      agregar(Tramo(m[1]!, codigo: true));
    } else if (m[2] != null || m[3] != null) {
      agregar(Tramo((m[2] ?? m[3])!, negrita: true));
    } else {
      agregar(Tramo((m[4] ?? m[5])!, cursiva: true));
    }
    desde = m.end;
  }
  agregar(Tramo(limpia.substring(desde)));
  return tramos;
}

/// El texto de una línea sin ningún marcado.
String textoPlano(String linea) =>
    tramosEnLinea(linea).map((t) => t.texto).join();

List<BloqueNotas> leerNotasVersion(String markdown) {
  final bloques = <BloqueNotas>[];
  TipoBloqueNotas? tipoActual;
  var nivelActual = 0;
  var numeroActual = 0;
  final partes = <String>[];
  var enValla = false;

  void cerrar() {
    final tipo = tipoActual;
    if (tipo == null) return;
    final tramos = tramosEnLinea(partes.join(' '));
    final texto = tramos.map((t) => t.texto).join();
    if (texto.isNotEmpty) {
      bloques.add(
        BloqueNotas(
          tipo,
          texto,
          tramos: tramos,
          nivel: nivelActual,
          numero: numeroActual,
        ),
      );
    }
    tipoActual = null;
    nivelActual = 0;
    numeroActual = 0;
    partes.clear();
  }

  void abrir(
    TipoBloqueNotas tipo,
    String contenido, {
    int nivel = 0,
    int numero = 0,
  }) {
    cerrar();
    tipoActual = tipo;
    nivelActual = nivel;
    numeroActual = numero;
    partes.add(contenido);
  }

  final lineas = markdown.replaceAll(RegExp(r'\r\n?'), '\n').split('\n');
  for (final linea in lineas) {
    // Un bloque de código se lee como texto corriente: en unas notas de
    // versión casi nunca lo hay, y si lo hay es un comando de una línea.
    if (_valla.hasMatch(linea)) {
      cerrar();
      enValla = !enValla;
      continue;
    }
    if (linea.trim().isEmpty || (!enValla && _separador.hasMatch(linea))) {
      cerrar();
      continue;
    }
    if (enValla) {
      cerrar();
      final texto = linea.trim();
      bloques.add(
        BloqueNotas(
          TipoBloqueNotas.parrafo,
          texto,
          tramos: [Tramo(texto, codigo: true)],
        ),
      );
      continue;
    }

    final titulo = _titulo.firstMatch(linea);
    if (titulo != null) {
      cerrar();
      // El título de nivel 1 repite el nombre y el número de la versión, que
      // la pantalla ya enseña encima.
      final nivel = titulo[1]!.length;
      if (nivel > 1) {
        final tramos = tramosEnLinea(linea.substring(titulo.end));
        final texto = tramos.map((t) => t.texto).join();
        if (texto.isNotEmpty) {
          bloques.add(
            BloqueNotas(
              TipoBloqueNotas.titulo,
              texto,
              tramos: tramos,
              nivel: nivel == 2 ? 2 : 3,
            ),
          );
        }
      }
      continue;
    }

    final vineta = _vineta.firstMatch(linea);
    if (vineta != null) {
      final sangria = vineta[1]!.replaceAll('\t', '  ').length;
      abrir(
        TipoBloqueNotas.vineta,
        linea.substring(vineta.end),
        nivel: sangria >= 2 ? 1 : 0,
      );
      continue;
    }

    final numerada = _numerada.firstMatch(linea);
    if (numerada != null) {
      abrir(
        TipoBloqueNotas.numerada,
        linea.substring(numerada.end),
        numero: int.parse(numerada[1]!),
      );
      continue;
    }

    if (_cita.hasMatch(linea)) {
      final contenido = linea.replaceFirst(_cita, '');
      if (tipoActual == TipoBloqueNotas.cita) {
        partes.add(contenido);
      } else {
        abrir(TipoBloqueNotas.cita, contenido);
      }
      continue;
    }

    // Una línea suelta continúa lo que haya abierto: así se deshace el corte
    // a 78 columnas, dentro de un párrafo, una viñeta o una cita.
    if (tipoActual == null) {
      abrir(TipoBloqueNotas.parrafo, linea.trim());
    } else {
      partes.add(linea.trim());
    }
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
    final cuerpo = AppType.caption.copyWith(color: palette.muted, height: 1.45);
    final marca = cuerpo.copyWith(
      color: palette.primary,
      fontWeight: FontWeight.w700,
    );

    TextSpan tramos(List<Tramo> lista, TextStyle base) => TextSpan(
      style: base,
      children: [
        for (final t in lista)
          TextSpan(
            text: t.texto,
            style: t.codigo
                ? TextStyle(
                    fontFamily: 'monospace',
                    color: palette.text,
                    backgroundColor: palette.surfaceAlt,
                  )
                : t.negrita
                ? TextStyle(fontWeight: FontWeight.w600, color: palette.text)
                : t.cursiva
                ? const TextStyle(fontStyle: FontStyle.italic)
                : null,
          ),
      ],
    );

    Widget conMarca(String simbolo, BloqueNotas b, {double sangria = 0}) =>
        Padding(
          padding: EdgeInsets.only(left: sangria),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(width: 20, child: Text(simbolo, style: marca)),
              Expanded(child: Text.rich(tramos(b.tramos, cuerpo))),
            ],
          ),
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final (i, b) in bloques.indexed)
          Padding(
            padding: EdgeInsets.only(
              top: i == 0 ? 0 : (b.tipo == TipoBloqueNotas.titulo ? 12 : 6),
            ),
            child: switch (b.tipo) {
              TipoBloqueNotas.titulo => Text.rich(
                tramos(
                  b.tramos,
                  (b.nivel == 2 ? AppType.bodyStrong : AppType.caption)
                      .copyWith(
                        color: palette.text,
                        fontWeight: FontWeight.w700,
                      ),
                ),
              ),
              TipoBloqueNotas.parrafo => Text.rich(tramos(b.tramos, cuerpo)),
              TipoBloqueNotas.vineta => conMarca(
                b.nivel == 1 ? '◦' : '•',
                b,
                sangria: b.nivel == 1 ? 20 : 0,
              ),
              TipoBloqueNotas.numerada => conMarca('${b.numero}.', b),
              TipoBloqueNotas.cita => DecoratedBox(
                decoration: BoxDecoration(
                  border: Border(
                    left: BorderSide(color: palette.borderStrong, width: 2),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.only(left: 10),
                  child: Text.rich(
                    tramos(
                      b.tramos,
                      cuerpo.copyWith(fontStyle: FontStyle.italic),
                    ),
                  ),
                ),
              ),
            },
          ),
      ],
    );
  }
}
