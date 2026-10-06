import 'package:flutter_test/flutter_test.dart';
import 'package:uts_academico/core/data/etiqueta_grupo.dart';

void main() {
  test('antepone «Grupo» a un código de grupo', () {
    expect(etiquetaGrupo('A194'), 'Grupo A194');
  });

  test('no repite «Grupo» si el nombre ya lo lleva', () {
    expect(etiquetaGrupo('Grupo A'), 'Grupo A');
    expect(etiquetaGrupo('grupo b'), 'grupo b');
  });
}
