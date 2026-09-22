import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/rubri.dart';

/// Un paso del recorrido.
class PasoTutorial {
  final IconData icono;
  final String titulo;
  final String texto;

  /// Qué señala el recorrido sobre la pantalla real (`TourOverlay`): la ruta
  /// de un destino del menú, `rutaMas` para el botón «Más», o null para una
  /// tarjeta centrada. La página a pantalla completa lo ignora.
  final String? ruta;

  const PasoTutorial({
    required this.icono,
    required this.titulo,
    required this.texto,
    this.ruta,
  });
}

/// Pseudorruta del botón «Más» de la barra.
const rutaMas = 'mas';

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
    ruta: '/',
    texto:
        'El resumen de tu semestre: cuántos estudiantes tienes, cómo va el promedio '
        'y quién está en riesgo. Es para mirar, no para editar.',
  ),
  PasoTutorial(
    icono: Icons.menu_book_outlined,
    titulo: 'Materias',
    ruta: '/subjects',
    texto:
        'Entras a una asignatura y ves su lista de estudiantes, ordenada por riesgo: '
        'primero quien necesita atención. Desde ahí llegas a las notas de cada uno.',
  ),
  PasoTutorial(
    icono: Icons.calendar_month_outlined,
    titulo: 'Agenda',
    ruta: '/agenda',
    texto:
        'Qué tienes ahora y qué viene: clases, parciales y entregas de la semana. '
        'Los recordatorios te llegan aunque la app esté cerrada.',
  ),
  PasoTutorial(
    icono: Icons.auto_awesome_outlined,
    titulo: 'Asistente',
    ruta: '/ai',
    texto:
        'Rubri responde con tus datos: quién va mal en una materia, cuántas faltas '
        'lleva alguien, qué nota necesita para aprobar.',
  ),
  PasoTutorial(
    icono: Icons.more_horiz_outlined,
    titulo: 'Más',
    ruta: rutaMas,
    texto:
        'El resto de secciones vive aquí, en una cuadrícula. Desde Personalizar '
        'menú puedes decidir cuáles cuatro van en la barra.',
  ),
  PasoTutorial(
    icono: Icons.grade_outlined,
    titulo: 'Notas',
    ruta: '/grades',
    texto:
        'Se registran por corte y por componente: trabajos, parciales y autoevaluación. '
        'El promedio del corte y la definitiva los calcula el servidor con los pesos '
        'del reglamento, así que no haces cuentas. Si el docente tiene una plantilla de '
        'corte, cada nota ya sabe cuánto pesa.',
  ),
  PasoTutorial(
    icono: Icons.fact_check_outlined,
    titulo: 'Asistencia',
    ruta: '/attendance',
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
    ruta: '/avisos',
    texto:
        'Las comunicaciones de la administración: cambios de fechas, cierres de corte, '
        'reuniones. Los que no has abierto llevan un punto.',
  ),
  PasoTutorial(
    icono: Icons.picture_as_pdf_outlined,
    titulo: 'Reportes',
    ruta: '/reports',
    texto:
        'El consolidado en PDF o Excel, listo para entregar. Sale con los mismos números '
        'que ves en pantalla, porque los genera el mismo motor.',
  ),
  PasoTutorial(
    icono: Icons.wifi_tethering_outlined,
    titulo: 'Sin configurar nada',
    texto:
        'La app ya sabe a qué servidor conectarse. Si tu institución tiene el suyo, '
        'la administración lo configura; tú no tienes que tocar nada.',
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
///
/// Lo que se mueve va **atado al gesto**, no a un temporizador: el icono y el
/// texto de cada página se desplazan y desvanecen con la posición del
/// `PageController` (parallax), así que a medio arrastre se ve a medio camino y
/// al soltar termina donde termina la página. Es un `AnimatedBuilder` sobre el
/// controlador —cero trabajo cuando nadie toca— y no un `AnimationController`
/// por página. La barra de progreso y el rebote de entrada del icono sí son
/// animaciones propias, cortas. Con «reducir movimiento» todo queda quieto y
/// las páginas saltan.
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

  void _irA(int indice) {
    if (MediaQuery.disableAnimationsOf(context)) {
      _controlador.jumpToPage(indice);
      return;
    }
    _controlador.animateToPage(
      indice,
      duration: AppMotion.slow,
      curve: AppMotion.curve,
    );
  }

  @override
  Widget build(BuildContext context) {
    final ultimo = _indice == pasos.length - 1;
    final sinMovimiento = MediaQuery.disableAnimationsOf(context);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Row(
              children: [
                Padding(
                  padding: const EdgeInsets.only(left: 20),
                  child: Text(
                    'Paso ${_indice + 1} de ${pasos.length}',
                    style: AppType.captionStrong.copyWith(
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                ),
                const Spacer(),
                TextButton(onPressed: _terminar, child: const Text('Saltar')),
              ],
            ),
            Expanded(
              child: PageView.builder(
                controller: _controlador,
                itemCount: pasos.length,
                onPageChanged: (i) => setState(() => _indice = i),
                itemBuilder: (_, i) => _PaginaPaso(
                  paso: pasos[i],
                  indice: i,
                  controlador: _controlador,
                  sinMovimiento: sinMovimiento,
                ),
              ),
            ),

            // Progreso: una barra que crece, y encima los puntos para poder
            // saltar a un paso concreto.
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 28),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      for (var i = 0; i < pasos.length; i++)
                        GestureDetector(
                          onTap: () => _irA(i),
                          behavior: HitTestBehavior.opaque,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 3,
                              vertical: 8,
                            ),
                            child: AnimatedContainer(
                              duration: sinMovimiento
                                  ? Duration.zero
                                  : AppMotion.normal,
                              curve: AppMotion.curve,
                              width: i == _indice ? 20 : 7,
                              height: 7,
                              decoration: BoxDecoration(
                                color: i <= _indice
                                    ? Theme.of(context).colorScheme.primary
                                    : Theme.of(context).dividerColor,
                                borderRadius: BorderRadius.circular(999),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: TweenAnimationBuilder<double>(
                      tween: Tween(end: (_indice + 1) / pasos.length),
                      duration: sinMovimiento ? Duration.zero : AppMotion.slow,
                      curve: AppMotion.curve,
                      builder: (context, valor, _) => LinearProgressIndicator(
                        value: valor,
                        minHeight: 3,
                        backgroundColor: Theme.of(context).dividerColor,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  if (_indice > 0)
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _irA(_indice - 1),
                        child: const Text('Atrás'),
                      ),
                    ),
                  if (_indice > 0) const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: ultimo ? _terminar : () => _irA(_indice + 1),
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

/// Una página del recorrido: icono (o Rubri en la primera y la última), título
/// y texto, desplazados según lo lejos que esté la página del centro.
class _PaginaPaso extends StatelessWidget {
  final PasoTutorial paso;
  final int indice;
  final PageController controlador;
  final bool sinMovimiento;

  const _PaginaPaso({
    required this.paso,
    required this.indice,
    required this.controlador,
    required this.sinMovimiento,
  });

  /// Cuánto se aleja esta página del centro: 0 centrada, ±1 la vecina.
  double _desfase() {
    if (!controlador.hasClients || !controlador.position.hasContentDimensions) {
      return 0;
    }
    return ((controlador.page ?? controlador.initialPage.toDouble()) - indice)
        .clamp(-1.0, 1.0);
  }

  @override
  Widget build(BuildContext context) {
    final muted = context.palette.muted;
    final tono = SemanticTone.of(context, SemanticKind.info);
    final esExtremo = indice == 0 || indice == pasos.length - 1;

    final icono = esExtremo
        ? const Rubri(emotion: RubriEmotion.happy, size: 112)
        : Container(
            width: 96,
            height: 96,
            decoration: BoxDecoration(color: tono.bg, shape: BoxShape.circle),
            child: Icon(paso.icono, size: 44, color: tono.fg),
          );

    // El icono entra con un rebote corto la primera vez que se pinta la
    // página. Con `key` por índice, cada página lo hace una sola vez.
    final iconoConEntrada = sinMovimiento
        ? icono
        : TweenAnimationBuilder<double>(
            key: ValueKey('entrada-$indice'),
            tween: Tween(begin: 0.85, end: 1),
            duration: AppMotion.slow,
            curve: AppMotion.spring,
            builder: (_, escala, hijo) =>
                Transform.scale(scale: escala, child: hijo),
            child: icono,
          );

    final titulo = Text(
      paso.titulo,
      style: AppType.h2,
      textAlign: TextAlign.center,
    );
    final texto = Text(
      paso.texto,
      style: AppType.body.copyWith(color: muted, height: 1.5),
      textAlign: TextAlign.center,
    );

    if (sinMovimiento) {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 28),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            icono,
            const SizedBox(height: 28),
            titulo,
            const SizedBox(height: 12),
            texto,
          ],
        ),
      );
    }

    return AnimatedBuilder(
      animation: controlador,
      builder: (context, _) {
        final d = _desfase();
        final opacidad = (1 - d.abs()).clamp(0.0, 1.0);
        // El icono se mueve menos que el texto: da profundidad sin marear.
        Widget capa(Widget hijo, double factor) => Opacity(
          opacity: opacidad,
          child: Transform.translate(
            offset: Offset(-d * factor, 0),
            child: hijo,
          ),
        );
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              capa(iconoConEntrada, 24),
              const SizedBox(height: 28),
              capa(titulo, 56),
              const SizedBox(height: 12),
              capa(texto, 88),
            ],
          ),
        );
      },
    );
  }
}
