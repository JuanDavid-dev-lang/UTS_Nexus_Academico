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
    final palette = context.palette;

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
              style: AppType.bodyStrong.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.2,
              ),
            ),
          ),
          if (contexto != null && contexto!.isNotEmpty) ...[
            const SizedBox(width: AppSpacing.gapSm),
            Flexible(
              child: Text(
                contexto!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppType.caption.copyWith(color: palette.muted),
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

  /// Marca la fila como elegida dentro de una selección múltiple.
  final bool seleccionada;

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
    this.seleccionada = false,
    this.onTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final tono = acento == null ? null : SemanticTone.of(context, acento!);
    final radio = BorderRadius.circular(AppSpacing.radiusCard);

    final contenido = AnimatedContainer(
      duration: AppMotion.fast,
      curve: AppMotion.curve,
      // 56 de mínimo: por encima del objetivo táctil sin que la fila parezca
      // un botón. El `constraints` y no un `height` fijo para que el texto
      // escalado del sistema pueda crecer sin recortarse.
      constraints: const BoxConstraints(minHeight: AppSpacing.rowHeight),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.gap,
        vertical: AppSpacing.gapSm,
      ),
      decoration: BoxDecoration(
        color: seleccionada ? palette.primarySoft : palette.surface,
        borderRadius: radio,
        border: Border.all(
          color: seleccionada ? palette.primary : palette.border,
          width: seleccionada ? 1.5 : 1,
        ),
        boxShadow: AppShadows.sm(palette.isDark),
      ),
      child: Row(
        children: [
          if (tono != null) ...[
            // 4 de ancho y toda la altura de la fila, no 3×32 centrado. La
            // franja tiene que leerse como el borde de la fila —«esta fila
            // entera está en rojo»— y no como un elemento más dentro de ella.
            Container(
              width: 4,
              height: 36,
              decoration: BoxDecoration(
                color: tono.fg,
                borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
              ),
            ),
            const SizedBox(width: AppSpacing.gap),
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
                    style: AppType.caption.copyWith(color: palette.muted),
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
          // La flecha solo aparece si la fila lleva a algún sitio, y solo
          // cuando no hay ya un estado ocupando ese extremo: dos elementos a la
          // derecha compitiendo hacen que ninguno de los dos se lea.
          if (onTap != null && estado == null) ...[
            const SizedBox(width: AppSpacing.gapXs),
            Icon(Icons.chevron_right, size: 18, color: palette.subtle),
          ],
        ],
      ),
    );

    if (onTap == null && onLongPress == null) return contenido;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: radio,
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
  const InitialsAvatar(this.nombre, {super.key, this.size = 34});

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
      decoration: BoxDecoration(
        color: tono.bg,
        shape: BoxShape.circle,
        // El anillo separa el avatar de la fila sin dibujar un borde de 1 px:
        // en una lista de treinta, treinta bordes son treinta líneas más
        // compitiendo con las que ya separan las filas.
        border: Border.all(color: tono.border),
      ),
      child: Text(
        iniciales,
        style: AppType.captionStrong.copyWith(color: tono.fg, fontWeight: FontWeight.w700),
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
    final palette = context.palette;
    final color =
        tono == null ? palette.text : SemanticTone.of(context, tono!).fg;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (etiqueta != null)
          Text(
            etiqueta!.toUpperCase(),
            style: AppType.caption.copyWith(
              color: palette.subtle,
              fontSize: 11,
              letterSpacing: 0.5,
              fontWeight: FontWeight.w600,
            ),
          ),
        Text(
          valor,
          style: AppType.bodyStrong.copyWith(
            color: color,
            fontWeight: FontWeight.w700,
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

  /// Barra 0–1 al pie, para métricas que son una proporción de un total.
  final double? progreso;

  const CompactStat({
    super.key,
    required this.etiqueta,
    required this.valor,
    this.pista,
    this.tono,
    this.icono,
    this.onTap,
    this.progreso,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final semantico = tono == null ? null : SemanticTone.of(context, tono!);
    final color = semantico?.fg ?? (palette.isDark ? palette.text : palette.primary);
    final rail = semantico?.fg ?? palette.primary;

    return AppCard(
      onTap: onTap,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Franja de tono: es lo que permite reconocer la tarjeta de un
          // vistazo. Con el color solo en la cifra y en un icono de 14 px,
          // cuatro tarjetas en cuadrícula eran cuatro rectángulos iguales.
          Container(
            height: 3,
            decoration: BoxDecoration(
              color: rail,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(AppSpacing.radiusCard),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.gap),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    if (icono != null) ...[
                      Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: semantico?.bg ?? palette.primarySoft,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Icon(icono, size: 13, color: color),
                      ),
                      const SizedBox(width: AppSpacing.gapSm),
                    ],
                    Expanded(
                      child: Text(
                        etiqueta.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: AppType.captionStrong.copyWith(
                          letterSpacing: 0.6,
                          color: palette.muted,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.gapSm),
                Text(
                  valor,
                  maxLines: 1,
                  style: AppType.metric.copyWith(color: color),
                ),
                if (progreso != null) ...[
                  const SizedBox(height: AppSpacing.gapSm),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
                    child: LinearProgressIndicator(
                      value: progreso!.clamp(0.0, 1.0),
                      minHeight: 4,
                      backgroundColor: palette.surfaceSunken,
                      valueColor: AlwaysStoppedAnimation(rail),
                    ),
                  ),
                ],
                if (pista != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    pista!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppType.caption.copyWith(color: palette.muted),
                  ),
                ],
              ],
            ),
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
  Size get preferredSize => const Size.fromHeight(52);

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return Container(
      height: 52,
      decoration: BoxDecoration(
        // Del color del fondo de página y no de la superficie de card: la barra
        // de filtros contiene, no presenta, y con el color de card era otra
        // superficie blanca más pegada a la cabecera, con una línea entre las
        // dos que no separaba nada.
        color: palette.bg,
        border: Border(bottom: BorderSide(color: palette.border)),
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

  /// Cifra a la derecha de la etiqueta: cuántos hay bajo ese filtro.
  final int? recuento;

  const FilterChipCompact({
    super.key,
    required this.etiqueta,
    required this.activo,
    required this.onTap,
    this.icono,
    this.recuento,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    // Seleccionado va RELLENO, no con una capa al 16% y borde de color. Con la
    // capa translúcida, en una barra de seis chips el activo se distinguía por
    // un fondo dos tonos más oscuro y había que buscarlo; relleno se encuentra
    // sin buscarlo, que es lo único que un filtro activo tiene que hacer.
    final fondo = activo ? palette.primary : palette.surface;
    final frente = activo
        ? (palette.isDark ? AppColors.bgDark : Colors.white)
        : palette.muted;

    return Semantics(
      button: true,
      selected: activo,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
          onTap: onTap,
          child: AnimatedContainer(
            duration: AppMotion.fast,
            curve: AppMotion.curve,
            // El alto mínimo garantiza el objetivo táctil aunque el chip mida
            // poco de ancho; el relleno solo controla la densidad horizontal.
            constraints: const BoxConstraints(minHeight: AppSpacing.tapTargetMin - 8),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            decoration: BoxDecoration(
              color: fondo,
              borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
              border: Border.all(color: activo ? palette.primary : palette.border),
              boxShadow: activo ? AppShadows.sm(palette.isDark) : null,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icono != null) ...[
                  Icon(icono, size: 15, color: frente),
                  const SizedBox(width: AppSpacing.gapXs + 1),
                ],
                Text(
                  etiqueta,
                  style: AppType.captionStrong.copyWith(
                    color: frente,
                    fontWeight: activo ? FontWeight.w700 : FontWeight.w600,
                  ),
                ),
                if (recuento != null) ...[
                  const SizedBox(width: AppSpacing.gapXs + 1),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      color: activo
                          ? frente.withValues(alpha: 0.2)
                          : palette.surfaceSunken,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
                    ),
                    child: Text(
                      '$recuento',
                      style: AppType.caption.copyWith(
                        color: frente,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Control segmentado ──────────────────────────────────────────────────────

/// Elige una vista entre dos o tres mutuamente excluyentes.
///
/// No es lo mismo que [FilterChipCompact] y por eso es otro componente: los
/// chips son filtros —se pueden apagar todos, se pueden combinar— y esto es un
/// interruptor de posición, donde siempre hay exactamente una elegida. Pintar
/// un interruptor como una fila de chips deja al usuario preguntándose si
/// puede apagar el que está encendido.
///
/// Máximo tres opciones: con cuatro las etiquetas se recortan en un teléfono
/// de 360 dp y deja de leerse cuál es cuál.
class SegmentedTabs extends StatelessWidget {
  final List<String> opciones;
  final int indice;
  final ValueChanged<int> onCambio;

  const SegmentedTabs({
    super.key,
    required this.opciones,
    required this.indice,
    required this.onCambio,
  });

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;

    return Container(
      height: 40,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        // El carril va hundido y la pestaña activa elevada: es esa relación la
        // que se lee como «esta está encima» en vez de «esta está pintada de
        // otro color».
        color: palette.surfaceSunken,
        borderRadius: BorderRadius.circular(AppSpacing.radiusInput),
      ),
      child: Row(
        children: [
          for (var i = 0; i < opciones.length; i++)
            Expanded(
              child: Semantics(
                button: true,
                selected: i == indice,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onCambio(i),
                  child: AnimatedContainer(
                    duration: AppMotion.fast,
                    curve: AppMotion.curve,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: i == indice ? palette.surface : Colors.transparent,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusInput - 3),
                      boxShadow: i == indice ? AppShadows.sm(palette.isDark) : null,
                    ),
                    child: Text(
                      opciones[i],
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppType.captionStrong.copyWith(
                        color: i == indice ? palette.text : palette.muted,
                        fontWeight: i == indice ? FontWeight.w700 : FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
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
    final palette = context.palette;

    return AppCard(
      padding: EdgeInsets.zero,
      child: Theme(
        // El divisor por defecto de ExpansionTile dibuja una línea que choca
        // con el borde de la tarjeta.
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          initiallyExpanded: abiertaPorDefecto,
          shape: const Border(),
          collapsedShape: const Border(),
          tilePadding: const EdgeInsets.symmetric(horizontal: AppSpacing.gap),
          childrenPadding: const EdgeInsets.fromLTRB(
            AppSpacing.gap,
            0,
            AppSpacing.gap,
            AppSpacing.gap,
          ),
          leading: icono == null
              ? null
              : Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: palette.surfaceAlt,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icono, size: 16, color: palette.muted),
                ),
          title: Text(titulo, style: AppType.bodyStrong),
          subtitle: resumen == null
              ? null
              : Text(resumen!, style: AppType.caption.copyWith(color: palette.muted)),
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
      final palette = AppPalette.of(contextoHoja);

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
                  AppSpacing.gap,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            titulo,
                            style: AppType.bodyStrong.copyWith(fontWeight: FontWeight.w700),
                          ),
                          if (subtitulo != null)
                            Text(
                              subtitulo,
                              style: AppType.caption.copyWith(color: palette.muted),
                            ),
                        ],
                      ),
                    ),
                    ...acciones,
                  ],
                ),
              ),
              // Un separador bajo el título: sin él, el contenido de la hoja
              // empieza pegado al encabezado y las dos cosas se leen como un
              // bloque, sobre todo cuando lo primero es una lista.
              Divider(height: 1, color: palette.border),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.page,
                    AppSpacing.gap,
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
    final palette = context.palette;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.surface,
        border: Border(top: BorderSide(color: palette.border)),
        // La sombra hacia arriba es lo que separa la barra del contenido que
        // pasa por debajo. Con solo el borde, en una lista larga la última fila
        // quedaba pegada a la barra y parecía formar parte de ella.
        boxShadow: AppShadows.md(palette.isDark),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.page,
            vertical: AppSpacing.gapSm + 2,
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
                            metrica.etiqueta.toUpperCase(),
                            style: AppType.caption.copyWith(
                              color: palette.subtle,
                              fontSize: 11,
                              letterSpacing: 0.5,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            metrica.valor,
                            style: AppType.bodyStrong.copyWith(
                              fontWeight: FontWeight.w700,
                              color: metrica.tono == null
                                  ? palette.text
                                  : SemanticTone.of(context, metrica.tono!).fg,
                              fontFeatures: const [FontFeature.tabularFigures()],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(width: AppSpacing.gap + 4),
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
    final palette = context.palette;

    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.gap),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: palette.surfaceAlt,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icono, size: 16, color: palette.muted),
          ),
          const SizedBox(width: AppSpacing.gap),
          Expanded(
            child: Text(mensaje, style: AppType.caption.copyWith(color: palette.muted)),
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
    final palette = context.palette;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.gapSm),
      child: Row(
        children: [
          Text(
            titulo.toUpperCase(),
            style: AppType.captionStrong.copyWith(
              letterSpacing: 0.8,
              color: palette.muted,
              fontWeight: FontWeight.w700,
            ),
          ),
          // Una línea que ocupa lo que sobra. Convierte un texto suelto en un
          // encabezado de verdad: separa lo de arriba de lo de abajo sin gastar
          // ni un dp más de alto que el propio texto.
          const SizedBox(width: AppSpacing.gapSm),
          Expanded(child: Divider(height: 1, color: palette.border)),
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
