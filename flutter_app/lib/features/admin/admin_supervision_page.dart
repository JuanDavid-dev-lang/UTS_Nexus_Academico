import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/data/models.dart';
import '../auth/data/registro_service.dart';
import '../../core/data/providers.dart';
import '../../core/widgets/lista_progresiva.dart';
import '../../core/theme/app_theme.dart';
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
  ConsumerState<AdminSupervisionPage> createState() =>
      _AdminSupervisionPageState();
}

/// Cuántos por página. Llena de sobra una pantalla de teléfono, así que la
/// segunda se pide con el dedo ya en movimiento.
const int _porPagina = 30;

/// Acumulado y estado de paginación de una de las dos listas.
class _EstadoLista {
  List<Map<String, dynamic>> items = [];
  int total = 0;
  bool hayMas = false;
  bool cargandoMas = false;
  String? errorAlCargarMas;
  int pagina = 1;

  void reemplazar(PaginaDe<Map<String, dynamic>> p) {
    items = p.items;
    total = p.total;
    hayMas = p.hasMore;
    cargandoMas = false;
    errorAlCargarMas = null;
    pagina = 1;
  }

  void anadir(PaginaDe<Map<String, dynamic>> p) {
    items = [...items, ...p.items];
    total = p.total;
    hayMas = p.hasMore;
    cargandoMas = false;
    errorAlCargarMas = null;
    pagina += 1;
  }
}

class _AdminSupervisionPageState extends ConsumerState<AdminSupervisionPage>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _profSearch = TextEditingController();
  final _accSearch = TextEditingController();

  String _profQuery = '';
  String _accQuery = '';
  String? _selectedRole;

  /// Universidad por la que se acota, o `null` para todas.
  ///
  /// Es el slug (`uts`), no el `_id`: es lo que acepta la API y lo que se lee
  /// en una URL. Se carga del catálogo público de registro, que ya devuelve las
  /// activas y no exige un endpoint nuevo.
  String? _institucion;
  List<InstitucionOpcion> _instituciones = const [];

  bool _loading = false;
  String? _error;

  /// Estado de paginación de cada pestaña.
  ///
  /// Se guarda aquí y no en un provider porque esta pantalla es de estado
  /// local: el término, la pestaña activa y el rol seleccionado ya lo eran.
  final _docentes = _EstadoLista();
  final _cuentas = _EstadoLista();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _cargarDatos();
  }

  /// Vuelve a la primera página de docentes con el término actual.
  ///
  /// La búsqueda va al servidor. Filtrar en memoria —como hacía esta pantalla—
  /// solo funciona mientras lo descargado sea *toda* la lista: en cuanto se
  /// pagina, quien esté más allá del tope deja de existir para la búsqueda y
  /// nada lo indica.
  Future<void> _recargarDocentes() async {
    setState(() => _docentes.cargandoMas = true);
    try {
      final p = await ref
          .read(academicRepositoryProvider)
          .listProfessorsPagina(
            query: _profQuery,
            institutionId: _institucion,
            limit: _porPagina,
          );
      if (mounted) setState(() => _docentes.reemplazar(p));
    } catch (e) {
      if (mounted) {
        setState(() {
          _docentes.cargandoMas = false;
          _docentes.errorAlCargarMas = e.toString();
        });
      }
    }
  }

  Future<void> _recargarCuentas() async {
    setState(() => _cuentas.cargandoMas = true);
    try {
      final p = await ref
          .read(academicRepositoryProvider)
          .listUsersPagina(
            query: _accQuery,
            role: _selectedRole,
            institutionId: _institucion,
            limit: _porPagina,
          );
      if (mounted) setState(() => _cuentas.reemplazar(p));
    } catch (e) {
      if (mounted) {
        setState(() {
          _cuentas.cargandoMas = false;
          _cuentas.errorAlCargarMas = e.toString();
        });
      }
    }
  }

  /// Trae la página siguiente. La guarda contra solapadas está en
  /// `ListaProgresiva`, pero se repite aquí: el botón de reintentar también
  /// llama, y dos caminos hacia la misma petición son dos formas de duplicarla.
  Future<void> _masDocentes() async {
    if (_docentes.cargandoMas || !_docentes.hayMas) return;
    setState(() {
      _docentes.cargandoMas = true;
      _docentes.errorAlCargarMas = null;
    });
    try {
      final p = await ref
          .read(academicRepositoryProvider)
          .listProfessorsPagina(
            query: _profQuery,
            institutionId: _institucion,
            page: _docentes.pagina + 1,
            limit: _porPagina,
          );
      if (mounted) setState(() => _docentes.anadir(p));
    } catch (e) {
      // Lo ya cargado sigue siendo válido: vaciarlo por un fallo al final es
      // perder lo que sí funcionaba.
      if (mounted) {
        setState(() {
          _docentes.cargandoMas = false;
          _docentes.errorAlCargarMas = e.toString();
        });
      }
    }
  }

  Future<void> _masCuentas() async {
    if (_cuentas.cargandoMas || !_cuentas.hayMas) return;
    setState(() {
      _cuentas.cargandoMas = true;
      _cuentas.errorAlCargarMas = null;
    });
    try {
      final p = await ref
          .read(academicRepositoryProvider)
          .listUsersPagina(
            query: _accQuery,
            role: _selectedRole,
            institutionId: _institucion,
            page: _cuentas.pagina + 1,
            limit: _porPagina,
          );
      if (mounted) setState(() => _cuentas.anadir(p));
    } catch (e) {
      if (mounted) {
        setState(() {
          _cuentas.cargandoMas = false;
          _cuentas.errorAlCargarMas = e.toString();
        });
      }
    }
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
        repo.listProfessorsPagina(
          query: _profQuery,
          institutionId: _institucion,
          limit: _porPagina,
        ),
        repo.listUsersPagina(
          query: _accQuery,
          role: _selectedRole,
          institutionId: _institucion,
          limit: _porPagina,
        ),
      ]);

      // El catálogo se pide aparte y sin bloquear: si falla, la pantalla
      // funciona igual y solo se queda sin el selector de universidad.
      unawaited(
        RegistroService()
            .catalogo()
            .then((c) {
              if (mounted) setState(() => _instituciones = c.instituciones);
            })
            .catchError((_) {}),
      );

      if (mounted) {
        setState(() {
          _docentes.reemplazar(results[0]);
          _cuentas.reemplazar(results[1]);
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
    final programas =
        (doc['programas'] as List?)?.map((e) => e.toString()).toList() ?? [];

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
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(nombres, style: AppType.bodyStrong),
                        Text(
                          email,
                          style: AppType.caption.copyWith(
                            color: AppColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Chip(
                    label: Text(
                      estado.toString(),
                      style: const TextStyle(fontSize: 11),
                    ),
                    backgroundColor: estado == 'APROBADO'
                        ? AppColors.primarySoft
                        : Colors.amber.shade100,
                  ),
                ],
              ),
              const Divider(height: 24),
              _FichaCampo(
                label: 'Cédula / Documento',
                valor: cedula.toString(),
              ),
              _FichaCampo(
                label: 'Director de Trabajo de Grado',
                valor: esDirector ? 'Sí (Habilitado)' : 'No',
              ),
              _FichaCampo(
                label: 'Programas asignados',
                valor: programas.isNotEmpty
                    ? programas.join(', ')
                    : 'Docente institucional',
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
    final programas =
        (user['programas'] as List?)?.map((e) => e.toString()).toList() ?? [];

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
                valor: programas.isNotEmpty
                    ? programas.join(', ')
                    : 'Alcance total o sin restricción',
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
          child: StateView.error(
            'Esta sección es exclusiva para administradores del sistema.',
          ),
        ),
      );
    }

    // El filtrado lo hace el servidor (`?q=` y `?role=`). Filtrar aquí solo
    // alcanzaría a las páginas ya descargadas, así que quien esté más allá del
    // tope dejaría de existir para la búsqueda sin que nada lo indique.
    final profsFiltrados = _docentes.items;
    final usersFiltrados = _cuentas.items;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Supervisión Admin'),
            Text(
              'Cuentas y Docentes · Modo Admin',
              style: AppType.caption.copyWith(
                color: AppColors.primary,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        actions: const [SessionMenuButton()],
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            // El total del servidor, no el de lo descargado: con paginación,
            // contar lo cargado diría «30» sobre trescientos.
            Tab(text: 'Docentes (${_docentes.total})'),
            Tab(text: 'Cuentas (${_cuentas.total})'),
          ],
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(
              child: StateView.error(
                _error!,
                action: FilledButton(
                  onPressed: _cargarDatos,
                  child: const Text('Reintentar'),
                ),
              ),
            )
          : Column(
              children: [
                // El selector de universidad va FUERA de las pestañas: acota
                // las dos a la vez, y repetirlo dentro de cada una obligaría
                // a mantener dos estados que siempre tienen que coincidir.
                //
                // Solo aparece con más de una: con una sola es un
                // desplegable que no filtra nada.
                if (_instituciones.length > 1)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.gapSm,
                      AppSpacing.gapSm,
                      AppSpacing.gapSm,
                      0,
                    ),
                    child: DropdownButtonFormField<String?>(
                      initialValue: _institucion,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Institución',
                        isDense: true,
                      ),
                      items: [
                        const DropdownMenuItem<String?>(
                          value: null,
                          child: Text('Todas las instituciones'),
                        ),
                        ..._instituciones.map(
                          (i) => DropdownMenuItem<String?>(
                            value: i.institutionId,
                            child: Text(
                              i.nombre,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                      ],
                      onChanged: (valor) {
                        setState(() => _institucion = valor);
                        // Acota las dos listas, así que se recargan las dos:
                        // dejar una sin recargar deja la pestaña de al lado
                        // mostrando otra universidad.
                        _recargarDocentes();
                        _recargarCuentas();
                      },
                    ),
                  ),
                Expanded(
                  child: TabBarView(
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
                                labelText:
                                    'Buscar docente por nombre, cédula o correo…',
                                onChanged: (val) {
                                  setState(() => _profQuery = val);
                                  _recargarDocentes();
                                },
                              ),
                            ),
                            Expanded(
                              child: profsFiltrados.isEmpty
                                  ? ListView(
                                      children: [
                                        const SizedBox(height: 40),
                                        StateView.empty(
                                          'No se encontraron profesores registrados.',
                                        ),
                                      ],
                                    )
                                  : ListaProgresiva<Map<String, dynamic>>(
                                      padding: AppSpacing.listPadding,
                                      items: profsFiltrados,
                                      hayMas: _docentes.hayMas,
                                      cargandoMas: _docentes.cargandoMas,
                                      errorAlCargarMas:
                                          _docentes.errorAlCargarMas,
                                      onCargarMas: _masDocentes,
                                      separador: (_, __) =>
                                          const SizedBox.shrink(),
                                      constructor: (ctx, doc, i) {
                                        final nombres =
                                            '${doc['nombres'] ?? ''} ${doc['apellidos'] ?? ''}'
                                                .trim();
                                        final userObj = doc['userId'] is Map
                                            ? doc['userId'] as Map
                                            : {};
                                        final email =
                                            userObj['email'] ?? 'Sin correo';
                                        final estado =
                                            doc['estado'] ?? 'ACTIVO';
                                        final cedula = doc['cedula'] ?? '';

                                        return AppCard(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 12,
                                            vertical: 8,
                                          ),
                                          child: ListTile(
                                            contentPadding: EdgeInsets.zero,
                                            leading: CircleAvatar(
                                              backgroundColor:
                                                  AppColors.primarySoft,
                                              child: Text(
                                                nombres.isNotEmpty
                                                    ? nombres[0].toUpperCase()
                                                    : 'D',
                                                style: TextStyle(
                                                  color: AppColors.primary,
                                                  fontWeight: FontWeight.bold,
                                                ),
                                              ),
                                            ),
                                            title: Text(
                                              nombres,
                                              style: AppType.bodyStrong,
                                            ),
                                            subtitle: Text(
                                              '$cedula · $email',
                                              style: AppType.caption.copyWith(
                                                color: muted,
                                              ),
                                            ),
                                            trailing: Chip(
                                              label: Text(
                                                estado.toString(),
                                                style: const TextStyle(
                                                  fontSize: 10,
                                                ),
                                              ),
                                              backgroundColor:
                                                  estado == 'APROBADO'
                                                  ? AppColors.primarySoft
                                                  : Colors.amber.shade100,
                                            ),
                                            onTap: () =>
                                                _previsualizarDocente(doc),
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
                              padding: const EdgeInsets.fromLTRB(
                                AppSpacing.gapSm,
                                AppSpacing.gapSm,
                                AppSpacing.gapSm,
                                0,
                              ),
                              child: DebouncedSearchField(
                                controller: _accSearch,
                                labelText: 'Buscar cuenta por nombre o correo…',
                                onChanged: (val) {
                                  setState(() => _accQuery = val);
                                  _recargarCuentas();
                                },
                              ),
                            ),
                            SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              padding: const EdgeInsets.symmetric(
                                horizontal: AppSpacing.gapSm,
                                vertical: 6,
                              ),
                              child: Row(
                                children:
                                    [
                                      null,
                                      'ADMIN',
                                      'COORDINATOR',
                                      'PROFESSOR',
                                      'SECRETARY',
                                      'STUDENT',
                                    ].map((r) {
                                      final isSelected = _selectedRole == r;
                                      return Padding(
                                        padding: const EdgeInsets.only(
                                          right: 6,
                                        ),
                                        child: FilterChip(
                                          label: Text(r ?? 'Todos'),
                                          selected: isSelected,
                                          onSelected: (_) {
                                            setState(() => _selectedRole = r);
                                            // El rol también acota en el servidor:
                                            // filtrarlo aquí sobre páginas dejaría
                                            // fuera a quien no se hubiera descargado.
                                            _recargarCuentas();
                                          },
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
                                        StateView.empty(
                                          'No se encontraron cuentas con ese criterio.',
                                        ),
                                      ],
                                    )
                                  : ListaProgresiva<Map<String, dynamic>>(
                                      padding: AppSpacing.listPadding,
                                      items: usersFiltrados,
                                      hayMas: _cuentas.hayMas,
                                      cargandoMas: _cuentas.cargandoMas,
                                      errorAlCargarMas:
                                          _cuentas.errorAlCargarMas,
                                      onCargarMas: _masCuentas,
                                      separador: (_, __) =>
                                          const SizedBox.shrink(),
                                      constructor: (ctx, u, i) {
                                        final nombre =
                                            u['fullName'] ?? 'Sin nombre';
                                        final email = u['email'] ?? '';
                                        final role = u['role'] ?? 'PROFESSOR';

                                        return AppCard(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 12,
                                            vertical: 8,
                                          ),
                                          child: ListTile(
                                            contentPadding: EdgeInsets.zero,
                                            leading: CircleAvatar(
                                              backgroundColor:
                                                  Colors.grey.shade200,
                                              child: Icon(
                                                Icons.person,
                                                color: Colors.grey.shade700,
                                              ),
                                            ),
                                            title: Text(
                                              nombre.toString(),
                                              style: AppType.bodyStrong,
                                            ),
                                            subtitle: Text(
                                              email.toString(),
                                              style: AppType.caption.copyWith(
                                                color: muted,
                                              ),
                                            ),
                                            trailing: Chip(
                                              label: Text(
                                                role.toString(),
                                                style: const TextStyle(
                                                  fontSize: 10,
                                                ),
                                              ),
                                              backgroundColor: role == 'ADMIN'
                                                  ? Colors.red.shade100
                                                  : role == 'COORDINATOR'
                                                  ? Colors.blue.shade100
                                                  : AppColors.primarySoft,
                                            ),
                                            onTap: () =>
                                                _previsualizarCuenta(u),
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
          Text(
            label,
            style: AppType.caption.copyWith(color: AppColors.textMuted),
          ),
          const SizedBox(height: 2),
          Text(valor, style: AppType.body),
        ],
      ),
    );
  }
}
