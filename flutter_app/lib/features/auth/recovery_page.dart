import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/network/api_error.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';

/// Recuperación de contraseña, en dos pasos.
///
/// La versión anterior mostraba los tres campos y los dos botones a la vez, y
/// volcaba `response.data.toString()` en pantalla. Aquí el flujo es secuencial:
/// primero se pide el código, y solo entonces aparecen el código y la nueva
/// contraseña. Nadie tiene que adivinar el orden.
class RecoveryPage extends StatefulWidget {
  const RecoveryPage({super.key, this.requestCode, this.resetPassword});

  final Future<Map<String, dynamic>> Function(String email)? requestCode;
  final Future<void> Function(String email, String code, String password)? resetPassword;

  @override
  State<RecoveryPage> createState() => _RecoveryPageState();
}

enum _Step { requestCode, resetPassword, done }

class _RecoveryPageState extends State<RecoveryPage> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _confirmation = TextEditingController();

  _Step _step = _Step.requestCode;
  bool _busy = false;
  String? _error;
  String? _devCode;
  int _resendSeconds = 0;
  Timer? _resendTimer;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _password.dispose();
    _confirmation.dispose();
    _resendTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Recuperar contraseña'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/login'),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: _step == _Step.done
                  ? _DoneView(onBack: () => context.go('/login'))
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          _step == _Step.requestCode
                              ? 'Te enviaremos un código al correo institucional registrado.'
                              : 'Revisa tu correo e ingresa el código que recibiste.',
                          style: AppType.body.copyWith(color: muted),
                        ),
                        const SizedBox(height: 22),
                        TextField(
                          controller: _email,
                          enabled: _step == _Step.requestCode,
                          keyboardType: TextInputType.emailAddress,
                          autocorrect: false,
                          decoration: const InputDecoration(
                            labelText: 'Correo institucional',
                            prefixIcon: Icon(Icons.mail_outline),
                          ),
                        ),
                        if (_step == _Step.resetPassword) ...[
                          const SizedBox(height: 14),
                          TextField(
                            controller: _code,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: 'Código recibido',
                              prefixIcon: Icon(Icons.pin_outlined),
                            ),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _confirmation,
                            obscureText: true,
                            decoration: const InputDecoration(
                              labelText: 'Confirmar contraseña',
                              prefixIcon: Icon(Icons.lock_outline),
                            ),
                          ),
                          if (_devCode != null) ...[
                            const SizedBox(height: 12),
                            Text(
                              'Código local de desarrollo: $_devCode',
                              style: AppType.caption.copyWith(color: muted),
                            ),
                          ],
                          // El aviso es permanente y no un SnackBar: el correo
                          // tarda, y para cuando alguien se pregunta dónde está
                          // el código, un aviso pasajero ya desapareció. Los
                          // códigos salen de una cuenta que no es la
                          // institucional, así que el filtro los manda a no
                          // deseado con frecuencia.
                          const SizedBox(height: 12),
                          Text(
                            'El código puede tardar un momento. Si no lo ves en tu bandeja '
                            'de entrada, revisa la carpeta de correo no deseado o spam.',
                            style: AppType.caption.copyWith(color: muted),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _password,
                            obscureText: true,
                            decoration: const InputDecoration(
                              labelText: 'Nueva contraseña',
                              prefixIcon: Icon(Icons.lock_outline),
                              helperText: 'Mínimo 8 caracteres',
                            ),
                          ),
                        ],
                        if (_error != null) ...[
                          const SizedBox(height: 14),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Icon(Icons.error_outline,
                                  size: 18, color: AppColors.danger),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _error!,
                                  style: AppType.caption
                                      .copyWith(color: AppColors.danger),
                                ),
                              ),
                            ],
                          ),
                        ],
                        const SizedBox(height: 24),
                        FilledButton(
                          onPressed: _busy ? null : _submit,
                          child: _busy
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2.4))
                              : Text(_step == _Step.requestCode
                                  ? 'Enviar código'
                                  : 'Restablecer contraseña'),
                        ),
                        if (_step == _Step.resetPassword) ...[
                          TextButton(
                            onPressed: _busy || _resendSeconds > 0
                                ? null
                                : _requestCode,
                            child: Text(_resendSeconds > 0
                                ? 'Reenviar disponible en $_resendSeconds s'
                                : 'Reenviar código'),
                          ),
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: _busy
                                ? null
                                : () => setState(() {
                                      _step = _Step.requestCode;
                                      _error = null;
                                    }),
                            child: const Text('Usar otro correo'),
                          ),
                        ],
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      if (_step == _Step.requestCode) {
        await _requestCode();
      } else {
        if (_code.text.trim().isEmpty) {
          setState(() => _error = 'Ingresa el código que recibiste.');
          return;
        }
        if (_password.text.length < 8) {
          setState(
              () => _error = 'La contraseña debe tener al menos 8 caracteres.');
          return;
        }
        if (_password.text.length > 128) {
          setState(() => _error = 'La contraseña no puede superar 128 caracteres.');
          return;
        }
        if (_password.text != _confirmation.text) {
          setState(() => _error = 'Las contraseñas no coinciden.');
          return;
        }
        if (widget.resetPassword != null) {
          await widget.resetPassword!(_email.text.trim(), _code.text.trim(), _password.text);
        } else {
          await ApiClient.instance.post('/auth/recovery/reset', data: {
            'email': _email.text.trim(),
            'code': _code.text.trim(),
            'newPassword': _password.text,
          });
        }
        if (mounted) setState(() => _step = _Step.done);
      }
    } on ApiError catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _requestCode() async {
    final email = _email.text.trim();
    if (email.isEmpty || !email.contains('@')) {
      setState(() => _error = 'Ingresa un correo válido.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data = widget.requestCode != null
          ? await widget.requestCode!(email)
          : (await ApiClient.instance
                  .post('/auth/recovery/request', data: {'email': email}))
              .data;
      if (!mounted) return;
      setState(() {
        _step = _Step.resetPassword;
        _devCode = data is Map ? data['devCode'] as String? : null;
        _resendSeconds = 60;
      });
      _resendTimer?.cancel();
      _resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
        if (!mounted || _resendSeconds <= 1) {
          timer.cancel();
          if (mounted) setState(() => _resendSeconds = 0);
        } else {
          setState(() => _resendSeconds--);
        }
      });
    } on ApiError catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _DoneView extends StatelessWidget {
  final VoidCallback onBack;
  const _DoneView({required this.onBack});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 20),
        const Icon(Icons.check_circle_outline,
            size: 64, color: AppColors.success),
        const SizedBox(height: 18),
        Text(
          'Contraseña actualizada',
          textAlign: TextAlign.center,
          style: AppType.h3.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        const Text(
          'Ya puedes ingresar con tu nueva contraseña.',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 26),
        FilledButton(onPressed: onBack, child: const Text('Ir al acceso')),
      ],
    );
  }
}
