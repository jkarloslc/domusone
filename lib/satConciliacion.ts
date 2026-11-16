// Conciliación CFDI recibidos (ctrl.cfdi_sat) ↔ Órdenes de Pago (comp.ordenes_pago).
// Solo servidor. Reglas, de la más fuerte a la más débil:
//   1. uuid  — el UUID del XML subido a la OP (o capturado como folio) es el del CFDI → confirmado.
//   2. folio — mismo RFC emisor = RFC del proveedor y el folio coincide;
//              confirmado si el total cuadra (±$1 o 0.5 %), si no queda como sugerencia.
//   3. monto — mismo RFC, total ±$1, fecha razonable y candidato único en ambos lados → sugerencia.
// Los pares descartados por el usuario no se vuelven a sugerir.
import 'server-only'
import { SupabaseClient } from '@supabase/supabase-js'

const RE_UUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i
const RE_UUID_XML = /UUID\s*=\s*"([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})"/
const STATUS_EXCLUIDOS = new Set(['Cancelada', 'Rechazada'])

const alnum  = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').replace(/^0+/, '')
const cuadra = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * 0.005)

function folioCoincide(opFolio: string | null, serie: string | null, folio: string | null) {
  if (!opFolio || !folio) return false
  const o = alnum(opFolio).replace(/^0+/, ''), f = alnum(folio).replace(/^0+/, ''), sf = alnum(serie) + alnum(folio)
  if (o && (o === f || o === sf || o === sf.replace(/^0+/, ''))) return true
  const dOp = digits(opFolio), dF = digits(folio)
  return dF.length >= 3 && dOp === dF
}

const diasEntre = (a: string, b: string) => (new Date(a).getTime() - new Date(b).getTime()) / 86400000

async function todos<T>(q: (desde: number, hasta: number) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const out: T[] = []
  for (let d = 0; ; d += 1000) {
    const { data, error } = await q(d, d + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return out
}

/** Lee el UUID del XML que se subió a cada OP (una sola vez; '' = ya revisado sin UUID). */
export async function llenarUuidOps(db: SupabaseClient, presupuestoMs: number) {
  const t0 = Date.now()
  const comp = () => db.schema('comp' as any).from('ordenes_pago')
  const ops = await todos<any>((a, b) => comp().select('id, folio_factura, xml_factura')
    .is('uuid_factura', null).or('xml_factura.not.is.null,folio_factura.not.is.null').order('id').range(a, b))
  let leidos = 0, pendientes = 0
  const cola = [...ops]
  const trabajar = async () => {
    while (cola.length) {
      if (Date.now() - t0 > presupuestoMs) { pendientes = cola.length; cola.length = 0; return }
      const op = cola.shift()
      let uuid = ''
      if (RE_UUID.test((op.folio_factura ?? '').trim())) uuid = op.folio_factura.trim().toUpperCase()
      else if (/^https?:\/\//.test(op.xml_factura ?? '')) {
        try {
          const r = await fetch(op.xml_factura, { signal: AbortSignal.timeout(8000) })
          if (r.ok) uuid = (RE_UUID_XML.exec(await r.text())?.[1] ?? '').toUpperCase()
        } catch { continue }   // error de red: se reintenta en la siguiente conciliación
      }
      const { error } = await comp().update({ uuid_factura: uuid }).eq('id', op.id)
      if (!error) leidos++
    }
  }
  await Promise.all(Array.from({ length: 8 }, trabajar))
  return { leidos, pendientes }
}

export async function conciliar(db: SupabaseClient, desde: string, hasta: string, userId: string) {
  const ctrl = () => db.schema('ctrl' as any)
  const finExcl = new Date(new Date(hasta + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)

  const cfdis = await todos<any>((a, b) => ctrl().from('cfdi_sat')
    .select('uuid, serie, folio, fecha_emision, rfc_emisor, total, estatus_sat')
    .eq('tipo_descarga', 'recibido').eq('tipo_comprobante', 'I')
    .gte('fecha_emision', desde).lt('fecha_emision', finExcl).order('uuid').range(a, b))
  if (!cfdis.length) return { cfdis: 0, nuevos: 0, sugeridos: 0 }

  const ops = (await todos<any>((a, b) => db.schema('comp' as any).from('ordenes_pago')
    .select('id, status, monto, folio_factura, fecha_factura, fecha_op, uuid_factura, proveedores:id_proveedor_fk(rfc)')
    .order('id').range(a, b)))
    .filter(o => !STATUS_EXCLUIDOS.has(o.status ?? ''))
    .map(o => ({ ...o, rfc: String(o.proveedores?.rfc ?? '').trim().toUpperCase(), monto: Number(o.monto ?? 0) }))

  const vinculos = await todos<any>((a, b) => ctrl().from('cfdi_sat_op').select('uuid, id_op_fk, estado').order('id').range(a, b))
  const par = new Map(vinculos.map(v => [`${v.uuid}|${v.id_op_fk}`, v.estado as string]))
  const cfdiConfirmado = new Set(vinculos.filter(v => v.estado === 'confirmado').map(v => v.uuid))
  const opConfirmada = new Set(vinculos.filter(v => v.estado === 'confirmado').map(v => v.id_op_fk))

  const porUuid = new Map<string, any[]>()
  const porRfc = new Map<string, any[]>()
  for (const o of ops) {
    if (o.uuid_factura) porUuid.set(o.uuid_factura.toUpperCase(), [...(porUuid.get(o.uuid_factura.toUpperCase()) ?? []), o])
    if (o.rfc) porRfc.set(o.rfc, [...(porRfc.get(o.rfc) ?? []), o])
  }

  type Fila = { uuid: string; id_op_fk: number; metodo: string; estado: string; created_by: string }
  const nuevas: Fila[] = [], promover: Fila[] = []
  const agregar = (uuid: string, op: any, metodo: string, estado: 'confirmado' | 'sugerido') => {
    const prev = par.get(`${uuid}|${op.id}`)
    if (prev === 'descartado' || prev === 'confirmado') return
    const f = { uuid, id_op_fk: op.id, metodo, estado, created_by: userId }
    if (prev === 'sugerido') { if (estado === 'confirmado') promover.push(f); return }
    nuevas.push(f); par.set(`${uuid}|${op.id}`, estado)
    if (estado === 'confirmado') { cfdiConfirmado.add(uuid); opConfirmada.add(op.id) }
  }

  // 1 · UUID
  for (const c of cfdis) for (const op of porUuid.get(c.uuid) ?? []) agregar(c.uuid, op, 'uuid', 'confirmado')

  // 2 · Folio
  for (const c of cfdis) {
    if (cfdiConfirmado.has(c.uuid)) continue
    for (const op of porRfc.get(c.rfc_emisor) ?? []) {
      if (op.uuid_factura && op.uuid_factura !== c.uuid) continue   // la OP ya trae el UUID de otra factura
      if (!folioCoincide(op.folio_factura, c.serie, c.folio)) continue
      agregar(c.uuid, op, 'folio', cuadra(op.monto, Number(c.total ?? 0)) ? 'confirmado' : 'sugerido')
    }
  }

  // 3 · Monto (solo sugerencias, candidato único en ambos sentidos)
  const candidatos = new Map<string, any[]>()
  const usosOp = new Map<number, number>()
  for (const c of cfdis) {
    if (cfdiConfirmado.has(c.uuid)) continue
    const lista = (porRfc.get(c.rfc_emisor) ?? []).filter(op => {
      if (opConfirmada.has(op.id) || op.uuid_factura) return false
      if (!cuadra(op.monto, Number(c.total ?? 0))) return false
      const f = op.fecha_factura ?? op.fecha_op
      if (!f || !c.fecha_emision) return true
      const d = diasEntre(f, c.fecha_emision.slice(0, 10))
      return d >= -15 && d <= 120
    })
    candidatos.set(c.uuid, lista)
    for (const op of lista) usosOp.set(op.id, (usosOp.get(op.id) ?? 0) + 1)
  }
  for (const c of cfdis) {
    const lista = candidatos.get(c.uuid) ?? []
    if (lista.length === 1 && usosOp.get(lista[0].id) === 1) agregar(c.uuid, lista[0], 'monto', 'sugerido')
  }

  for (let i = 0; i < nuevas.length; i += 500) {
    const { error } = await ctrl().from('cfdi_sat_op').upsert(nuevas.slice(i, i + 500), { onConflict: 'uuid,id_op_fk', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
  for (const f of promover) {
    const { error } = await ctrl().from('cfdi_sat_op').update({ estado: 'confirmado', metodo: f.metodo }).eq('uuid', f.uuid).eq('id_op_fk', f.id_op_fk)
    if (error) throw new Error(error.message)
  }
  return {
    cfdis: cfdis.length,
    nuevos: nuevas.filter(n => n.estado === 'confirmado').length + promover.length,
    sugeridos: nuevas.filter(n => n.estado === 'sugerido').length,
  }
}
