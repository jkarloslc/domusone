// Credenciales del PAC (Facturama) leídas de cfg.configuracion.
// Son obligatorias: si falta alguna no se timbra, cancela ni descarga contra
// ningún ambiente. Antes se caía en silencio al sandbox con credenciales de
// prueba, y eso generaba CFDIs sin validez fiscal sin avisar a nadie.
const CLAVES = ['pac_url', 'pac_user', 'pac_pass'] as const

export function credencialesPac(cfg: Record<string, string>) {
  const faltan = CLAVES.filter(k => !(cfg[k] ?? '').trim())
  if (faltan.length) {
    throw new Error(
      `Facturación no configurada: falta ${faltan.join(', ')} en la configuración del sistema. ` +
      'Captura los datos del proveedor de timbrado antes de facturar.'
    )
  }
  return {
    // Sin diagonal final, para no armar URLs dobles como '.mx//3/cfdis'
    url:  cfg.pac_url.trim().replace(/\/+$/, ''),
    user: cfg.pac_user,
    pass: cfg.pac_pass,
  }
}
