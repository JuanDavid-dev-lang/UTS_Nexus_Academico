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
  const RegisterPage({super.key});

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final _formulario = GlobalKey<FormState>();
  final _servicio = RegistroService();

  final _cedula = TextEditingController();
  final _nombres = TextEditingController();
  final _apellidos = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();

  String? _sede;
  String? _facultad;
  final Set<String> _niveles = {};
  final Set<String> _programas = {};

  Catalogo? _catalogo;
  bool _cargando = true;
  bool _enviando = false;
  String? _error;
  String? _enviado;

  @override
  void initState() {
    super.initState();
    _cargarCatalogo();
  }

  @override
  void dispose() {
    for (final c in [_cedula, _nombres, _apellidos, _email, _password]) {
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
      appBar: AppBar(title: const Text('Registro de docentes')),
      body: _construirCuerpo(muted),
    );
  }

  Widget _construirCuerpo(Color muted) {
    if (_cargando) return const Center(child: CircularProgressIndicator());

    if (_enviado != null) {
      return Center(
        child: Padding(
          padding: AppSpacing.pagePadding,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.check_circle_outline,
                  size: 56, color: SemanticTone.of(context, SemanticKind.success).fg),
              const SizedBox(height: 16),
              Text('Solicitud enviada', style: AppType.h3),
              const SizedBox(height: 8),
              Text(_enviado!, style: AppType.body.copyWith(color: muted), textAlign: TextAlign.center),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: () => context.go('/login'),
                child: const Text('Volver al inicio de sesión'),
              ),
            ],
          ),
        ),
      );
    }

    final c = _catalogo;
    if (_error != null || c == null || !c.abierto) {
      return Center(
        child: Padding(
          padding: AppSpacing.pagePadding,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.lock_outline, size: 48, color: muted),
              const SizedBox(height: 16),
              Text(_error ?? 'El registro está cerrado', style: AppType.h3, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text(
                _error != null
                    ? 'Revisa la dirección del servidor en Ajustes.'
                    : 'La administración tiene que habilitarlo antes de que puedas registrarte.',
                style: AppType.body.copyWith(color: muted),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }

    final visibles = _facultad == null || _niveles.isEmpty
        ? <Programa>[]
        : c.filtrar(facultad: _facultad!, niveles: _niveles);

    return Form(
      key: _formulario,
      child: ListView(
        padding: AppSpacing.pagePadding,
        children: [
          Text('Tus datos', style: AppType.h3),
          const SizedBox(height: 12),
          TextFormField(
            controller: _cedula,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(labelText: 'Cédula', isDense: true),
            validator: (v) =>
                RegExp(r'^\d{6,10}$').hasMatch(v?.trim() ?? '') ? null : 'Entre 6 y 10 dígitos',
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _nombres,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Nombres', isDense: true),
            validator: (v) => (v?.trim().length ?? 0) >= 2 ? null : 'Escribe tus nombres',
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _apellidos,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Apellidos', isDense: true),
            validator: (v) => (v?.trim().length ?? 0) >= 2 ? null : 'Escribe tus apellidos',
          ),

          const SizedBox(height: 24),
          Text('Dónde enseñas', style: AppType.h3),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _sede,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Sede', isDense: true),
            items: c.sedes
                .map((s) => DropdownMenuItem(value: s.id, child: Text(s.nombre)))
                .toList(),
            onChanged: (v) => setState(() => _sede = v),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _facultad,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Facultad', isDense: true),
            items: c.facultades
                .map((f) => DropdownMenuItem(
                    value: f.id, child: Text(f.nombre, overflow: TextOverflow.ellipsis)))
                .toList(),
            onChanged: (v) => setState(() {
              _facultad = v;
              _depurarProgramas();
            }),
          ),

          const SizedBox(height: 16),
          Text('Nivel en el que dictas', style: AppType.body),
          for (final n in c.niveles)
            CheckboxListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              value: _niveles.contains(n.id),
              title: Text(n.nombre, style: AppType.body),
              onChanged: (marcado) => setState(() {
                if (marcado == true) {
                  _niveles.add(n.id);
                } else {
                  _niveles.remove(n.id);
                }
                _depurarProgramas();
              }),
            ),

          const SizedBox(height: 16),
          Text('Programas en los que dictas', style: AppType.body),
          const SizedBox(height: 6),
          if (visibles.isEmpty)
            AppCard(
              child: Text(
                'Elige primero la facultad y el nivel; aquí aparecerán solo los programas de esa combinación.',
                style: AppType.caption.copyWith(color: muted),
              ),
            )
          else
            AppCard(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Column(
                children: [
                  for (final p in visibles)
                    CheckboxListTile(
                      dense: true,
                      controlAffinity: ListTileControlAffinity.leading,
                      value: _programas.contains(p.id),
                      title: Text(p.nombre, style: AppType.caption),
                      onChanged: (marcado) => setState(() {
                        if (marcado == true) {
                          _programas.add(p.id);
                        } else {
                          _programas.remove(p.id);
                        }
                      }),
                    ),
                ],
              ),
            ),

          const SizedBox(height: 24),
          Text('Tu cuenta', style: AppType.h3),
          const SizedBox(height: 12),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            decoration: const InputDecoration(
                labelText: 'Correo institucional', hintText: 'nombre@uts.edu.co', isDense: true),
            validator: (v) =>
                RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v?.trim() ?? '') ? null : 'Correo inválido',
          ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _password,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'Contraseña',
              helperText: ayudaPassword,
              isDense: true,
            ),
            // La política vive en `core/auth/password_policy.dart`, compartida
            // con la recuperación de contraseña.
            validator: (v) => revisarPassword(v ?? ''),
          ),

          const SizedBox(height: 24),
          FilledButton(
            onPressed: _enviando ? null : _enviar,
            child: _enviando
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2.4))
                : const Text('Enviar solicitud'),
          ),
          const SizedBox(height: 12),
          Text(
            'Un administrador revisa cada solicitud antes de dar acceso.',
            style: AppType.caption.copyWith(color: muted),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
