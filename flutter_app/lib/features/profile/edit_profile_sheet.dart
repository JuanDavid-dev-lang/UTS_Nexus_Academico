import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/data/providers.dart';
import '../../core/network/api_error.dart';
import '../../core/services/auth_controller.dart';
import '../../core/theme/app_theme.dart';

// Los providers del perfil viven en `core/data/providers.dart` (la regla del
// repo): declararlos aquí obligaba a importar esta hoja para leer la ficha, y
// el gate de trabajos de grado la necesita fuera de esta pantalla.

/// Edición del perfil propio.
///
/// Lo editable es deliberadamente poco: nombre, cargo, departamento y foto. La
/// sede, la facultad y los programas son alcance académico y los decide la
/// administración — que alguien pudiera editar el suyo significaría poder
/// ampliarlo.
Future<void> showEditProfile(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => const _EditProfileSheet(),
  );
}

class _EditProfileSheet extends ConsumerStatefulWidget {
  const _EditProfileSheet();

  @override
  ConsumerState<_EditProfileSheet> createState() => _EditProfileSheetState();
}

class _EditProfileSheetState extends ConsumerState<_EditProfileSheet> {
  final _nombre = TextEditingController();
  final _cargo = TextEditingController();
  final _departamento = TextEditingController();

  bool _cargado = false;
  bool _guardando = false;
  bool _subiendo = false;
  String? _fotoUrl;

  @override
  void dispose() {
    _nombre.dispose();
    _cargo.dispose();
    _departamento.dispose();
    super.dispose();
  }

  Future<void> _elegirFoto() async {
    final elegida = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      // Se reduce antes de subir: una foto de cámara moderna son varios MB y el
      // servidor corta en 8. Un avatar no necesita más que esto.
      maxWidth: 512,
      maxHeight: 512,
      imageQuality: 85,
    );
    if (elegida == null || !mounted) return;

    setState(() => _subiendo = true);
    try {
      final url =
          await ref.read(profileServiceProvider).uploadImage(elegida.path);
      if (mounted) setState(() => _fotoUrl = url);
    } catch (error) {
      if (mounted) _avisar(ApiError.from(error).message);
    } finally {
      if (mounted) setState(() => _subiendo = false);
    }
  }

  Future<void> _guardar() async {
    setState(() => _guardando = true);
    try {
      await ref.read(profileServiceProvider).update(
            fullName: _nombre.text.trim().isEmpty ? null : _nombre.text.trim(),
            title: _cargo.text.trim().isEmpty ? null : _cargo.text.trim(),
            department: _departamento.text.trim().isEmpty
                ? null
                : _departamento.text.trim(),
            photoUrl: _fotoUrl,
          );
      // La sesión guarda el nombre y la foto que ve el resto de la aplicación.
      await ref.read(authControllerProvider.notifier).refreshUser();
      ref.invalidate(miPerfilProvider);
      if (mounted) Navigator.of(context).pop();
    } catch (error) {
      if (!mounted) return;
      setState(() => _guardando = false);
      _avisar(ApiError.from(error).message);
    }
  }

  void _avisar(String mensaje) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(mensaje)));
  }

  @override
  Widget build(BuildContext context) {
    final perfil = ref.watch(miPerfilProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;
    final primary = Theme.of(context).colorScheme.primary;
    final user = ref.watch(authControllerProvider).user;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: perfil.when(
        loading: () => const Padding(
          padding: EdgeInsets.all(40),
          child: Center(child: CircularProgressIndicator()),
        ),
        error: (error, _) => Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'Esta cuenta no tiene ficha de docente, así que no hay cargo ni '
            'departamento que editar.\n\n${ApiError.from(error).message}',
            style: AppType.caption.copyWith(color: muted),
          ),
        ),
        data: (datos) {
          // Se rellena una sola vez: hacerlo en cada build pisaría lo que el
          // docente está escribiendo.
          if (!_cargado) {
            _cargado = true;
            _nombre.text = user?.fullName ?? '';
            _cargo.text = datos.title;
            _departamento.text = datos.department;
            _fotoUrl = datos.photoUrl;
          }

          return SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Editar perfil', style: AppType.h3),
                const SizedBox(height: 16),

                Center(
                  child: Stack(
                    alignment: Alignment.bottomRight,
                    children: [
                      CircleAvatar(
                        radius: 44,
                        backgroundColor: primary.withValues(alpha: 0.12),
                        foregroundImage: _fotoUrl != null
                            ? NetworkImage(_fotoUrl!)
                            : null,
                        child: Text(
                          _iniciales(_nombre.text),
                          style: AppType.h2.copyWith(color: primary),
                        ),
                      ),
                      Material(
                        color: primary,
                        shape: const CircleBorder(),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: _subiendo ? null : _elegirFoto,
                          child: Padding(
                            padding: const EdgeInsets.all(7),
                            child: _subiendo
                                ? const SizedBox(
                                    height: 16,
                                    width: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Icon(Icons.photo_camera_outlined,
                                    size: 16, color: Colors.white),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                TextField(
                  controller: _nombre,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(
                    labelText: 'Nombre completo',
                    isDense: true,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _cargo,
                  decoration: const InputDecoration(
                    labelText: 'Cargo',
                    hintText: 'Docente',
                    isDense: true,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _departamento,
                  decoration: const InputDecoration(
                    labelText: 'Departamento',
                    hintText: 'UTS',
                    isDense: true,
                  ),
                ),

                if (datos.sede != null || datos.facultad != null) ...[
                  const SizedBox(height: 14),
                  Text(
                    'Sede y facultad las asigna la administración: definen a qué '
                    'estudiantes tienes alcance, así que no se editan aquí.',
                    style: AppType.caption.copyWith(color: muted),
                  ),
                ],

                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _guardando ? null : _guardar,
                  child: _guardando
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Guardar cambios'),
                ),
                const SizedBox(height: 8),
              ],
            ),
          );
        },
      ),
    );
  }

  static String _iniciales(String nombre) {
    final partes =
        nombre.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (partes.isEmpty) return '?';
    if (partes.length == 1) return partes.first.substring(0, 1).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }
}
