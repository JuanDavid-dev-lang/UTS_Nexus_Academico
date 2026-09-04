import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/features/auth/data/registro_service.dart';

void main() {
  group('InstitucionOpcion.fromJson', () {
    test('parsea id, institutionId, nombre y sigla', () {
      final opcion = InstitucionOpcion.fromJson(const {
        'id': '65f0a1b2c3d4e5f6a7b8c9d0',
        'institutionId': 'uts',
        'nombre': 'Unidades Tecnológicas de Santander',
        'sigla': 'UTS',
      });

      expect(opcion.id, '65f0a1b2c3d4e5f6a7b8c9d0');
      expect(opcion.institutionId, 'uts');
      expect(opcion.nombre, 'Unidades Tecnológicas de Santander');
      expect(opcion.sigla, 'UTS');
    });

    test('tolera campos ausentes devolviendo cadenas vacías', () {
      final opcion = InstitucionOpcion.fromJson(const {});

      expect(opcion.id, '');
      expect(opcion.institutionId, '');
      expect(opcion.nombre, '');
      expect(opcion.sigla, '');
    });
  });

  group('Catalogo.fromJson', () {
    test('parsea instituciones cuando el backend las manda', () {
      final catalogo = Catalogo.fromJson(const {
        'abierto': true,
        'sedes': [
          {'id': 'BUCARAMANGA', 'nombre': 'Bucaramanga'},
        ],
        'facultades': [
          {'id': 'FAC_ING', 'nombre': 'Facultad de Ingenierías'},
        ],
        'niveles': [
          {'id': 'TECNOLOGICO', 'nombre': 'Tecnológico'},
        ],
        'programas': [],
        'instituciones': [
          {
            'id': '1',
            'institutionId': 'uts',
            'nombre': 'Unidades Tecnológicas de Santander',
            'sigla': 'UTS',
          },
          {
            'id': '2',
            'institutionId': 'uis',
            'nombre': 'Universidad Industrial de Santander',
            'sigla': 'UIS',
          },
        ],
      });

      expect(catalogo.abierto, isTrue);
      expect(catalogo.instituciones, hasLength(2));
      expect(catalogo.instituciones.first.institutionId, 'uts');
      expect(catalogo.instituciones.last.sigla, 'UIS');
    });

    test('devuelve instituciones vacías cuando el backend no manda el campo', () {
      final catalogo = Catalogo.fromJson(const {
        'abierto': true,
        'sedes': <Map<String, dynamic>>[],
        'facultades': <Map<String, dynamic>>[],
        'niveles': <Map<String, dynamic>>[],
        'programas': <Map<String, dynamic>>[],
      });

      expect(catalogo.instituciones, isEmpty);
    });

    test('el constructor por defecto también deja instituciones vacías', () {
      const catalogo = Catalogo(
        abierto: true,
        sedes: [],
        facultades: [],
        niveles: [],
        programas: [],
      );

      expect(catalogo.instituciones, isEmpty);
    });
  });
}
