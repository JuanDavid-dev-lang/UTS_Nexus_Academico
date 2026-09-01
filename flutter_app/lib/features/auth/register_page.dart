import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/password_policy.dart';
import '../../core/network/api_error.dart';
import './data/registro_service.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/ui_kit.dart';

/// Solicitud de registro de un docente.
///
/// El formulario está encadenado: la facultad y los niveles marcados deciden
/// qué programas se ofrecen. Ofrecer los 32 de golpe obligaría a buscar entre
/// carreras de otra facultad en una pantalla de teléfono, y dejaría enviar
/// combinaciones que el servidor va a rechazar.
class RegisterPage extends StatefulWidget {
  final RegistroService? servicio;

  const RegisterPage({super.key, this.servicio});

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final _formulario = GlobalKey<FormState>();
  late final RegistroService _servicio;

  final _cedula = TextEditingController();
  final _nombres = TextEditingController();
  final _apellidos = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _searchProgramas = TextEditingController();

  String? _sede;
  String? _facultad;
  final Set<String> _niveles = {};
  final Set<String> _programas = {};

  Catalogo? _catalogo;
  bool _cargando = true;
  bool _enviando = false;
  bool _obscurePassword = true;
  String _filtroPrograma = '';
  String? _error;
  String? _enviado;

  @override
  void initState() {
    super.initState();
    _servicio = widget.servicio ?? RegistroService();
    _password.addListener(_onPasswordChanged);
    _searchProgramas.addListener(_onSearchChanged);
    _cargarCatalogo();
  }

  void _onPasswordChanged() {
    if (mounted) setState(() {});
  }

  void _onSearchChanged() {
    if (mounted) setState(() => _filtroPrograma = _searchProgramas.text.trim().toLowerCase());
  }

  @override
  void dispose() {
    _password.removeListener(_onPasswordChanged);
    _searchProgramas.removeListener(_onSearchChanged);
    for (final c in [_cedula, _nombres, _apellidos, _email, _password, _searchProgramas]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _cargarCatalogo() async {
    try {
      final c = await _servicio.catalogo();
      if (!mounted) return;
      setState(() {
        _catalogo = c;
        _cargando = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = ApiError.from(error).message;
        _cargando = false;
      });
    }
  }

  /// Al cambiar facultad o nivel, se sueltan los programas que dejan de valer.
  void _depurarProgramas() {
    final c = _catalogo;
    if (c == null || _facultad == null) return _programas.clear();
    final validos = c.filtrar(facultad: _facultad!, niveles: _niveles).map((p) => p.id).toSet();
    _programas.removeWhere((id) => !validos.contains(id));
  }

  void _alternarNivel(String id) {
    setState(() {
      if (_niveles.contains(id)) {
        _niveles.remove(id);
      } else {
        _niveles.add(id);
      }
      _depurarProgramas();
    });
  }

  void _marcarTodosProgramas(List<Programa> lista) {
    setState(() {
      _programas.addAll(lista.map((p) => p.id));
    });
  }

  void _desmarcarTodosProgramas() {
    setState(() {
      _programas.clear();
    });
  }

  Future<void> _enviar() async {
    if (!(_formulario.currentState?.validate() ?? false)) return;
    if (_sede == null || _facultad == null || _niveles.isEmpty || _programas.isEmpty) {
      AppToast.error(context, 'Faltan datos', 'Completa sede, facultad, nivel y programas.');
      return;
    }

    setState(() => _enviando = true);
    try {
      final mensaje = await _servicio.solicitar(
        cedula: _cedula.text.trim(),
        nombres: _nombres.text.trim(),
        apellidos: _apellidos.text.trim(),
        sede: _sede!,
        facultad: _facultad!,
        niveles: _niveles.toList(),
        programas: _programas.toList(),
        email: _email.text.trim(),
        password: _password.text,
      );
      if (!mounted) return;
      setState(() {
        _enviado = mensaje;
        _enviando = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _enviando = false);
      AppToast.error(context, 'No se pudo enviar', ApiError.from(error).message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Registro de docentes'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Volver',
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go('/login');
            }
          },
        ),
      ),
      body: _construirCuerpo(muted),
    );
  }

  Widget _construirCuerpo(Color muted) {
    if (_cargando) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Cargando catálogo institucional…', style: AppType.caption),
          ],
        ),
      );
    }

    if (_enviado != null) {
      return Center(
        child: SingleChildScrollView(
          padding: AppSpacing.pagePadding,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: AppCard(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    decoration: BoxDecoration(
                      color: SemanticTone.of(context, SemanticKind.success).bg,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.check_circle_outline,
                      size: 38,
                      color: SemanticTone.of(context, SemanticKind.success).fg,
                    ),
                  ),
                  const SizedBox(height: 16),
                  StatusPill.success('Solicitud radicada', icon: Icons.check),
                  const SizedBox(height: 12),
                  Text('¡Solicitud enviada!', style: AppType.h2, textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  Text(
                    _enviado!,
                    style: AppType.body.copyWith(color: muted),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
                      borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
                      border: Border.all(color: Theme.of(context).dividerColor),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.info_outline, size: 18, color: Theme.of(context).colorScheme.primary),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'La administración revisará tu adscripción para autorizar el acceso. Te notificaremos a tu correo institucional.',
                            style: AppType.caption.copyWith(color: muted),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: () => context.go('/login'),
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                    child: const Text('Volver al inicio de sesión'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    final c = _catalogo;
    if (_error != null || c == null || !c.abierto) {
      return Center(
        child: Padding(
          padding: AppSpacing.pagePadding,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: AppCard(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.lock_clock_outlined, size: 48, color: Theme.of(context).colorScheme.error),
                  const SizedBox(height: 16),
                  Text(
                    _error ?? 'El registro está cerrado',
                    style: AppType.h3,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _error != null
                      ? 'Revisa la dirección del servidor en la pantalla de acceso.'
                      : 'La administración académica tiene cerrado el autorregistro en este momento. Contacta a tu coordinación.',
                    style: AppType.body.copyWith(color: muted),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  OutlinedButton.icon(
                    onPressed: () {
                      if (context.canPop()) {
                        context.pop();
                      } else {
                        context.go('/login');
                      }
                    },
                    icon: const Icon(Icons.arrow_back),
                    label: const Text('Volver al inicio'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    final todosVisibles = _facultad == null || _niveles.isEmpty
        ? <Programa>[]
        : c.filtrar(facultad: _facultad!, niveles: _niveles);

    final visibles = _filtroPrograma.isEmpty
        ? todosVisibles
        : todosVisibles
            .where((p) => p.nombre.toLowerCase().contains(_filtroPrograma))
            .toList();

    return Form(
      key: _formulario,
      child: ListView(
        padding: AppSpacing.pagePadding,
        children: [
          // Banner de cabecera
          BrandSurface(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.school_outlined, size: 28, color: Colors.white),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Únete a la docencia UTS',
                        style: AppType.bodyStrong.copyWith(color: Colors.white),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Solicita tu cuenta institucional para gestionar tus notas y grupos.',
                        style: AppType.caption.copyWith(color: Colors.white.withValues(alpha: 0.85)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // SECCIÓN 1: DATOS PERSONALES
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _CabeceraSeccion(
                  numero: '1',
                  icono: Icons.person_outline,
                  titulo: 'Datos personales',
                  subtitulo: 'Identificación y nombres del docente',
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _cedula,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(
                    labelText: 'Cédula de ciudadanía',
                    hintText: '1098765432',
                    prefixIcon: Icon(Icons.badge_outlined),
                    isDense: true,
                  ),
                  validator: (v) =>
                      RegExp(r'^\d{6,10}$').hasMatch(v?.trim() ?? '') ? null : 'Entre 6 y 10 dígitos',
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _nombres,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Nombres completos',
                    hintText: 'María Fernanda',
                    prefixIcon: Icon(Icons.person_outline),
                    isDense: true,
                  ),
                  validator: (v) => (v?.trim().length ?? 0) >= 2 ? null : 'Escribe tus nombres',
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _apellidos,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Apellidos completos',
                    hintText: 'Ortiz Gómez',
                    prefixIcon: Icon(Icons.person_outline),
                    isDense: true,
                  ),
                  validator: (v) => (v?.trim().length ?? 0) >= 2 ? null : 'Escribe tus apellidos',
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // SECCIÓN 2: DÓNDE ENSEÑAS
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _CabeceraSeccion(
                  numero: '2',
                  icono: Icons.location_city_outlined,
                  titulo: 'Dónde enseñas',
                  subtitulo: 'Sede, facultad y carreras a cargo',
                ),
                const SizedBox(height: 14),
                DropdownButtonFormField<String>(
                  initialValue: _sede,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Sede institucional',
                    prefixIcon: Icon(Icons.business_outlined),
                    isDense: true,
                  ),
                  items: c.sedes
                      .map((s) => DropdownMenuItem(value: s.id, child: Text(s.nombre)))
                      .toList(),
                  onChanged: (v) => setState(() => _sede = v),
                  validator: (v) => v == null || v.isEmpty ? 'Elige una sede' : null,
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _facultad,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Facultad',
                    prefixIcon: Icon(Icons.account_balance_outlined),
                    isDense: true,
                  ),
                  items: c.facultades
                      .map((f) => DropdownMenuItem(
                          value: f.id, child: Text(f.nombre, overflow: TextOverflow.ellipsis)))
                      .toList(),
                  onChanged: (v) => setState(() {
                    _facultad = v;
                    _depurarProgramas();
                  }),
                  validator: (v) => v == null || v.isEmpty ? 'Elige una facultad' : null,
                ),

                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Nivel en el que dictas', style: AppType.captionStrong),
                    Text('Elige uno o ambos', style: AppType.caption.copyWith(color: muted)),
                  ],
                ),
                const SizedBox(height: 8),

                // Selector de niveles interactivo en chips/cards
                Row(
                  children: c.niveles.map((n) {
                    final marcado = _niveles.contains(n.id);
                    return Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Material(
                          color: Colors.transparent,
                          child: InkWell(
                            onTap: () => _alternarNivel(n.id),
                            borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
                            child: AnimatedContainer(
                              duration: AppMotion.fast,
                              padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
                              decoration: BoxDecoration(
                                color: marcado
                                    ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.1)
                                    : Theme.of(context).colorScheme.surface,
                                borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
                                border: Border.all(
                                  color: marcado
                                      ? Theme.of(context).colorScheme.primary
                                      : Theme.of(context).dividerColor,
                                  width: marcado ? 1.5 : 1,
                                ),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    marcado ? Icons.check_circle : Icons.school_outlined,
                                    size: 18,
                                    color: marcado
                                        ? Theme.of(context).colorScheme.primary
                                        : muted,
                                  ),
                                  const SizedBox(width: 6),
                                  Flexible(
                                    child: Text(
                                      n.nombre,
                                      style: AppType.captionStrong.copyWith(
                                        color: marcado
                                            ? Theme.of(context).colorScheme.primary
                                            : null,
                                      ),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),

                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Programas académicos', style: AppType.captionStrong),
                    if (todosVisibles.isNotEmpty)
                      StatusPill(
                        '${_programas.length} de ${todosVisibles.length}',
                        kind: _programas.isNotEmpty ? SemanticKind.success : SemanticKind.info,
                      ),
                  ],
                ),
                const SizedBox(height: 8),

                if (todosVisibles.isEmpty)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
                      borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
                      border: Border.all(color: Theme.of(context).dividerColor),
                    ),
                    child: Text(
                      'Elige primero la facultad y el nivel; aquí aparecerán solo los programas que correspondan.',
                      style: AppType.caption.copyWith(color: muted),
                    ),
                  )
                else
                  Material(
                    color: Theme.of(context).colorScheme.surface,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
                      side: BorderSide(color: Theme.of(context).dividerColor),
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Column(
                      children: [
                        if (todosVisibles.length > 3)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
                            child: TextField(
                              controller: _searchProgramas,
                              decoration: InputDecoration(
                                hintText: 'Buscar programa…',
                                prefixIcon: const Icon(Icons.search, size: 18),
                                isDense: true,
                                suffixIcon: _filtroPrograma.isNotEmpty
                                    ? IconButton(
                                        icon: const Icon(Icons.clear, size: 16),
                                        onPressed: () => _searchProgramas.clear(),
                                      )
                                    : null,
                              ),
                            ),
                          ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              TextButton(
                                style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                                onPressed: () => _marcarTodosProgramas(todosVisibles),
                                child: const Text('Marcar todos'),
                              ),
                              const SizedBox(width: 4),
                              TextButton(
                                style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                                onPressed: _desmarcarTodosProgramas,
                                child: const Text('Desmarcar'),
                              ),
                            ],
                          ),
                        ),
                        const Divider(height: 1),
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxHeight: 220),
                          child: ListView.separated(
                            shrinkWrap: true,
                            itemCount: visibles.length,
                            separatorBuilder: (_, __) => const Divider(height: 1),
                            itemBuilder: (context, i) {
                              final p = visibles[i];
                              final marcado = _programas.contains(p.id);
                              return CheckboxListTile(
                                dense: true,
                                controlAffinity: ListTileControlAffinity.leading,
                                value: marcado,
                                title: Text(p.nombre, style: AppType.caption),
                                subtitle: Text(p.id, style: AppType.caption.copyWith(color: muted, fontSize: 11)),
                                onChanged: (nuevo) {
                                  setState(() {
                                    if (nuevo == true) {
                                      _programas.add(p.id);
                                    } else {
                                      _programas.remove(p.id);
                                    }
                                  });
                                },
                              );
                            },
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // SECCIÓN 3: TU CUENTA
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _CabeceraSeccion(
                  numero: '3',
                  icono: Icons.lock_outline,
                  titulo: 'Tu cuenta',
                  subtitulo: 'Credenciales para ingresar al sistema',
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autocorrect: false,
                  decoration: const InputDecoration(
                    labelText: 'Correo institucional',
                    hintText: 'nombre@uts.edu.co',
                    prefixIcon: Icon(Icons.mail_outline),
                    isDense: true,
                  ),
                  validator: (v) => RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v?.trim() ?? '')
                      ? null
                      : 'Escribe un correo institucional válido',
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _password,
                  obscureText: _obscurePassword,
                  decoration: InputDecoration(
                    labelText: 'Contraseña',
                    hintText: 'Crea una clave segura',
                    prefixIcon: const Icon(Icons.key_outlined),
                    isDense: true,
                    suffixIcon: IconButton(
                      icon: Icon(_obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                      tooltip: _obscurePassword ? 'Mostrar contraseña' : 'Ocultar contraseña',
                      onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                    ),
                  ),
                  validator: (v) => revisarPassword(v ?? ''),
                ),

                // Badges dinámicos de cumplimiento de contraseña
                if (_password.text.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      _PasswordBadge(texto: '10+ caracteres', cumplida: _password.text.length >= minPassword),
                      _PasswordBadge(texto: 'Mayúscula', cumplida: RegExp(r'[A-Z]').hasMatch(_password.text)),
                      _PasswordBadge(texto: 'Minúscula', cumplida: RegExp(r'[a-z]').hasMatch(_password.text)),
                      _PasswordBadge(texto: 'Número', cumplida: RegExp(r'[0-9]').hasMatch(_password.text)),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 24),

          // Botón de envío
          FilledButton.icon(
            onPressed: _enviando ? null : _enviar,
            icon: _enviando
                ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.send_outlined),
            label: Text(_enviando ? 'Enviando solicitud…' : 'Enviar solicitud'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
          ),
          const SizedBox(height: 10),
          Text(
            'Un administrador revisa cada solicitud antes de autorizar el acceso.',
            style: AppType.caption.copyWith(color: muted),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => context.go('/login'),
            child: const Text('¿Ya tienes cuenta? Inicia sesión'),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _CabeceraSeccion extends StatelessWidget {
  final String numero;
  final IconData icono;
  final String titulo;
  final String subtitulo;

  const _CabeceraSeccion({
    required this.numero,
    required this.icono,
    required this.titulo,
    required this.subtitulo,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          alignment: Alignment.center,
          child: Text(
            numero,
            style: AppType.captionStrong.copyWith(
              color: Theme.of(context).colorScheme.primary,
            ),
          ),
        ),
        const SizedBox(width: 10),
        Icon(icono, size: 20, color: Theme.of(context).colorScheme.primary),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(titulo, style: AppType.bodyStrong),
              Text(subtitulo, style: AppType.caption.copyWith(color: muted)),
            ],
          ),
        ),
      ],
    );
  }
}

class _PasswordBadge extends StatelessWidget {
  final String texto;
  final bool cumplida;

  const _PasswordBadge({required this.texto, required this.cumplida});

  @override
  Widget build(BuildContext context) {
    final success = SemanticTone.of(context, SemanticKind.success);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: cumplida ? success.bg : Theme.of(context).colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(AppSpacing.radiusPill),
        border: Border.all(
          color: cumplida ? success.border : Theme.of(context).dividerColor,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            cumplida ? Icons.check : Icons.circle_outlined,
            size: 12,
            color: cumplida ? success.fg : muted,
          ),
          const SizedBox(width: 4),
          Text(
            texto,
            style: AppType.caption.copyWith(
              fontSize: 11,
              color: cumplida ? success.fg : muted,
              fontWeight: cumplida ? FontWeight.w600 : FontWeight.normal,
            ),
          ),
        ],
      ),
    );
  }
}
