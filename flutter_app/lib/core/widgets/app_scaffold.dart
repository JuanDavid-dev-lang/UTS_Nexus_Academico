import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class AppScaffold extends StatelessWidget {
  final Widget child;
  const AppScaffold({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          if (MediaQuery.of(context).size.width > 900)
            NavigationRail(
              selectedIndex: 0,
              onDestinationSelected: (i) {
                switch (i) {
                  case 0:
                    context.go('/');
                    break;
                  case 1:
                    context.go('/students');
                    break;
                  case 2:
                    context.go('/subjects');
                    break;
                  case 3:
                    context.go('/attendance');
                    break;
                  case 4:
                    context.go('/schedule');
                    break;
                  case 5:
                    context.go('/reports');
                    break;
                  case 6:
                    context.go('/notifications');
                    break;
                  case 7:
                    context.go('/settings');
                    break;
                  case 8:
                    context.go('/grades');
                    break;
                }
              },
              labelType: NavigationRailLabelType.all,
              destinations: const [
                NavigationRailDestination(icon: Icon(Icons.dashboard), label: Text('Inicio')),
                NavigationRailDestination(icon: Icon(Icons.people), label: Text('Estudiantes')),
                NavigationRailDestination(icon: Icon(Icons.menu_book), label: Text('Materias')),
                NavigationRailDestination(icon: Icon(Icons.fact_check), label: Text('Asistencia')),
                NavigationRailDestination(icon: Icon(Icons.schedule), label: Text('Horario')),
                NavigationRailDestination(icon: Icon(Icons.description), label: Text('Reportes')),
                NavigationRailDestination(icon: Icon(Icons.notifications), label: Text('Alertas')),
                NavigationRailDestination(icon: Icon(Icons.settings), label: Text('Ajustes')),
                NavigationRailDestination(icon: Icon(Icons.grade), label: Text('Notas')),
              ],
            ),
          Expanded(child: child),
        ],
      ),
      bottomNavigationBar: MediaQuery.of(context).size.width <= 900
          ? NavigationBar(
              selectedIndex: 0,
              onDestinationSelected: (i) {
                switch (i) {
                  case 0:
                    context.go('/');
                    break;
                  case 1:
                    context.go('/students');
                    break;
                  case 2:
                    context.go('/subjects');
                    break;
                  case 3:
                    context.go('/attendance');
                    break;
                  case 4:
                    context.go('/schedule');
                    break;
                  case 5:
                    context.go('/reports');
                    break;
                  case 6:
                    context.go('/notifications');
                    break;
                  case 7:
                    context.go('/settings');
                    break;
                  case 8:
                    context.go('/grades');
                    break;
                }
              },
              destinations: const [
                NavigationDestination(icon: Icon(Icons.dashboard), label: 'Inicio'),
                NavigationDestination(icon: Icon(Icons.people), label: 'Estudiantes'),
                NavigationDestination(icon: Icon(Icons.menu_book), label: 'Materias'),
                NavigationDestination(icon: Icon(Icons.fact_check), label: 'Asistencia'),
                NavigationDestination(icon: Icon(Icons.schedule), label: 'Horario'),
                NavigationDestination(icon: Icon(Icons.description), label: 'Reportes'),
                NavigationDestination(icon: Icon(Icons.notifications), label: 'Alertas'),
                NavigationDestination(icon: Icon(Icons.settings), label: 'Ajustes'),
                NavigationDestination(icon: Icon(Icons.grade), label: 'Notas'),
              ],
            )
          : null,
    );
  }
}
