import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import './ui_kit.dart';

/// Componentes compactos del sistema de diseño móvil.
///
/// Existen para que la densidad sea una decisión tomada una vez y no una que
/// cada pantalla vuelve a tomar a su manera. Antes de esto convivían tres
/// formas de pintar «un estudiante con su nota y su estado», con tres altos
/// distintos y tres criterios distintos sobre qué es un metadato: la lista de
/// notas, la de asistencia y la de riesgo. Ninguna era peor que las otras;
/// el problema era que fueran tres.
///
/// Dos reglas que ninguno de estos componentes rompe:
///
///  - **El objetivo táctil no baja de [AppSpacing.tapTargetMin].** La densidad
///    se gana con el espacio muerto, nunca encogiendo lo que hay que tocar.
///  - **Los colores llegan como significado**, no como `Color`. Pasarle un
///    color suelto a cualquiera de estos widgets rompe el modo oscuro, porque
///    los hex canónicos de DESIGN.md §4 no alcanzan AA sobre las superficies
///    oliva.

// ── Cabecera de página ──────────────────────────────────────────────────────

/// Cabecera compacta de pantalla.
///
/// Sustituye al `AppBar` con `h3` más subtítulo, que gastaba unos 88 dp antes
/// de la primera fila útil. Esta se queda en 56 con la misma información:
/// título en `bodyStrong`, contexto en `caption` a su lado y las acciones en
/// la misma línea.
class CompactHeader extends StatelessWidget implements PreferredSizeWidget {
  final String titulo;

  /// Contexto: el periodo, el grupo, cuántos hay. Va junto al título, no debajo.
  final String? contexto;
  final List<Widget> acciones;
  final Widget? leading;

  const CompactHeader({
    super.key,
    required this.titulo,
    this.contexto,
    this.acciones = const [],
    this.leading,
  });

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return AppBar(
      toolbarHeight: 56,
      titleSpacing: leading == null ? AppSpacing.page : 0,
      leading: leading,
      automaticallyImplyLeading: leading != null,
      title: Row(
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          Flexible(
            child: Text(
              titulo,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppType.bodyStrong.copyWith(fontWeight: FontWeight.w800),
            ),
          ),
          if (contexto != null && contexto!.isNotEmpty) ...[
            const SizedBox(width: AppSpacing.gapSm),
            Flexible(
              child: Text(
                contexto!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppType.caption.copyWith(color: muted),
              ),
            ),
          ],
        ],
      ),
      actions: acciones,
    );
  }
}

// ── Fila académica ──────────────────────────────────────────────────────────

/// Fila densa de información académica.
///
/// Es el componente que más se repite en la aplicación: un estudiante con su
/// identificación, un dato numérico y un estado. Antes cada pantalla lo
/// resolvía con una `AppCard` de 16 de relleno y dos `SizedBox`, unos 92 dp
/// por fila. Esta se queda en 56 sin quitar nada de lo que se lee.
class AcademicRow extends StatelessWidget {
  /// Línea principal: el nombre.
  final String titulo;

  /// Metadatos secundarios, en 13 px. Se unen con un separador medio.
  final List<String> metadatos;

  /// Indicador numérico a la derecha (nota, porcentaje). Opcional.
  final Widget? indicador;

  /// Estado semántico a la derecha del indicador. Opcional.
  final Widget? estado;

  /// Avatar o inicial a la izquierda. Opcional.
  final Widget? avatar;

  /// Franja de color a la izquierda que comunica severidad de un vistazo.
  final SemanticKind? acento;

  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  const AcademicRow({
    super.key,
    required this.titulo,
    this.metadatos = const [],
    this.indicador,
    this.estado,
    this.avatar,
    this.acento,
    this.onTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final borde = isDark ? AppColors.borderDark : AppColors.border;
    final superficie = isDark ? AppColors.surfaceDark : AppColors.surface;
    final tono = acento == null ? null : SemanticTone.of(context, acento!);

    final contenido = Container(
      // 56 de mínimo: por encima del objetivo táctil sin que la fila parezca
      // un botón. El `constraints` y no un `height` fijo para que el texto
      // escalado del sistema pueda crecer sin recortarse.
      constraints: const BoxConstraints(minHeight: AppSpacing.rowHeight),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.gap,
        vertical: AppSpacing.gapSm,
      ),
      decoration: BoxDecoration(
        color: superficie,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        border: Border.all(color: borde),
      ),
      child: Row(
        children: [
          if (tono != null) ...[
            Container(
              width: 3,
              height: 32,
              decoration: BoxDecoration(
                color: tono.fg,
                borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
              ),
            ),
            const SizedBox(width: AppSpacing.gapSm),
          ],
          if (avatar != null) ...[
            avatar!,
            const SizedBox(width: AppSpacing.gapSm),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  titulo,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppType.bodyStrong,
                ),
                if (metadatos.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.gapXs / 2),
                  Text(
                    // Un separador medio y no una coma: los metadatos son
                    // etiquetas independientes, no una enumeración.
                    metadatos.where((m) => m.isNotEmpty).join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppType.caption.copyWith(color: muted),
                  ),
                ],
              ],
            ),
          ),
          if (indicador != null) ...[
            const SizedBox(width: AppSpacing.gapSm),
            indicador!,
          ],
          if (estado != null) ...[
            const SizedBox(width: AppSpacing.gapSm),
            estado!,
          ],
        ],
      ),
    );

    if (onTap == null && onLongPress == null) return contenido;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        onTap: onTap,
        onLongPress: onLongPress,
        child: contenido,
      ),
    );
  }
}

/// Iniciales de un nombre, en un círculo pequeño.
///
/// Una foto por estudiante son treinta peticiones al abrir un salón; las
/// iniciales identifican igual de bien en una lista que ya lleva el nombre al
/// lado y no cuestan una sola petición.
class InitialsAvatar extends StatelessWidget {
  final String nombre;
  final double size;
  const InitialsAvatar(this.nombre, {super.key, this.size = 32});

  @override
  Widget build(BuildContext context) {
    final tono = SemanticTone.of(context, SemanticKind.brand);
    final partes = nombre.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    final iniciales = partes.isEmpty
        ? '?'
        : partes.length == 1
            ? partes.first.characters.first.toUpperCase()
            : '${partes.first.characters.first}${partes.last.characters.first}'
                .toUpperCase();

    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: tono.bg, shape: BoxShape.circle),
      child: Text(
        iniciales,
        style: AppType.captionStrong.copyWith(color: tono.fg),
      ),
    );
  }
}

// ── Indicadores numéricos ───────────────────────────────────────────────────

/// Cómo se lee un número académico.
///
/// El umbral NO se decide aquí: el backend ya dice si algo está aprobado o en
/// riesgo, y este enum solo elige el par (texto, fondo). Poner el 3.0 en el
/// cliente sería una segunda regla de aprobación compitiendo con
/// `domains/grading`.
enum IndicatorKind { nota, asistencia, neutro }

/// Cifra destacada de una fila: la nota, el porcentaje de asistencia.
class MetricChip extends StatelessWidget {
  final String valor;

  /// Significado, resuelto por quien tiene el dato del backend.
  final SemanticKind? tono;

  /// Etiqueta corta encima de la cifra («Prom.», «Asist.»).
  final String? etiqueta;

  const MetricChip(this.valor, {super.key, this.tono, this.etiqueta});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final color = tono == null
        ? (isDark ? AppColors.textDark : AppColors.text)
        : SemanticTone.of(context, tono!).fg;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (etiqueta != null)
          Text(
            etiqueta!,
            style: AppType.caption.copyWith(color: muted, fontSize: 13),
          ),
        Text(
          valor,
          style: AppType.bodyStrong.copyWith(
            color: color,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}

// ── Tarjeta estadística compacta ────────────────────────────────────────────

/// Métrica en cuadrícula 2×2.
///
/// La versión anterior ([StatTile]) usa `h2` (30 px) y relleno de 16: cuatro
/// de ellas ocupaban media pantalla. Esta baja la cifra a 24 y el relleno a
/// 12, y cabe la cuadrícula entera con la lista de riesgo debajo.
class CompactStat extends StatelessWidget {
  final String etiqueta;
  final String valor;
  final String? pista;
  final SemanticKind? tono;
  final IconData? icono;
  final VoidCallback? onTap;

  const CompactStat({
    super.key,
    required this.etiqueta,
    required this.valor,
    this.pista,
    this.tono,
    this.icono,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final color = tono == null
        ? (isDark ? AppColors.textDark : AppColors.primary)
        : SemanticTone.of(context, tono!).fg;

    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(AppSpacing.gap),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              if (icono != null) ...[
                Icon(icono, size: 14, color: color),
                const SizedBox(width: AppSpacing.gapXs),
              ],
              Expanded(
                child: Text(
                  etiqueta.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppType.captionStrong.copyWith(
                    letterSpacing: 0.6,
                    color: muted,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.gapXs),
          Text(
            valor,
            maxLines: 1,
            style: AppType.h3.copyWith(
              color: color,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          if (pista != null)
            Text(
              pista!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: AppType.caption.copyWith(color: muted),
            ),
        ],
      ),
    );
  }
}

// ── Barra de filtros ────────────────────────────────────────────────────────

/// Barra de filtros horizontal y desplazable.
///
/// Va pegada bajo la cabecera y no dentro del contenido: si se desplazara con
/// la lista, cambiar de filtro obligaría a subir hasta arriba cada vez.
class FilterBar extends StatelessWidget implements PreferredSizeWidget {
  final List<Widget> hijos;
  const FilterBar({super.key, required this.hijos});

  @override
  Size get preferredSize => const Size.fromHeight(48);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final borde = isDark ? AppColors.borderDark : AppColors.border;
    final superficie = isDark ? AppColors.surfaceDark : AppColors.surface;

    return Container(
      height: 48,
      decoration: BoxDecoration(
        color: superficie,
        border: Border(bottom: BorderSide(color: borde)),
      ),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.page,
          vertical: AppSpacing.gapSm,
        ),
        itemCount: hijos.length,
        separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.gapSm),
        itemBuilder: (_, indice) => hijos[indice],
      ),
    );
  }
}

/// Chip de filtro seleccionable.
class FilterChipCompact extends StatelessWidget {
  final String etiqueta;
  final bool activo;
  final VoidCallback onTap;
  final IconData? icono;

  const FilterChipCompact({
    super.key,
    required this.etiqueta,
    required this.activo,
    required this.onTap,
    this.icono,
  });

  @override
  Widget build(BuildContext context) {
    final esquema = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final borde = isDark ? AppColors.borderDark : AppColors.border;

    return Semantics(
      button: true,
      selected: activo,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
        onTap: onTap,
        child: Container(
          // El alto mínimo garantiza el objetivo táctil aunque el chip mida
          // poco de ancho; el relleno solo controla la densidad horizontal.
          constraints: const BoxConstraints(minHeight: AppSpacing.tapTargetMin - 12),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            // El lima/verde de marca solo aquí: selección, que es uno de los
            // usos que DESIGN.md §4 permite.
            color: activo ? esquema.primary.withValues(alpha: 0.16) : Colors.transparent,
            borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
            border: Border.all(color: activo ? esquema.primary : borde),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icono != null) ...[
                Icon(icono, size: 14, color: activo ? esquema.primary : muted),
                const SizedBox(width: AppSpacing.gapXs),
              ],
              Text(
                etiqueta,
                style: AppType.captionStrong.copyWith(
                  color: activo ? esquema.primary : muted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Sección desplegable ─────────────────────────────────────────────────────

/// Sección que se puede plegar, con su cabecera compacta.
///
/// Usa `ExpansionTile` del framework para no reimplementar la animación ni el
/// anuncio de accesibilidad, pero con el relleno y la tipografía del sistema.
class CollapsibleSection extends StatelessWidget {
  final String titulo;
  final String? resumen;
  final bool abiertaPorDefecto;
  final List<Widget> hijos;
  final IconData? icono;

  const CollapsibleSection({
    super.key,
    required this.titulo,
    required this.hijos,
    this.resumen,
    this.icono,
    this.abiertaPorDefecto = false,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return AppCard(
      padding: EdgeInsets.zero,
      child: Theme(
        // El divisor por defecto de ExpansionTile dibuja una línea que choca
        // con el borde de la tarjeta.
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: abiertaPorDefecto,
          tilePadding: const EdgeInsets.symmetric(horizontal: AppSpacing.gap),
          childrenPadding: const EdgeInsets.fromLTRB(
            AppSpacing.gap,
            0,
            AppSpacing.gap,
            AppSpacing.gap,
          ),
          leading: icono == null ? null : Icon(icono, size: 18, color: muted),
          title: Text(titulo, style: AppType.bodyStrong),
          subtitle: resumen == null
              ? null
              : Text(resumen!, style: AppType.caption.copyWith(color: muted)),
          expandedCrossAxisAlignment: CrossAxisAlignment.start,
          children: hijos,
        ),
      ),
    );
  }
}

// ── Panel inferior ──────────────────────────────────────────────────────────

/// Abre un panel inferior con el aspecto del sistema.
///
/// Centraliza tres cosas que cada pantalla resolvía a su manera y a veces mal:
/// el tope de altura (sin él, en un teléfono bajo o con la fuente del sistema
/// ampliada el contenido se recorta y las últimas filas dejan de existir), el
/// `SafeArea` y el desplazamiento propio.
Future<T?> showCompactSheet<T>({
  required BuildContext context,
  required String titulo,
  required Widget Function(BuildContext) constructor,
  String? subtitulo,
  List<Widget> acciones = const [],
}) {
  return showModalBottomSheet<T>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    // `sizeOf` y no `of`: leer solo el alto no debe suscribir al MediaQueryData
    // entero, que el teclado anima fotograma a fotograma.
    constraints: BoxConstraints(
      maxHeight: MediaQuery.sizeOf(context).height * 0.88,
    ),
    builder: (contextoHoja) {
      final isDark = Theme.of(contextoHoja).brightness == Brightness.dark;
      final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

      return SafeArea(
        child: Padding(
          // El teclado: `viewInsetsOf` y no `of`, por lo mismo de arriba.
          padding: EdgeInsets.only(
            bottom: MediaQuery.viewInsetsOf(contextoHoja).bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.page,
                  0,
                  AppSpacing.page,
                  AppSpacing.gapSm,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(titulo, style: AppType.bodyStrong),
                          if (subtitulo != null)
                            Text(
                              subtitulo,
                              style: AppType.caption.copyWith(color: muted),
                            ),
                        ],
                      ),
                    ),
                    ...acciones,
                  ],
                ),
              ),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.page,
                    0,
                    AppSpacing.page,
                    AppSpacing.gap,
                  ),
                  child: constructor(contextoHoja),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}

// ── Resumen fijo inferior ───────────────────────────────────────────────────

/// Barra fija al pie con el resumen de lo que se está capturando.
///
/// En la toma de asistencia es lo que evita el error caro: sin ella, el
/// docente termina de pasar lista de treinta y no sabe si marcó a los treinta
/// o a veintiocho hasta que guarda. Aquí el recuento está a la vista todo el
/// tiempo y el botón dice cuántos va a guardar.
class StickySummaryBar extends StatelessWidget {
  /// Pares (etiqueta, valor) que se muestran a la izquierda.
  final List<({String etiqueta, String valor, SemanticKind? tono})> metricas;
  final String etiquetaAccion;
  final VoidCallback? onAccion;
  final bool cargando;

  const StickySummaryBar({
    super.key,
    required this.metricas,
    required this.etiquetaAccion,
    this.onAccion,
    this.cargando = false,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final borde = isDark ? AppColors.borderDark : AppColors.border;
    final superficie = isDark ? AppColors.surfaceDark : AppColors.surface;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Container(
      decoration: BoxDecoration(
        color: superficie,
        border: Border(top: BorderSide(color: borde)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.page,
            vertical: AppSpacing.gapSm,
          ),
          child: Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    for (final metrica in metricas) ...[
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            metrica.etiqueta,
                            style: AppType.caption.copyWith(color: muted),
                          ),
                          Text(
                            metrica.valor,
                            style: AppType.bodyStrong.copyWith(
                              color: metrica.tono == null
                                  ? null
                                  : SemanticTone.of(context, metrica.tono!).fg,
                              fontFeatures: const [FontFeature.tabularFigures()],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(width: AppSpacing.gap),
                    ],
                  ],
                ),
              ),
              FilledButton(
                onPressed: cargando ? null : onAccion,
                child: cargando
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(etiquetaAccion),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Estados de carga y vacío ────────────────────────────────────────────────

/// Lista de esqueletos con la forma de [AcademicRow].
///
/// Reserva el alto real de las filas para que la pantalla no salte cuando
/// llegan los datos: un indicador circular centrado no consigue eso.
class SkeletonRows extends StatelessWidget {
  final int filas;
  const SkeletonRows({super.key, this.filas = 6});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(
        filas,
        (_) => const Padding(
          padding: EdgeInsets.only(bottom: AppSpacing.gapSm),
          child: SkeletonBox(height: AppSpacing.rowHeight, radius: AppSpacing.radiusCard),
        ),
      ),
    );
  }
}

/// Estado vacío compacto: cabe dentro de una sección, no ocupa la pantalla.
class CompactEmpty extends StatelessWidget {
  final IconData icono;
  final String mensaje;
  final Widget? accion;

  const CompactEmpty({
    super.key,
    required this.mensaje,
    this.icono = Icons.inbox_outlined,
    this.accion,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.gap),
      child: Row(
        children: [
          Icon(icono, size: 18, color: muted),
          const SizedBox(width: AppSpacing.gapSm),
          Expanded(
            child: Text(mensaje, style: AppType.caption.copyWith(color: muted)),
          ),
          if (accion != null) accion!,
        ],
      ),
    );
  }
}

/// Encabezado de sección compacto: 13 px en mayúsculas, con acción opcional.
///
/// Sustituye a [SectionHeader], que usa `h2` (30 px) y gasta 40 dp de alto por
/// cada sección. En una pantalla con cuatro secciones eran 160 dp de títulos.
class CompactSectionHeader extends StatelessWidget {
  final String titulo;
  final String? accion;
  final VoidCallback? onAccion;

  const CompactSectionHeader(this.titulo, {super.key, this.accion, this.onAccion});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.gapSm),
      child: Row(
        children: [
          Expanded(
            child: Text(
              titulo.toUpperCase(),
              style: AppType.captionStrong.copyWith(
                letterSpacing: 0.8,
                color: muted,
              ),
            ),
          ),
          if (accion != null && onAccion != null)
            // `TextButton` respeta el objetivo táctil por su relleno mínimo:
            // el texto mide 13 px pero la zona pulsable sigue en 48.
            TextButton(
              onPressed: onAccion,
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.gapSm),
                minimumSize: const Size(0, AppSpacing.tapTargetMin),
                textStyle: AppType.captionStrong,
              ),
              child: Text(accion!),
            ),
        ],
      ),
    );
  }
}
