/// Easter egg del acceso: a Rubri se le puede tocar, pero no tanto. Con cada
/// toque reacciona un poco más y al decimoquinto se desmaya; al rato se
/// levanta solo. Una pausa larga entre toques lo deja como nuevo: lo que lo
/// marea es la insistencia, no el total del día. Mismas reglas que el
/// escritorio (`desktop/src/domain/rubri/desmayo.ts`).
library;

const toquesParaDesmayo = 15;
const pausaQueReinicia = Duration(seconds: 3);
const duracionDesmayo = Duration(seconds: 5);

enum FaseRubri { normal, molesto, mareado, desmayado }

class ConteoDeToques {
  const ConteoDeToques(this.toques, this.ultimo);

  static const vacio = ConteoDeToques(0, null);

  final int toques;
  final DateTime? ultimo;
}

/// Suma un toque, o empieza de cero si el anterior fue hace demasiado.
ConteoDeToques registrarToque(ConteoDeToques conteo, DateTime ahora) {
  final ultimo = conteo.ultimo;
  final seguido =
      ultimo != null && ahora.difference(ultimo) <= pausaQueReinicia;
  final base = seguido ? conteo.toques : 0;
  final toques = base + 1 > toquesParaDesmayo ? toquesParaDesmayo : base + 1;
  return ConteoDeToques(toques, ahora);
}

FaseRubri faseDe(int toques) {
  if (toques >= toquesParaDesmayo) return FaseRubri.desmayado;
  if (toques >= 11) return FaseRubri.mareado;
  if (toques >= 6) return FaseRubri.molesto;
  return FaseRubri.normal;
}
