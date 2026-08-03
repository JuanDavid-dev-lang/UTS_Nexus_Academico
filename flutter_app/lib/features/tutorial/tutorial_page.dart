import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/theme/app_theme.dart';

/// Un paso del recorrido.
class PasoTutorial {
  final IconData icono;
  final String titulo;
  final String texto;

  const PasoTutorial({required this.icono, required this.titulo, required this.texto});
}

/// Guion del tutorial.
///
/// El orden sigue el trabajo de un semestre —abrir la materia, matricular,
/// calificar, pasar lista, mirar el riesgo, sacar el reporte—, no el orden del
/// menú: una herramienta se aprende mejor cuando el recorrido se parece a lo
/// que uno va a hacer con ella.
const pasos = <PasoTutorial>[
  PasoTutorial(
    icono: Icons.waving_hand_outlined,
    titulo: 'Bienvenido',
    texto:
        'Te muestro la aplicación en un minuto. Puedes salir cuando quieras, y '
        'volver a verlo desde Ajustes.',
  ),
  PasoTutorial(
    icono: Icons.dashboard_outlined,
    titulo: 'Inicio',
    texto:
        'El resumen de tu semestre: cuántos estudiantes tienes, cómo va el promedio '
        'y quién está en riesgo. Es para mirar, no para editar.',
  ),
  PasoTutorial(
    icono: Icons.menu_book_outlined,
    titulo: 'Materias',
    texto:
        'Entras a una asignatura y ves su lista de estudiantes, ordenada por riesgo: '
        'primero quien necesita atención. Desde ahí llegas a las notas de cada uno.',
  ),
  PasoTutorial(
    icono: Icons.grade_outlined,
    titulo: 'Notas',
    texto:
        'Se registran por corte y por componente: trabajos, parciales y autoevaluación. '
        'El promedio del corte y la definitiva los calcula el servidor con los pesos '
        'del reglamento, así que no haces cuentas.',
  ),
  PasoTutorial(
    icono: Icons.fact_check_outlined,
    titulo: 'Asistencia',
    texto:
        'Pasas lista tocando cada estudiante. O fotografías la planilla de papel y la '
        'app la lee: siempre te muestra lo que entendió para que lo revises antes de guardar.',
  ),
  PasoTutorial(
    icono: Icons.warning_amber_outlined,
    titulo: 'Riesgo académico',
    texto:
        'Cruza notas, tendencia entre cortes y asistencia para decirte a quién conviene '
        'llamar antes de que sea tarde. Siempre explica en qué se basó.',
  ),
  PasoTutorial(
    icono: Icons.campaign_outlined,
    titulo: 'Avisos',
    texto:
        'Las comunicaciones de la administración: cambios de fechas, cierres de corte, '
        'reuniones. Los que no has abierto llevan un punto.',
  ),
  PasoTutorial(
    icono: Icons.picture_as_pdf_outlined,
    titulo: 'Reportes',
    texto:
        'El consolidado en PDF o Excel, listo para entregar. Sale con los mismos números '
        'que ves en pantalla, porque los genera el mismo motor.',
  ),
  PasoTutorial(
    icono: Icons.wifi_tethering_outlined,
    titulo: 'Sin configurar nada',
    texto:
        'La app ya sabe a qué servidor conectarse. Si tu institución tiene el suyo, '
        'puedes cambiar la dirección en Ajustes.',
  ),
  PasoTutorial(
    icono: Icons.check_circle_outline,
    titulo: 'Listo',
    texto:
        'Eso es todo. Si algo no queda claro, el tutorial está siempre disponible en Ajustes.',
  ),
];

const _clave = 'tutorial_visto';

Future<bool> tutorialVisto() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getBool(_clave) ?? false;
}

Future<void> marcarTutorialVisto() async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool(_clave, true);
}

/// Recorrido paso a paso, con Siguiente y Atrás.
///
/// En un teléfono no se ilumina la pantalla real como en el escritorio: no hay
/// sitio para el recuadro y la nota a la vez, y el resultado sería una tarjeta
/// tapando justo lo que intenta explicar. Se usan pantallas completas, que es
/// como funcionan los tutoriales que la gente ya sabe usar.
class TutorialPage extends StatefulWidget {
  const TutorialPage({super.key});

  @override
  State<TutorialPage> createState() => _TutorialPageState();
}

class _TutorialPageState extends State<TutorialPage> {
  final _controlador = PageController();
  int _indice = 0;

  @override
  void dispose() {
    _controlador.dispose();
    super.dispose();
  }

  Future<void> _terminar() async {
    await marcarTutorialVisto();
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final ultimo = _indice == pasos.length - 1;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(onPressed: _terminar, child: const Text('Saltar')),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controlador,
                itemCount: pasos.length,
                onPageChanged: (i) => setState(() => _indice = i),
                itemBuilder: (_, i) {
                  final paso = pasos[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 28),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 96,
                          height: 96,
                          decoration: BoxDecoration(
                            color: SemanticTone.of(context, SemanticKind.info).bg,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(paso.icono,
                              size: 44, color: SemanticTone.of(context, SemanticKind.info).fg),
                        ),
                        const SizedBox(height: 28),
                        Text(paso.titulo, style: AppType.h2, textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        Text(
                          paso.texto,
                          style: AppType.body.copyWith(color: muted, height: 1.5),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),

            // Progreso: puntos, para ver de un vistazo cuánto falta.
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < pasos.length; i++)
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: i == _indice ? 20 : 7,
                    height: 7,
                    decoration: BoxDecoration(
                      color: i <= _indice
                          ? Theme.of(context).colorScheme.primary
                          : Theme.of(context).dividerColor,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
              ],
            ),

            Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  if (_indice > 0)
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _controlador.previousPage(
                          duration: const Duration(milliseconds: 250),
                          curve: Curves.easeOut,
                        ),
                        child: const Text('Atrás'),
                      ),
                    ),
                  if (_indice > 0) const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: ultimo
                          ? _terminar
                          : () => _controlador.nextPage(
                                duration: const Duration(milliseconds: 250),
                                curve: Curves.easeOut,
                              ),
                      child: Text(ultimo ? 'Empezar' : 'Siguiente'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
