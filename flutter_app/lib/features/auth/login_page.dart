import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/network/api_error.dart';
import '../../core/network/connection_controller.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/rubri.dart';
import '../../core/widgets/ui_kit.dart';

/// Pantalla de acceso.
///
/// Dos cambios frente a la versión anterior:
///
///  - **No hay credenciales precargadas.** Estaban escritas en el código fuente.
///  - **No se pide la dirección del servidor.** La app lo busca sola en la red;
///    la entrada manual queda escondida como último recurso, para redes donde el
///    barrido no llega.
///
/// La capa visual: el fondo entero es la superficie de marca —el acceso es uno
/// de los tres sitios que DESIGN.md §4 se la reserva— con tres nubes de color
/// que respiran muy despacio, y una apertura escalonada donde el logo cae, Rubri
/// saluda y la tarjeta del formulario sube con un resorte. Toda la lógica
/// —controladores, envío, servidor manual— es la misma; solo cambia lo que se ve.
class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _manualServer = TextEditingController();

  String? _emailError;
  String? _passwordError;
  bool _submitting = false;
  bool _showManualServer = false;
  bool _obscurePassword = true;

  @override
  void initState() {
    super.initState();
    // Se busca el servidor mientras el usuario escribe sus credenciales, así el
    // descubrimiento no se siente como una espera.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(connectionControllerProvider.notifier).initialize();
    });
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _manualServer.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _email.text.trim();
    final password = _password.text;

    setState(() {
      _emailError = email.isEmpty
          ? 'El correo es obligatorio'
          : (!email.contains('@') ? 'Correo inválido' : null);
      _passwordError = password.isEmpty ? 'La contraseña es obligatoria' : null;
    });
    if (_emailError != null || _passwordError != null) return;

    setState(() => _submitting = true);
    try {
      await ref.read(authControllerProvider.notifier).login(email, password);
      if (mounted) context.go('/');
    } catch (error) {
      final apiError = ApiError.from(error);
      if (!mounted) return;

      setState(() {
        if (apiError.kind == ApiErrorKind.unauthorized) {
          _passwordError = 'Correo o contraseña incorrectos';
        }
      });
      AppToast.error(context, 'No se pudo iniciar sesión', apiError.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _applyManualServer() async {
    final ok = await ref
        .read(connectionControllerProvider.notifier)
        .setManual(_manualServer.text);

    if (!mounted) return;
    if (ok) {
      setState(() => _showManualServer = false);
      AppToast.success(context, 'Servidor conectado');
    } else {
      AppToast.error(
        context,
        'No responde',
        'Verifica la dirección y que el servidor esté encendido.',
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final connection = ref.watch(connectionControllerProvider);
    final palette = context.palette;
    final muted = palette.muted;

    // Rubri pone la cara del estado: sin servidor a la vista, «sin conexión».
    // Es la única pieza de la cabecera que dice algo, y dice lo mismo que el
    // aviso de abajo.
    final emocion = connection.phase == ConnectionPhase.notFound
        ? RubriEmotion.offline
        : RubriEmotion.happy;

    // El formulario se construye AQUÍ y baja ya armado a `_AperturaDeAcceso`:
    // así los campos conservan sus controladores y el reloj de la apertura no
    // los reconstruye en cada fotograma (`AnimatedBuilder.child`).
    return Scaffold(
      // Del color del final del degradado: si el teclado deja ver un hilo de
      // fondo mientras sube, es del mismo tono y no un destello claro.
      backgroundColor: palette.brandEnd,
      // Iconos de la barra de estado en claro: arriba está el degradado de
      // marca en los dos modos, y con los iconos oscuros del tema claro la
      // hora desaparecía.
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Stack(
          // `expand` no es opcional: el cuerpo del Scaffold da restricciones
          // sueltas en alto, así que un Stack sin ella se mide por su hijo sin
          // posicionar —el formulario— y en una pantalla alta el degradado
          // terminaba donde termina la tarjeta, con una costura y el resto de
          // la pantalla en `brandEnd` plano.
          fit: StackFit.expand,
          children: [
            const _FondoAurora(),
            _AperturaDeAcceso(
              emocion: emocion,
              formulario: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Bienvenido de vuelta',
                    style: AppType.h3.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: AppSpacing.gapXs),
                  Text(
                    'Ingresa con tu cuenta institucional.',
                    style: AppType.body.copyWith(color: muted),
                  ),
                  const SizedBox(height: AppSpacing.page + AppSpacing.gapXs),

                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    textInputAction: TextInputAction.next,
                    decoration: InputDecoration(
                      labelText: 'Correo institucional',
                      hintText: 'docente@uts.edu.co',
                      prefixIcon: const Icon(Icons.mail_outline),
                      errorText: _emailError,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.gap),

                  TextField(
                    controller: _password,
                    obscureText: _obscurePassword,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _submit(),
                    decoration: InputDecoration(
                      labelText: 'Contraseña',
                      prefixIcon: const Icon(Icons.lock_outline),
                      errorText: _passwordError,
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                        tooltip: _obscurePassword ? 'Mostrar' : 'Ocultar',
                        onPressed: () => setState(
                          () => _obscurePassword = !_obscurePassword,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.page + AppSpacing.gapXs),

                  _BotonPrincipal(enviando: _submitting, onPressed: _submit),
                  const SizedBox(height: AppSpacing.gapXs),
                  TextButton(
                    onPressed: () => context.push('/registro'),
                    child: const Text('Registrarme como docente'),
                  ),
                  TextButton(
                    onPressed: () => context.go('/recovery'),
                    child: const Text('¿Olvidaste tu contraseña?'),
                  ),

                  // El estado de la conexión solo se enseña cuando hay algo que
                  // hacer al respecto. Mientras comprueba, y cuando encuentra el
                  // servidor, la pantalla no dice nada: «servidor encontrado» es
                  // ruido debajo de un formulario que ya se puede rellenar.
                  //
                  // La búsqueda SÍ se enseña, con su barra de progreso: barrer la
                  // red tarda unos segundos y sin esa señal la pantalla parece
                  // colgada. Y los dos fallos se quedan, porque llevan los
                  // botones de reintentar y de escribir la dirección a mano —
                  // sin ellos, una red donde el barrido no llega deja la
                  // aplicación sin forma de arreglarse desde dentro.
                  if (_muestraConexion(connection.phase)) ...[
                    const SizedBox(height: AppSpacing.page),
                    const Divider(),
                    const SizedBox(height: AppSpacing.gapSm),
                    _ConnectionBanner(
                      state: connection,
                      onRetry: () => ref
                          .read(connectionControllerProvider.notifier)
                          .discover(),
                      onManual: () => setState(
                        () => _showManualServer = !_showManualServer,
                      ),
                    ),
                  ],

                  if (_showManualServer) ...[
                    const SizedBox(height: AppSpacing.gap),
                    TextField(
                      controller: _manualServer,
                      keyboardType: TextInputType.url,
                      autocorrect: false,
                      decoration: const InputDecoration(
                        labelText: 'Dirección del servidor',
                        hintText: '192.168.1.10',
                        prefixIcon: Icon(Icons.dns_outlined),
                        helperText:
                            'Solo si la búsqueda automática no lo encuentra',
                      ),
                    ),
                    const SizedBox(height: AppSpacing.gapSm),
                    OutlinedButton(
                      onPressed: _applyManualServer,
                      child: const Text('Conectar a esta dirección'),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Capa visual ─────────────────────────────────────────────────────────────

/// Fondo de marca a pantalla completa con tres nubes de color que respiran.
///
/// Es un `CustomPainter` y no tres `Container` con `BackdropFilter`: el
/// desenfoque real cuesta una pasada de imagen por fotograma, y aquí basta un
/// degradado radial que se apaga hacia el borde. Pinta detrás de un
/// `RepaintBoundary`, así que cada fotograma de la respiración repinta esta
/// capa y ninguna otra: el formulario ni se reconstruye ni se repinta.
///
/// Con «reducir movimiento» el reloj se para a mitad de ciclo y las nubes
/// quedan quietas: el fondo sigue siendo el mismo, solo deja de moverse.
class _FondoAurora extends StatefulWidget {
  const _FondoAurora();

  /// Un ciclo completo (ida y vuelta) de la respiración. Lento a propósito: es
  /// un fondo, no una animación que alguien tenga que mirar, y es la única
  /// animación continua a pantalla completa de la aplicación. Si alguna vez
  /// llega telemetría de tirones en gama baja, lo primero que hay que probar
  /// es bajar a dos nubes; esto solo vive en la pantalla de acceso, así que no
  /// gasta batería con la aplicación en uso.
  static const Duration ciclo = Duration(seconds: 14);

  @override
  State<_FondoAurora> createState() => _FondoAuroraState();
}

class _FondoAuroraState extends State<_FondoAurora>
    with SingleTickerProviderStateMixin {
  late final AnimationController _respiracion = AnimationController(
    vsync: this,
    duration: _FondoAurora.ciclo,
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sincronizar();
  }

  // Mismo criterio que `Rubri`: la preferencia se lee de `MediaQuery`, que es
  // donde `app.dart` la deja, y se vuelve a mirar si cambia con la pantalla
  // abierta.
  void _sincronizar() {
    if (MediaQuery.disableAnimationsOf(context)) {
      _respiracion.stop();
      _respiracion.value = 0.5;
    } else if (!_respiracion.isAnimating) {
      _respiracion.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _respiracion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: CustomPaint(
        size: Size.infinite,
        painter: _AuroraPainter(
          palette: context.palette,
          respiracion: _respiracion,
        ),
      ),
    );
  }
}

/// Una nube: posición y radio como fracciones del lienzo, y su fase para que
/// las tres no respiren a la vez.
class _Nube {
  final double x;
  final double y;
  final double radio;
  final double fase;
  const _Nube({
    required this.x,
    required this.y,
    required this.radio,
    required this.fase,
  });
}

class _AuroraPainter extends CustomPainter {
  final AppPalette palette;
  final Animation<double> respiracion;

  _AuroraPainter({required this.palette, required this.respiracion})
    : super(repaint: respiracion);

  static const _nubes = [
    _Nube(x: 0.12, y: 0.10, radio: 0.62, fase: 0),
    _Nube(x: 0.95, y: 0.38, radio: 0.48, fase: 2.1),
    _Nube(x: 0.22, y: 0.94, radio: 0.56, fase: 4.2),
  ];

  /// Cuánto se desplaza una nube en su ida y vuelta, como fracción del lienzo.
  static const double _vaivenX = 0.06;
  static const double _vaivenY = 0.05;

  /// Cuánto crece y encoge (±).
  static const double _latido = 0.06;

  @override
  void paint(Canvas canvas, Size size) {
    final lienzo = Offset.zero & size;

    // La misma superficie de marca que `BrandSurface`: degradado y velo.
    canvas.drawRect(
      lienzo,
      Paint()..shader = AppGradients.brand(palette).createShader(lienzo),
    );
    canvas.drawRect(
      lienzo,
      Paint()..shader = AppGradients.veil(palette).createShader(lienzo),
    );

    // Con `repeat(reverse: true)` el valor va de 0 a 1 y vuelve; medio giro
    // de seno sobre eso es una ida y una vuelta suaves, sin salto.
    final angulo = Curves.easeInOut.transform(respiracion.value) * math.pi;
    final isDark = palette.isDark;

    // Tres colores de la paleta, nunca uno escrito a mano: con el tono Océano
    // las nubes son azules porque `veil`, `accent` y `brandStart` lo son. En
    // oscuro las opacidades bajan al rango del velo (DESIGN.md §4: el acento
    // nunca como superficie grande).
    final colores = [
      palette.veil.withValues(alpha: isDark ? 0.10 : 0.22),
      palette.accent.withValues(alpha: isDark ? 0.07 : 0.14),
      palette.brandStart.withValues(alpha: isDark ? 0.35 : 0.45),
    ];

    for (var i = 0; i < _nubes.length; i++) {
      final nube = _nubes[i];
      final centro = Offset(
        size.width * (nube.x + _vaivenX * math.sin(angulo + nube.fase)),
        size.height * (nube.y + _vaivenY * math.cos(angulo + nube.fase)),
      );
      final radio =
          size.shortestSide *
          nube.radio *
          (1 + _latido * math.sin(angulo + nube.fase));
      final area = Rect.fromCircle(center: centro, radius: radio);
      final color = colores[i];
      canvas.drawCircle(
        centro,
        radio,
        Paint()
          ..shader = RadialGradient(
            colors: [
              color,
              color.withValues(alpha: color.a * 0.45),
              color.withValues(alpha: 0),
            ],
            stops: const [0, 0.55, 1],
          ).createShader(area),
      );
    }
  }

  // El repintado por fotograma lo dispara `repaint:`; esto solo decide si hay
  // que repintar porque cambió el tema.
  @override
  bool shouldRepaint(_AuroraPainter old) => old.palette != palette;
}

/// Un tramo de la apertura: cuándo empieza y termina (en ms del reloj), desde
/// dónde entra y con qué curva. El fundido va siempre con la curva normal —un
/// resorte en la opacidad daría un fogonazo por encima del 100 %—; el
/// recorrido puede llevar `AppMotion.spring`, que sobrepasa y vuelve: es lo
/// que hace que el logo «rebote» y la tarjeta «entre con resorte».
class _Tramo {
  final double inicio;
  final double fin;
  final double finFundido;
  final double dy;
  final double giro;
  final Curve curva;

  _Tramo({
    required int desdeMs,
    required int hastaMs,
    int? fundidoHastaMs,
    this.dy = 0,
    this.giro = 0,
    this.curva = AppMotion.curve,
  }) : inicio = desdeMs / _AperturaDeAcceso.totalMs,
       fin = hastaMs / _AperturaDeAcceso.totalMs,
       finFundido = (fundidoHastaMs ?? hastaMs) / _AperturaDeAcceso.totalMs;

  /// 0 → 1 (puede sobrepasar 1 con un resorte).
  double recorrido(double reloj) =>
      Interval(inicio, fin, curve: curva).transform(reloj);

  /// 0 → 1, acotado.
  double opacidad(double reloj) =>
      Interval(inicio, finFundido, curve: AppMotion.curve).transform(reloj);
}

/// Aplica un [_Tramo] a un hijo: fundido más desplazamiento vertical (y un
/// giro opcional). En reposo —recorrido en 1— no envuelve en ningún
/// `Transform`, así que una vez terminada la apertura no cuesta nada.
class _Entra extends StatelessWidget {
  final Animation<double> reloj;
  final _Tramo tramo;
  final Widget child;

  const _Entra({required this.reloj, required this.tramo, required this.child});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: reloj,
      child: child,
      builder: (_, hijo) {
        final base = hijo ?? const SizedBox.shrink();
        final avance = reloj.value;
        final resto = 1 - tramo.recorrido(avance);
        final dy = tramo.dy * resto;
        final giro = tramo.giro * resto;

        final movido = (dy == 0 && giro == 0)
            ? base
            : Transform(
                transform: Matrix4.translationValues(0, dy, 0)..rotateZ(giro),
                alignment: Alignment.center,
                child: base,
              );

        // `alwaysIncludeSemantics`: el lector de pantalla encuentra el
        // formulario desde el primer fotograma, no medio segundo después.
        return Opacity(
          opacity: tramo.opacidad(avance),
          alwaysIncludeSemantics: true,
          child: movido,
        );
      },
    );
  }
}

/// La apertura de la pantalla: un solo reloj y cinco tramos sobre él. Un
/// controlador y no cinco, porque el escalonado es una relación entre ellos y
/// con un reloj por pieza esa relación viviría en cinco sitios.
///
/// También es quien pone el formulario en pantalla: desplazable, con el
/// margen seguro y con el teclado resuelto por `Scaffold` (el cuerpo se encoge
/// y esto se desplaza), así que en 360×640 con el teclado abierto no hay
/// ningún `Column` al que le falte alto.
class _AperturaDeAcceso extends StatefulWidget {
  final Widget formulario;
  final RubriEmotion emocion;

  const _AperturaDeAcceso({required this.formulario, required this.emocion});

  /// Duración total del reloj. Los tramos se expresan en ms de este reloj.
  /// Cada pieza se mueve **una sola vez**, que es lo que permite pasar de los
  /// 320 ms de `AppMotion.slow` sin contradecir DESIGN.md §17: lo que ahí se
  /// acota es lo que se repite veinte veces al día, no la apertura de la
  /// primera pantalla.
  static const int totalMs = 800;

  /// Ancho máximo del bloque en tabletas: el mismo que tenía la tarjeta.
  static const double anchoMaximo = 420;

  @override
  State<_AperturaDeAcceso> createState() => _AperturaDeAccesoState();
}

class _AperturaDeAccesoState extends State<_AperturaDeAcceso>
    with SingleTickerProviderStateMixin {
  late final AnimationController _reloj = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: _AperturaDeAcceso.totalMs),
  );
  bool _arrancado = false;

  // Los tramos. Los 60 ms entre título y frase son el escalonado que da la
  // sensación de que la pantalla se arma sola; el logo cae desde arriba con
  // resorte (sobrepasa y vuelve: un rebote), la tarjeta sube desde abajo con
  // el mismo resorte, y Rubri entra con un giro corto que se lee como un
  // saludo.
  static const double _caidaLogo = -32;
  static const double _subidaTarjeta = 56;
  static const double _pasoTexto = 12;
  static const double _saludoRubri = -0.22; // radianes

  static final _logo = _Tramo(
    desdeMs: 0,
    hastaMs: 450,
    fundidoHastaMs: 200,
    dy: _caidaLogo,
    curva: AppMotion.spring,
  );
  static final _mascota = _Tramo(
    desdeMs: 110,
    hastaMs: 510,
    fundidoHastaMs: 340,
    dy: _pasoTexto,
    giro: _saludoRubri,
    curva: AppMotion.spring,
  );
  static final _titulo = _Tramo(desdeMs: 190, hastaMs: 450, dy: _pasoTexto);
  static final _frase = _Tramo(desdeMs: 250, hastaMs: 510, dy: _pasoTexto);
  static final _tarjeta = _Tramo(
    desdeMs: 60,
    hastaMs: 580,
    fundidoHastaMs: 320,
    dy: _subidaTarjeta,
    curva: AppMotion.spring,
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Se comprueba en CADA llamada, no solo en la primera: activar «reducir
    // movimiento» con la pantalla abierta tiene que saltar la apertura al
    // final, no dejarla a medio camino.
    if (MediaQuery.disableAnimationsOf(context)) {
      _reloj.stop();
      _reloj.value = 1;
      _arrancado = true;
      return;
    }
    if (_arrancado) return;
    _arrancado = true;
    _reloj.forward();
  }

  @override
  void dispose() {
    _reloj.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // `SafeArea` lee el margen del sistema en su propio `build`, no aquí; y
    // `maintainBottomViewPadding` evita que el margen inferior salte cuando el
    // teclado tapa la barra de navegación por gestos.
    //
    // En un teléfono alto el bloque se centra en vertical: arriba del todo
    // dejaba media pantalla de degradado vacío debajo de la tarjeta. El alto
    // mínimo es el del viewport, así que con el teclado abierto —o en uno
    // pequeño— no estorba y simplemente se desplaza.
    return SafeArea(
      maintainBottomViewPadding: true,
      child: LayoutBuilder(
        builder: (context, limites) => SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.page,
            _margenVertical,
            AppSpacing.page,
            _margenVertical,
          ),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: math.max(0, limites.maxHeight - _margenVertical * 2),
            ),
            child: Center(child: _bloque()),
          ),
        ),
      ),
    );
  }

  static const double _margenVertical = AppSpacing.page + AppSpacing.gapSm;

  Widget _bloque() {
    return ConstrainedBox(
      constraints: const BoxConstraints(
        maxWidth: _AperturaDeAcceso.anchoMaximo,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _CabeceraAurora(
            reloj: _reloj,
            logo: _logo,
            mascota: _mascota,
            titulo: _titulo,
            frase: _frase,
            emocion: widget.emocion,
          ),
          const SizedBox(height: AppSpacing.page + AppSpacing.gapSm),
          _Entra(
            reloj: _reloj,
            tramo: _tarjeta,
            child: _TarjetaDeAcceso(child: widget.formulario),
          ),
        ],
      ),
    );
  }
}

/// Logo en su baldosa, Rubri a su lado, título y frase. Cada pieza lleva su
/// tramo de la apertura.
class _CabeceraAurora extends StatelessWidget {
  final Animation<double> reloj;
  final _Tramo logo;
  final _Tramo mascota;
  final _Tramo titulo;
  final _Tramo frase;
  final RubriEmotion emocion;

  const _CabeceraAurora({
    required this.reloj,
    required this.logo,
    required this.mascota,
    required this.titulo,
    required this.frase,
    required this.emocion,
  });

  static const double _ladoBaldosa = 64;
  static const double _ladoLogo = 48;
  static const double _ladoRubri = 88;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    // El mismo criterio que `BrandSurface`: en claro el texto sobre la marca
    // es `onPrimary` (blanco en todos los tonos); en oscuro el degradado es
    // apagado y `onPrimary` es el color del FONDO —#232922 en Institucional—,
    // así que ahí va el texto del tema.
    final sobreMarca = palette.isDark ? palette.text : palette.onPrimary;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            _Entra(
              reloj: reloj,
              tramo: logo,
              child: Container(
                width: _ladoBaldosa,
                height: _ladoBaldosa,
                padding: const EdgeInsets.all(AppSpacing.gapSm),
                decoration: BoxDecoration(
                  // En oscuro la baldosa es la superficie de la aplicación con
                  // su borde, como cualquier tarjeta: el logo lleva verde, azul
                  // y lima, y así tiene el mismo contraste que en el resto de
                  // la app con cualquier tono. En claro va casi blanca sobre el
                  // degradado.
                  color: palette.isDark
                      ? palette.surface
                      : palette.onPrimary.withValues(alpha: 0.94),
                  borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
                  border: palette.isDark
                      ? Border.all(color: palette.border)
                      : null,
                  boxShadow: AppShadows.md(palette.isDark),
                ),
                child: Image.asset(
                  'assets/logo.webp',
                  cacheHeight:
                      (_ladoLogo * MediaQuery.devicePixelRatioOf(context))
                          .round(),
                  errorBuilder: (_, __, ___) =>
                      Icon(Icons.school_outlined, color: palette.primary),
                ),
              ),
            ),
            const Spacer(),
            // Rubri saluda desde el otro lado: es la primera cara de la
            // aplicación y la única ilustración de la pantalla. Su vaivén
            // propio sigue después de la apertura (y se apaga solo con
            // «reducir movimiento», dentro del propio widget); el
            // `RepaintBoundary` es para que ese vaivén de 3,6 s no repinte
            // también la baldosa y el título.
            _Entra(
              reloj: reloj,
              tramo: mascota,
              child: RepaintBoundary(
                child: Rubri(emotion: emocion, size: _ladoRubri),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.page),
        _Entra(
          reloj: reloj,
          tramo: titulo,
          child: Text(
            'UTS Nexus Académico',
            style: AppType.h2.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
              color: sobreMarca,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.gapSm),
        _Entra(
          reloj: reloj,
          tramo: frase,
          child: Text(
            'Menos planillas. Más tiempo con tus estudiantes.',
            style: AppType.body.copyWith(
              color: sobreMarca.withValues(alpha: 0.82),
              height: 1.4,
            ),
          ),
        ),
      ],
    );
  }
}

/// La tarjeta del formulario. Es la superficie de contenido de siempre —color,
/// degradado imperceptible y borde de `AppCard`— con la sombra grande, porque
/// flota sobre el degradado de marca y no sobre el fondo de página, y con la
/// esquina grande, que es la de las hojas y lo que la lee como «el objeto que
/// acaba de entrar». El `Material` transparente va dentro de la decoración por
/// lo mismo que en `AppCard`: la onda del ojo de la contraseña se pinta sobre
/// el `Material` más cercano.
class _TarjetaDeAcceso extends StatelessWidget {
  final Widget child;

  const _TarjetaDeAcceso({required this.child});

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: palette.surface,
        gradient: AppGradients.surface(palette),
        borderRadius: BorderRadius.circular(AppSpacing.radiusLarge),
        border: Border.all(color: palette.border),
        boxShadow: AppShadows.lg(palette.isDark),
      ),
      child: Material(
        color: Colors.transparent,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.page),
          child: child,
        ),
      ),
    );
  }
}

/// El botón de entrar con su estado de envío: la sombra baja un nivel —se lee
/// como que se apoya mientras trabaja, no como que se apagó— y debajo aparece
/// una barra de progreso de 3 dp **con su alto ya reservado**, para que el
/// formulario no dé un salto al empezar a enviar.
class _BotonPrincipal extends StatelessWidget {
  final bool enviando;
  final VoidCallback onPressed;

  const _BotonPrincipal({required this.enviando, required this.onPressed});

  static const double _grosorBarra = 3;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final sinMovimiento = MediaQuery.disableAnimationsOf(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AnimatedContainer(
          duration: sinMovimiento ? Duration.zero : AppMotion.fast,
          curve: AppMotion.curve,
          decoration: BoxDecoration(
            borderRadius: _radioDelBoton(context),
            boxShadow: enviando
                ? AppShadows.sm(palette.isDark)
                : AppShadows.md(palette.isDark),
          ),
          // El alto lo pone el tema (48 dp): el objetivo táctil está decidido
          // en un sitio y esta pantalla no es la excepción.
          child: FilledButton(
            onPressed: enviando ? null : onPressed,
            child: Text(enviando ? 'Entrando…' : 'Entrar'),
          ),
        ),
        const SizedBox(height: AppSpacing.gapSm),
        SizedBox(
          height: _grosorBarra,
          child: AnimatedOpacity(
            opacity: enviando ? 1 : 0,
            duration: sinMovimiento ? Duration.zero : AppMotion.fast,
            child: enviando
                ? ClipRRect(
                    borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
                    child: LinearProgressIndicator(
                      minHeight: _grosorBarra,
                      color: palette.primary,
                      backgroundColor: palette.primarySoft,
                    ),
                  )
                : const SizedBox.shrink(),
          ),
        ),
      ],
    );
  }

  /// El radio real del botón según la preferencia de esquinas, para que la
  /// sombra tenga exactamente su forma. El tema lo escala por el factor de
  /// «esquinas» y aquí no hay forma de saberlo salvo leyéndolo de él.
  static BorderRadiusGeometry _radioDelBoton(BuildContext context) {
    final forma = Theme.of(
      context,
    ).filledButtonTheme.style?.shape?.resolve(const {});
    if (forma is RoundedRectangleBorder) return forma.borderRadius;
    return BorderRadius.circular(AppSpacing.radiusInput);
  }
}

// ── Sin cambios respecto a la versión anterior ──────────────────────────────

/// Qué fases de la conexión se enseñan en el acceso.
///
/// Se decide con un `switch` sobre el enum y no con una lista de fases
/// ocultas: si mañana se añade una fase, esto deja de compilar y hay que
/// decidir qué hacer con ella. Con una lista, la fase nueva se colaría o se
/// quedaría muda sin que nadie lo notara.
bool _muestraConexion(ConnectionPhase fase) => switch (fase) {
  ConnectionPhase.checking => false,
  ConnectionPhase.connected => false,
  ConnectionPhase.discovering => true,
  ConnectionPhase.degraded => true,
  ConnectionPhase.notFound => true,
};

/// Estado de la conexión, en lenguaje de usuario.
class _ConnectionBanner extends StatelessWidget {
  final ServerConnectionState state;
  final VoidCallback onRetry;
  final VoidCallback onManual;

  const _ConnectionBanner({
    required this.state,
    required this.onRetry,
    required this.onManual,
  });

  @override
  Widget build(BuildContext context) {
    final muted = context.palette.muted;

    // `switch` como expresión: el analizador comprueba que estén todos los
    // casos del enum, así que añadir una fase nueva rompe la compilación en vez
    // de dejar la pantalla en blanco.
    return switch (state.phase) {
      ConnectionPhase.checking => _row(
        icon: Icons.wifi_find_outlined,
        color: muted,
        text: 'Comprobando el servidor…',
      ),
      ConnectionPhase.discovering => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _row(
            icon: Icons.travel_explore_outlined,
            color: SemanticTone.of(context, SemanticKind.info).fg,
            text: 'Buscando el servidor en tu red…',
          ),
          const SizedBox(height: AppSpacing.gapSm),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
            child: LinearProgressIndicator(
              value: state.progress == 0 ? null : state.progress,
              minHeight: 4,
            ),
          ),
        ],
      ),
      ConnectionPhase.connected => _row(
        icon: Icons.check_circle_outline,
        color: SemanticTone.of(context, SemanticKind.success).fg,
        text: state.detail ?? 'Servidor encontrado',
      ),

      ConnectionPhase.degraded => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _row(
            icon: Icons.warning_amber_outlined,
            color: SemanticTone.of(context, SemanticKind.warning).fg,
            text: 'El servidor no alcanza la base de datos',
          ),
          const SizedBox(height: AppSpacing.gapXs),
          Text(
            'Podrás abrir la app, pero no habrá datos hasta que se resuelva.',
            style: AppType.caption.copyWith(color: muted),
          ),
        ],
      ),
      ConnectionPhase.notFound => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _row(
            icon: Icons.wifi_off_outlined,
            color: SemanticTone.of(context, SemanticKind.danger).fg,
            text: 'No encontramos el servidor',
          ),
          const SizedBox(height: AppSpacing.gapXs),
          Text(
            state.detail ??
                'Verifica que el servidor esté encendido y que estés en la misma red Wi-Fi.',
            style: AppType.caption.copyWith(color: muted),
          ),
          const SizedBox(height: AppSpacing.gapSm),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('Buscar de nuevo'),
                ),
              ),
              const SizedBox(width: AppSpacing.gapSm),
              Expanded(
                child: TextButton(
                  onPressed: onManual,
                  child: const Text('Escribir dirección'),
                ),
              ),
            ],
          ),
        ],
      ),
    };
  }

  Widget _row({
    required IconData icon,
    required Color color,
    required String text,
  }) {
    return Row(
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: AppSpacing.gapSm),
        Expanded(
          child: Text(
            text,
            style: AppType.captionStrong.copyWith(color: color),
          ),
        ),
      ],
    );
  }
}
