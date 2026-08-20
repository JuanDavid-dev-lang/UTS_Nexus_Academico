import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/data/models.dart';
import '../../core/data/providers.dart';
import './data/dashboard_summary.dart';
import '../../core/network/api_error.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/auth/auth_repository.dart';
import '../../core/theme/app_theme.dart';
import '../activities/data/activity_models.dart';
import '../agenda/widgets/next_class_card.dart';
import './intervention_sheet.dart';
import '../../core/widgets/compact.dart';
import '../../core/widgets/period_selector.dart';
import '../../core/widgets/session_menu.dart';
import '../../core/widgets/ui_kit.dart';

final dashboardProvider = FutureProvider<DashboardData>((ref) async {
  return ref.read(authRepositoryProvider).dashboard();
});

/// Panel del docente.
///
/// Responde cuatro preguntas, y en este orden: **qué tengo ahora**, **qué
/// viene después**, **quién necesita atención** y **qué trabajo está
/// pendiente**. El orden no es estético: es el de urgencia real de alguien que
/// saca el teléfono entre dos clases.
///
/// Todo lo que se muestra viene calculado del backend. Aquí no se promedia, no
/// se compara con el 3.0 ni se decide qué es riesgo: el panel elige el color
/// según el nivel que el servidor ya declaró.
class DashboardPage extends ConsumerWidget {
  const DashboardPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboard = ref.watch(dashboardProvider);
    final risks = ref.watch(risksProvider);
    final actividades = ref.watch(actividadesProvider);
    final user = ref.watch(authControllerProvider).user;

    final nombre = (user?.fullName ?? 'Docente').split(' ').first;

    return Scaffold(
      // Solo el saludo: el periodo ya lo muestra (y lo cambia) el
      // `PeriodSelector` de la derecha, y repetirlo junto al nombre era decir
      // «2026-2» dos veces en la misma línea.
      appBar: CompactHeader(
        titulo: 'Hola, $nombre',
        acciones: const [PeriodSelector(), SessionMenuButton()],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(dashboardProvider);
          ref.invalidate(risksProvider);
          ref.invalidate(actividadesProvider);
          await ref.read(dashboardProvider.future);
        },
        child: ListView(
          padding: AppSpacing.listPadding,
          children: [
            // ── ¿Qué tengo ahora? ─────────────────────────────────────
            // Lo primero, antes que cualquier indicador: lo que un docente
            // mira al sacar el teléfono es a qué hora es la siguiente clase.
            NextClassCard(compacto: true, onVerAgenda: () => context.go('/agenda')),

            const SizedBox(height: AppSpacing.gap),

            // ── Acciones rápidas ──────────────────────────────────────
            // Tres accesos y no un menú: pasar lista y capturar notas son las
            // dos cosas que se hacen a diario, y llegar a ellas por «Más»
            // cuesta tres toques.
            Row(
              children: [
                Expanded(
                  child: _AccionRapida(
                    icono: Icons.fact_check_outlined,
                    etiqueta: 'Asistencia',
                    onTap: () => context.go('/attendance'),
                  ),
                ),
                const SizedBox(width: AppSpacing.gapSm),
                Expanded(
                  child: _AccionRapida(
                    icono: Icons.school_outlined,
                    etiqueta: 'Notas',
                    onTap: () => context.go('/grades'),
                  ),
                ),
                const SizedBox(width: AppSpacing.gapSm),
                Expanded(
                  child: _AccionRapida(
                    icono: Icons.calendar_month_outlined,
                    etiqueta: 'Agenda',
                    onTap: () => context.go('/agenda'),
                  ),
                ),
              ],
            ),

            const SizedBox(height: AppSpacing.gap),

            // ── Indicadores ───────────────────────────────────────────
            // Cuatro y no seis: los dos que sobraban (aprobados y reprobados)
            // son proyecciones que se leen mejor en el consolidado, y su sitio
            // en el panel obligaba a una tercera fila de tarjetas.
            dashboard.when(
              loading: () => const SkeletonStatGrid(count: 4),
              error: (error, _) => StateView.error(
                ApiError.from(error).message,
                action: FilledButton(
                  onPressed: () => ref.invalidate(dashboardProvider),
                  child: const Text('Reintentar'),
                ),
              ),
              data: (data) => _CuadriculaDeIndicadores(resumen: data.summary),
            ),

            const SizedBox(height: AppSpacing.gap),

            // ── ¿Quién necesita atención? ─────────────────────────────
            CompactSectionHeader(
              'Necesitan atención',
              accion: 'Ver alertas',
              onAccion: () => context.go('/notifications'),
            ),
            risks.when(
              loading: () => const SkeletonRows(filas: 3),
              error: (error, _) => StateView.error(
                ApiError.from(error).message,
                action: FilledButton(
                  onPressed: () => ref.invalidate(risksProvider),
                  child: const Text('Reintentar'),
                ),
              ),
              data: (items) {
                // El nivel lo declara el backend; aquí solo se filtra y ordena.
                final enRiesgo =
                    items.where((r) => r.level != RiskLevel.low).take(5).toList();

                if (enRiesgo.isEmpty) {
                  return const CompactEmpty(
                    icono: Icons.check_circle_outline,
                    mensaje:
                        'Ningún estudiante en riesgo. Todos dentro de lo esperado.',
                  );
                }

                return Column(
                  children: [
                    for (final riesgo in enRiesgo)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.gapSm),
                        child: AcademicRow(
                          titulo: riesgo.fullName,
                          metadatos: [
                            riesgo.reasons.isNotEmpty
                                ? riesgo.reasons.first
                                : 'Nota ${riesgo.finalGrade.toStringAsFixed(2)} · '
                                    'asistencia ${riesgo.attendanceRate.toStringAsFixed(0)}%',
                          ],
                          acento: _tonoDeRiesgo(riesgo.level),
                          indicador: MetricChip(
                            riesgo.finalGrade.toStringAsFixed(1),
                            etiqueta: 'Nota',
                            tono: _tonoDeRiesgo(riesgo.level),
                          ),
                          // Tocar la fila abre dónde anotar qué se hizo: sin
                          // eso la lista repite los mismos nombres cada semana.
                          onTap: () => showInterventionSheet(context, riesgo),
                        ),
                      ),
                  ],
                );
              },
            ),

            const SizedBox(height: AppSpacing.gap),

            // ── ¿Qué trabajo está pendiente? ──────────────────────────
            CompactSectionHeader(
              'Entregas próximas y vencidas',
              accion: 'Ver todas',
              onAccion: () => context.go('/actividades'),
            ),
            actividades.when(
              // Sin esqueleto ni error a pantalla completa: es la última
              // sección, y un fallo aquí no debe tapar lo de arriba, que es lo
              // urgente. Un aviso discreto y el panel sigue sirviendo.
              loading: () => const SkeletonRows(filas: 2),
              error: (_, __) => const CompactEmpty(
                icono: Icons.cloud_off_outlined,
                mensaje: 'No se pudieron cargar las actividades.',
              ),
              data: (items) {
                // `vencida` lo decide el servidor contra su propio reloj.
                final relevantes = items
                    .where((a) => !a.cerrada)
                    .toList()
                  ..sort((a, b) {
                    final fa = a.dueAt;
                    final fb = b.dueAt;
                    if (fa == null) return 1;
                    if (fb == null) return -1;
                    return fa.compareTo(fb);
                  });
                final proximas = relevantes.take(4).toList();

                if (proximas.isEmpty) {
                  return const CompactEmpty(
                    icono: Icons.task_alt_outlined,
                    mensaje: 'Sin entregas abiertas.',
                  );
                }

                return Column(
                  children: [
                    for (final actividad in proximas)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpacing.gapSm),
                        child: AcademicRow(
                          titulo: actividad.title,
                          metadatos: [_textoDeFecha(actividad)],
                          acento: actividad.vencida ? SemanticKind.danger : null,
                          estado: actividad.vencida
                              ? StatusPill.danger('Vencida')
                              : null,
                          onTap: () => context.go('/actividades?item=${actividad.id}'),
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// Tono semántico de un nivel de riesgo. El NIVEL lo decide el backend; esto
/// solo elige el par (texto, fondo) que lo representa en el tema activo.
SemanticKind _tonoDeRiesgo(RiskLevel nivel) => switch (nivel) {
      RiskLevel.high => SemanticKind.danger,
      RiskLevel.medium => SemanticKind.warning,
      RiskLevel.low => SemanticKind.success,
    };

String _textoDeFecha(Activity actividad) {
  final fecha = actividad.dueAt;
  if (fecha == null) return 'sin fecha límite';
  final dia = fecha.day.toString().padLeft(2, '0');
  final mes = fecha.month.toString().padLeft(2, '0');
  final hora = fecha.hour.toString().padLeft(2, '0');
  final minuto = fecha.minute.toString().padLeft(2, '0');
  return 'vence $dia/$mes · $hora:$minuto';
}

/// Cuadrícula 2×2 de indicadores.
class _CuadriculaDeIndicadores extends StatelessWidget {
  final DashboardSummary resumen;
  const _CuadriculaDeIndicadores({required this.resumen});

  @override
  Widget build(BuildContext context) {
    return GridView(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      /*
       * `mainAxisExtent` y no `childAspectRatio`.
       *
       * La proporción ata el alto al ancho: la misma tarjeta mide 73 dp en un
       * teléfono de 360 y 90 en uno de 430, aunque el contenido —una etiqueta,
       * una cifra y una pista— ocupe exactamente lo mismo en los dos. En el
       * teléfono estrecho eso es la franja amarilla y negra de desbordamiento,
       * y en el ancho, aire vacío. El alto se declara en dp porque es lo que
       * realmente necesita el contenido; el ancho que sobre se reparte solo.
       */
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: AppSpacing.gapSm,
        mainAxisSpacing: AppSpacing.gapSm,
        mainAxisExtent: 120,
      ),
      children: [
        CompactStat(
          etiqueta: 'Promedio',
          // El promedio lo calcula el backend sobre los cortes ya calificados.
          valor: resumen.averageGrade.toStringAsFixed(2),
          pista: 'cortes calificados',
          icono: Icons.school_outlined,
          tono: resumen.averageGrade >= 3 ? SemanticKind.success : SemanticKind.danger,
          // La escala es 0–5, así que el promedio sobre 5 es la proporción
          // real. Sin la barra, un 3.2 y un 4.7 ocupan lo mismo en pantalla.
          progreso: resumen.averageGrade / 5,
        ),
        CompactStat(
          etiqueta: 'Asistencia',
          valor: '${resumen.averageAttendance.toStringAsFixed(0)}%',
          pista: 'ponderada por minutos',
          icono: Icons.event_available_outlined,
          tono: SemanticKind.info,
          progreso: resumen.averageAttendance / 100,
        ),
        CompactStat(
          etiqueta: 'En riesgo',
          valor: '${resumen.riskStudents}',
          pista: 'requieren seguimiento',
          icono: Icons.warning_amber_outlined,
          tono: SemanticKind.warning,
        ),
        CompactStat(
          etiqueta: 'Estudiantes',
          valor: '${resumen.totalStudents}',
          pista: '${resumen.totalSubjects} materias',
          icono: Icons.people_outline,
        ),
      ],
    );
  }
}

/// Acceso rápido: icono grande, etiqueta corta, objetivo táctil generoso.
class _AccionRapida extends StatelessWidget {
  final IconData icono;
  final String etiqueta;
  final VoidCallback onTap;

  const _AccionRapida({
    required this.icono,
    required this.etiqueta,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return Semantics(
      button: true,
      label: etiqueta,
      child: AppCard(
        onTap: onTap,
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.gapSm),
        child: SizedBox(
          // Por encima del objetivo táctil recomendado, con el icono y la
          // etiqueta apilados: 56 de alto para dos líneas cortas.
          height: 52,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // El icono va dentro de su cuadro de color. Suelto, tres accesos
              // rápidos eran tres glifos flotando sobre blanco, del mismo peso
              // visual que cualquier icono decorativo de la pantalla; en su
              // cuadro se leen como los botones que son.
              Container(
                width: 30,
                height: 30,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: palette.primarySoft,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusInput - 3),
                ),
                child: Icon(icono, size: 17, color: palette.primary),
              ),
              const SizedBox(height: AppSpacing.gapXs + 1),
              Text(
                etiqueta,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppType.captionStrong,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
