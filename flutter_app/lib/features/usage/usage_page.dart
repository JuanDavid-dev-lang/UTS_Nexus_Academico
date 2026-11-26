import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_error.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/compact.dart';
import '../../core/widgets/session_menu.dart';
import '../../core/widgets/ui_kit.dart';
import './data/usage_repository.dart';
import './usage_providers.dart';

/// Uso de la aplicación (solo ADMIN): cifras de los últimos 30 días y quién la
/// usa más. Estadística interna; no se publica. El filtrado por rango,
/// institución y rol está en el escritorio.
class UsagePage extends ConsumerWidget {
  const UsagePage({super.key});

  static const _roles = {
    'ADMIN': 'Administración',
    'COORDINATOR': 'Coordinación',
    'SECRETARY': 'Secretaría',
    'PROFESSOR': 'Docente',
  };

  static String _tiempo(int minutos) {
    if (minutos < 60) return '$minutos min';
    final h = minutos ~/ 60;
    final m = minutos % 60;
    return m == 0 ? '$h h' : '$h h $m min';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final resumen = ref.watch(resumenUsoProvider);

    return Scaffold(
      appBar: const CompactHeader(
        titulo: 'Uso de la aplicación',
        acciones: [SessionMenuButton()],
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(resumenUsoProvider.future),
        child: resumen.when(
          loading: () => ListView(children: const [SkeletonRows()]),
          error: (error, _) => ListView(
            children: [
              StateView.error(
                error is ApiError ? error.message : 'No se pudo cargar el uso.',
              ),
            ],
          ),
          data: (datos) => _Contenido(datos: datos),
        ),
      ),
    );
  }
}

class _Contenido extends StatelessWidget {
  final ResumenUso datos;

  const _Contenido({required this.datos});

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final clientes = datos.usuariosPorCliente;

    return ListView.builder(
      padding: AppSpacing.pagePadding,
      itemCount: datos.ranking.length + 1,
      itemBuilder: (context, i) {
        if (i > 0) {
          final f = datos.ranking[i - 1];
          return AcademicRow(
            avatar: InitialsAvatar(f.nombre),
            titulo: '${f.posicion}. ${f.nombre}',
            metadatos: [
              UsagePage._roles[f.rol] ?? f.rol,
              if (f.institucion != null) f.institucion!,
              '${f.diasActivos} días',
            ],
            indicador: Text(
              UsagePage._tiempo(f.minutos),
              style: AppType.captionStrong.copyWith(
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Estadística interna de ${datos.desde} a ${datos.hasta}. No se '
              'publica.',
              style: AppType.caption.copyWith(color: palette.muted),
            ),
            const SizedBox(height: AppSpacing.gap),
            GridView(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: AppSpacing.gapSm,
                mainAxisSpacing: AppSpacing.gapSm,
                mainAxisExtent: 120,
              ),
              children: [
                CompactStat(etiqueta: 'Activos hoy', valor: '${datos.activosHoy}'),
                CompactStat(etiqueta: 'Últimos 7 días', valor: '${datos.activosSemana}'),
                CompactStat(etiqueta: 'Últimos 30 días', valor: '${datos.activosMes}'),
                CompactStat(
                  etiqueta: 'Tiempo activo',
                  valor: UsagePage._tiempo(datos.minutos),
                  pista: '${datos.usuarios} personas',
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.gap),
            Text(
              'Escritorio ${clientes['escritorio'] ?? 0} · Web ${clientes['web'] ?? 0} · '
              'Móvil ${clientes['movil'] ?? 0} personas',
              style: AppType.caption.copyWith(color: palette.muted),
            ),
            const SizedBox(height: AppSpacing.gap),
            CompactSectionHeader(
              datos.totalRanking > datos.ranking.length
                  ? 'Quién la usa más (${datos.ranking.length} de ${datos.totalRanking})'
                  : 'Quién la usa más',
            ),
            if (datos.ranking.isEmpty)
              StateView.empty('Nadie usó la aplicación en estos 30 días.'),
          ],
        );
      },
    );
  }
}
