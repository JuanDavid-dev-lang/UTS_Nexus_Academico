import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';

/// Aviso de uso y privacidad.
///
/// El servidor solo guarda qué versión vio cada persona; el texto vive aquí,
/// en el escritorio (`desktop/src/domain/usage/aviso-uso.ts`) y en
/// `docs/USO_Y_PRIVACIDAD.md`. **Los tres dicen lo mismo y llevan la misma
/// versión que `backend/src/domains/usage/aviso-uso.ts`.**
const avisoUsoVersion = 1;

const avisoUsoTitulo = 'Uso de la aplicación y privacidad';

const avisoUsoParrafos = <String>[
  'UTS Nexus registra cuándo usas la aplicación: los días en que entras, el '
      'tiempo aproximado de actividad (en tramos de 5 minutos), el número de '
      'peticiones y si lo haces desde el escritorio, la web o el móvil. No '
      'registra qué pantallas abres ni qué datos consultas o escribes.',
  'Estos datos no se publican ni se comparten con terceros. Solo los ve la '
      'administración de la plataforma y únicamente con valor estadístico: '
      'para saber cuánto se usa la aplicación y mejorarla.',
  'Tú eres el dueño de tus datos. Puedes pedir a la administración que te '
      'muestre lo registrado sobre ti o que lo elimine. Los registros se '
      'borran solos a los 400 días.',
];

/// ¿Hay que enseñar el diálogo? Sin conexión no: no se podría marcar, y un
/// aviso no puede bloquear el trabajo.
bool debeMostrarAvisoUso({
  required bool pendiente,
  required bool sinConexion,
  required bool yaMostrado,
}) =>
    pendiente && !sinConexion && !yaMostrado;

/// Los párrafos del aviso, para el diálogo y para el registro.
class TextoAvisoUso extends StatelessWidget {
  final TextStyle? estilo;

  const TextoAvisoUso({super.key, this.estilo});

  @override
  Widget build(BuildContext context) {
    final style = estilo ?? AppType.body.copyWith(color: context.palette.text);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final (i, p) in avisoUsoParrafos.indexed) ...[
          if (i > 0) const SizedBox(height: AppSpacing.gapSm),
          Text(p, style: style),
        ],
      ],
    );
  }
}

/// Diálogo de una vez para quien ya tenía cuenta. «Entendido» llama a
/// [onEntendido]; si la marca no llega al servidor, vuelve en el siguiente
/// inicio, y nada se bloquea mientras tanto.
Future<void> mostrarDialogoAvisoUso(
  BuildContext context, {
  required Future<void> Function() onEntendido,
}) {
  return showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (contexto) => AlertDialog(
      title: const Text(avisoUsoTitulo),
      content: const SingleChildScrollView(child: TextoAvisoUso()),
      actions: [
        FilledButton(
          onPressed: () {
            Navigator.of(contexto).pop();
            onEntendido().catchError((_) {});
          },
          child: const Text('Entendido'),
        ),
      ],
    ),
  );
}
