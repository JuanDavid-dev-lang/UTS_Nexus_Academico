import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/admin/admin_mode_provider.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/data/providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/compact.dart';
import '../../core/widgets/debounced_search_field.dart';
import '../../core/widgets/session_menu.dart';
import '../../core/widgets/ui_kit.dart';

/// Pantalla de Supervisión Global de Docentes y Cuentas para administradores.
///
/// Solo accesible para cuentas con rol ADMIN. Proporciona una vista
/// panorámica y previsualización detallada de todos los profesores registrados
/// y cuentas del sistema.
class AdminSupervisionPage extends ConsumerStatefulWidget {
  const AdminSupervisionPage({super.key});

  @override
  ConsumerState<AdminSupervisionPage> createState() => _AdminSupervisionPageState();
}

class _AdminSupervisionPageState extends ConsumerState<AdminSupervisionPage>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _profSearch = TextEditingController();
  final _accSearch = TextEditingController();

  String _profQuery = '';
  String _accQuery = '';
  String? _selectedRole;

  bool _loading = false;
  List<Map<String, dynamic>> _professors = [];
  List<Map<String, dynamic>> _users = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _cargarDatos();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _profSearch.dispose();
    _accSearch.dispose();
    super.dispose();
  }

  Future<void> _cargarDatos() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final repo = ref.read(academicRepositoryProvider);
      final results = await Future.wait([
        repo.listProfessors(),
        repo.listUsers(),
      ]);

      if (mounted) {
        setState(() {
          _professors = results[0];
          _users = results[1];
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = 'No se pudieron cargar los datos de supervisión.';
          _loading = false;
        });
      }
    }
  }

  void _previsualizarDocente(Map<String, dynamic> doc) {
    final nombres = '${doc['nombres'] ?? ''} ${doc['apellidos'] ?? ''}'.trim();
    final cedula = doc['cedula'] ?? 'Sin cédula';
    final estado = doc['estado'] ?? 'ACTIVO';
    final userObj = doc['userId'] is Map ? doc['userId'] as Map : {};
    final email = userObj['email'] ?? 'Sin correo vinculado';
    final esDirector = doc['esDirectorTrabajoGrado'] == true;
    final programas = (doc['programas'] as List?)?.map((e) => e.toString()).toList() ?? [];

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Container(
          decoration: BoxDecoration(
            color: ctx.palette.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          ),
          padding: const EdgeInsets.all(AppSpacing.page),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: ctx.palette.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Row(
                children: [
                  CircleAvatar(
                    backgroundColor: AppColors.primary,
                    child: Text(
                      nombres.isNotEmpty ? nombres[0].toUpperCase() : 'D',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(nombres, style: AppType.bodyStrong),
                        Text(email, style: AppType.caption.copyWith(color: AppColors.textMuted)),
                      ],
                    ),
                  ),
                  Chip(
                    label: Text(estado.toString(), style: const TextStyle(fontSize: 11)),
                    backgroundColor: estado == 'APROBADO' ? AppColors.primarySoft : Colors.amber.shade100,
                  ),
                ],
              ),
              const Divider(height: 24),
              _FichaCampo(label: 'Cédula / Documento', valor: cedula.toString()),
              _FichaCampo(label: 'Director de Trabajo de Grado', valor: esDirector ? 'Sí (Habilitado)' : 'No'),
              _FichaCampo(
                label: 'Programas asignados',
                valor: programas.isNotEmpty ? programas.join(', ') : 'Docente institucional',
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton.tonal(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cerrar previsualización'),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _previsualizarCuenta(Map<String, dynamic> user) {
    final nombre = user['fullName'] ?? 'Sin nombre';
    final email = user['email'] ?? 'Sin correo';
    final role = user['role'] ?? 'PROFESSOR';
    final id = user['id'] ?? user['_id'] ?? '';
    final programas = (user['programas'] as List?)?.map((e) => e.toString()).toList() ?? [];

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        return Container(
          decoration: BoxDecoration(
            color: ctx.palette.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          ),
          padding: const EdgeInsets.all(AppSpacing.page),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: ctx.palette.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Text('Detalle de Cuenta', style: AppType.h3),
              const SizedBox(height: 12),
              _FichaCampo(label: 'Nombre completo', valor: nombre.toString()),
              _FichaCampo(label: 'Correo electrónico', valor: email.toString()),
              _FichaCampo(label: 'Rol asignado', valor: role.toString()),
              _FichaCampo(
                label: 'Programas de alcance',
                valor: programas.isNotEmpty ? programas.join(', ') : 'Alcance total o sin restricción',
              ),
              _FichaCampo(label: 'Identificador único', valor: id.toString()),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton.tonal(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cerrar'),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = ref.watch(authControllerProvider).user?.role == 'ADMIN';
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final muted = isDark ? AppColors.textMutedDark : AppColors.textMuted;

    if (!isAdmin) {
      return Scaffold(
        appBar: AppBar(title: const Text('Acceso Restringido')),
        body: Center(
          child: StateView.error('Esta sección es exclusiva para administradores del sistema.'),
        ),
      );
    }

    // Filtrado de profesores
    final pTerm = _profQuery.trim().toLowerCase();
    final profsFiltrados = _professors.where((p) {
      if (pTerm.isEmpty) return true;
      final nom = '${p['nombres'] ?? ''} ${p['apellidos'] ?? ''}'.toLowerCase();
      final ced = (p['cedula'] ?? '').toString().toLowerCase();
      final userObj = p['userId'] is Map ? p['userId'] as Map : {};
      final em = (userObj['email'] ?? '').toString().toLowerCase();
      return nom.contains(pTerm) || ced.contains(pTerm) || em.contains(pTerm);
    }).toList();

    // Filtrado de cuentas
    final aTerm = _accQuery.trim().toLowerCase();
    final usersFiltrados = _users.where((u) {
      if (_selectedRole != null && u['role'] != _selectedRole) return false;
      if (aTerm.isEmpty) return true;
      final nom = (u['fullName'] ?? '').toString().toLowerCase();
      final em = (u['email'] ?? '').toString().toLowerCase();
      return nom.contains(aTerm) || em.contains(aTerm);
    }).toList();

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Supervisión Admin'),
            Text(
              'Cuentas y Docentes · Modo Admin',
              style: AppType.caption.copyWith(color: AppColors.primary, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        actions: const [SessionMenuButton()],
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(text: 'Docentes (${profsFiltrados.length})'),
            Tab(text: 'Cuentas (${usersFiltrados.length})'),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: StateView.error(
                    _error!,
                    action: FilledButton(onPressed: _cargarDatos, child: const Text('Reintentar')),
                  ),
                )
              : TabBarView(
                  controller: _tabController,
                  children: [
                    // Pestaña Docentes
                    RefreshIndicator(
                      onRefresh: _cargarDatos,
                      child: Column(
                        children: [
                          Padding(
                            padding: const EdgeInsets.all(AppSpacing.gapSm),
                            child: DebouncedSearchField(
                              controller: _profSearch,
                              labelText: 'Buscar docente por nombre o cédula…',
                              onChanged: (val) => setState(() => _profQuery = val),
                            ),
                          ),
                          Expanded(
                            child: profsFiltrados.isEmpty
                                ? ListView(
                                    children: [
                                      const SizedBox(height: 40),
                                      StateView.empty('No se encontraron profesores registrados.'),
                                    ],
                                  )
                                : ListView.builder(
                                    padding: AppSpacing.listPadding,
                                    itemCount: profsFiltrados.length,
                                    itemBuilder: (ctx, i) {
                                      final doc = profsFiltrados[i];
                                      final nombres = '${doc['nombres'] ?? ''} ${doc['apellidos'] ?? ''}'.trim();
                                      final userObj = doc['userId'] is Map ? doc['userId'] as Map : {};
                                      final email = userObj['email'] ?? 'Sin correo';
                                      final estado = doc['estado'] ?? 'ACTIVO';
                                      final cedula = doc['cedula'] ?? '';

                                      return AppCard(
                                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                        child: ListTile(
                                          contentPadding: EdgeInsets.zero,
                                          leading: CircleAvatar(
                                            backgroundColor: AppColors.primarySoft,
                                            child: Text(
                                              nombres.isNotEmpty ? nombres[0].toUpperCase() : 'D',
                                              style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.bold),
                                            ),
                                          ),
                                          title: Text(nombres, style: AppType.bodyStrong),
                                          subtitle: Text('$cedula · $email', style: AppType.caption.copyWith(color: muted)),
                                          trailing: Chip(
                                            label: Text(estado.toString(), style: const TextStyle(fontSize: 10)),
                                            backgroundColor: estado == 'APROBADO' ? AppColors.primarySoft : Colors.amber.shade100,
                                          ),
                                          onTap: () => _previsualizarDocente(doc),
                                        ),
                                      );
                                    },
                                  ),
                          ),
                        ],
                      ),
                    ),

                    // Pestaña Cuentas
                    RefreshIndicator(
                      onRefresh: _cargarDatos,
                      child: Column(
                        children: [
                          Padding(
                            padding: const EdgeInsets.fromLTRB(AppSpacing.gapSm, AppSpacing.gapSm, AppSpacing.gapSm, 0),
                            child: DebouncedSearchField(
                              controller: _accSearch,
                              labelText: 'Buscar cuenta por nombre o correo…',
                              onChanged: (val) => setState(() => _accQuery = val),
                            ),
                          ),
                          SingleChildScrollView(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.gapSm, vertical: 6),
                            child: Row(
                              children: [
                                null,
                                'ADMIN',
                                'COORDINATOR',
                                'PROFESSOR',
                                'SECRETARY',
                                'STUDENT',
                              ].map((r) {
                                final isSelected = _selectedRole == r;
                                return Padding(
                                  padding: const EdgeInsets.only(right: 6),
                                  child: FilterChip(
                                    label: Text(r ?? 'Todos'),
                                    selected: isSelected,
                                    onSelected: (_) => setState(() => _selectedRole = r),
                                  ),
                                );
                              }).toList(),
                            ),
                          ),
                          Expanded(
                            child: usersFiltrados.isEmpty
                                ? ListView(
                                    children: [
                                      const SizedBox(height: 40),
                                      StateView.empty('No se encontraron cuentas con ese criterio.'),
                                    ],
                                  )
                                : ListView.builder(
                                    padding: AppSpacing.listPadding,
                                    itemCount: usersFiltrados.length,
                                    itemBuilder: (ctx, i) {
                                      final u = usersFiltrados[i];
                                      final nombre = u['fullName'] ?? 'Sin nombre';
                                      final email = u['email'] ?? '';
                                      final role = u['role'] ?? 'PROFESSOR';

                                      return AppCard(
                                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                                        child: ListTile(
                                          contentPadding: EdgeInsets.zero,
                                          leading: CircleAvatar(
                                            backgroundColor: Colors.grey.shade200,
                                            child: Icon(Icons.person, color: Colors.grey.shade700),
                                          ),
                                          title: Text(nombre.toString(), style: AppType.bodyStrong),
                                          subtitle: Text(email.toString(), style: AppType.caption.copyWith(color: muted)),
                                          trailing: Chip(
                                            label: Text(role.toString(), style: const TextStyle(fontSize: 10)),
                                            backgroundColor: role == 'ADMIN'
                                                ? Colors.red.shade100
                                                : role == 'COORDINATOR'
                                                    ? Colors.blue.shade100
                                                    : AppColors.primarySoft,
                                          ),
                                          onTap: () => _previsualizarCuenta(u),
                                        ),
                                      );
                                    },
                                  ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
    );
  }
}

class _FichaCampo extends StatelessWidget {
  final String label;
  final String valor;

  const _FichaCampo({required this.label, required this.valor});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: AppType.caption.copyWith(color: AppColors.textMuted)),
          const SizedBox(height: 2),
          Text(valor, style: AppType.body),
        ],
      ),
    );
  }
}
