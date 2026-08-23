import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

const menuPreferenceVersion = 1;
const menuPrimaryCount = 4;

class MenuPreference {
  final int version;
  final List<String> orderedRoutes;

  const MenuPreference({
    this.version = menuPreferenceVersion,
    required this.orderedRoutes,
  });

  Map<String, Object> toJson() => {
    'version': version,
    'orderedRoutes': orderedRoutes,
  };

  static MenuPreference? tryParse(String? raw) {
    if (raw == null) return null;
    try {
      final json = jsonDecode(raw);
      if (json is! Map<String, dynamic> ||
          json['version'] != menuPreferenceVersion ||
          json['orderedRoutes'] is! List) {
        return null;
      }
      final routes = (json['orderedRoutes'] as List).whereType<String>().toList(
        growable: false,
      );
      return MenuPreference(orderedRoutes: routes);
    } catch (_) {
      return null;
    }
  }
}

/// Repairs persisted menu data against the destinations available right now.
/// Unknown, duplicated and unauthorized routes are discarded. New routes are
/// appended in their canonical order so an old preference never hides them.
List<String> reconcileMenuRoutes({
  required Iterable<String> savedRoutes,
  required List<String> authorizedRoutes,
}) {
  final authorized = authorizedRoutes.toSet();
  final seen = <String>{};
  final result = <String>[];

  for (final route in savedRoutes) {
    if (authorized.contains(route) && seen.add(route)) result.add(route);
  }
  for (final route in authorizedRoutes) {
    if (seen.add(route)) result.add(route);
  }
  return result;
}

class MenuPreferencesRepository {
  static const _prefix = 'menu_order.v1.';

  Future<List<String>> load({
    required String userId,
    required List<String> authorizedRoutes,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final parsed = MenuPreference.tryParse(prefs.getString('$_prefix$userId'));
    return reconcileMenuRoutes(
      savedRoutes: parsed?.orderedRoutes ?? const [],
      authorizedRoutes: authorizedRoutes,
    );
  }

  Future<void> save({
    required String userId,
    required List<String> orderedRoutes,
    required List<String> authorizedRoutes,
  }) async {
    final repaired = reconcileMenuRoutes(
      savedRoutes: orderedRoutes,
      authorizedRoutes: authorizedRoutes,
    );
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      '$_prefix$userId',
      jsonEncode(MenuPreference(orderedRoutes: repaired).toJson()),
    );
  }
}
