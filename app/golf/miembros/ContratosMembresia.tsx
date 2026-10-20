'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, dbGolf } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { cargarTarifas, resolverTarifa, montoACargar } from '@/lib/tarifaPactadaGolf'
import { Plus, Printer, Upload, Loader, CheckCircle, Circle, ExternalLink, FileCheck, Receipt, Trash2 } from 'lucide-react'
import type { Socio } from './SocioModal'
import CobrarCuotaModal from '../carritos/CobrarCuotaModal'

type Contrato = {
  id: number
  anio: number
  tipo_movimiento: 'ALTA' | 'RENOVACION' | null
  estado: 'BORRADOR' | 'IMPRESO' | 'FIRMADO' | 'ACTIVO' | 'CANCELADO'
  fecha_firma: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  monto_inscripcion: number | null
  monto_anual: number | null
  monto_mensualidad: number | null
  vigente: boolean
  archivo_url: string | null
  impreso_en: string | null
}

type Cargo = {
  id: number
  id_contrato_fk: number
  concepto: string
  periodo: string | null
  monto_original: number
  descuento: number
  monto_final: number
  saldo: number
  status: string
  fecha_vencimiento: string | null
  tipo: string
}

const COLS = 'id, anio, tipo_movimiento, estado, fecha_firma, fecha_inicio, fecha_fin, monto_inscripcion, monto_anual, monto_mensualidad, vigente, archivo_url, impreso_en'
const fmt$ = (v: number | null | undefined) => `$${Number(v ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const fmtF = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const hoyLocal = () => new Date().toLocaleDateString('en-CA')

const ESTADO_CFG: Record<string, { label: string; bg: string; color: string }> = {
  BORRADOR:  { label: 'Pendiente de imprimir', bg: '#f1f5f9', color: '#475569' },
  IMPRESO:   { label: 'Pendiente de firma',    bg: '#fef3c7', color: '#92400e' },
  FIRMADO:   { label: 'Pendiente de pago de inscripción', bg: '#fee2e2', color: '#b91c1c' },
  ACTIVO:    { label: 'Ciclo activo',          bg: '#dcfce7', color: '#15803d' },
  CANCELADO: { label: 'Cancelado',             bg: '#f1f5f9', color: '#94a3b8' },
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none' }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }

function ArchivoLink({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    supabase.storage.from('golf-docs').createSignedUrl(path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null))
  }, [path])
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#2563eb', textDecoration: 'none', fontSize: 11 }}>
      <ExternalLink size={10} /> Ver contrato firmado
    </a>
  )
}

function Paso({ ok, label, detalle }: { ok: boolean; label: string; detalle?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: ok ? '#15803d' : '#94a3b8', fontWeight: ok ? 600 : 500 }}>
      {ok ? <CheckCircle size={13} /> : <Circle size={13} />}
      <span>{label}{detalle ? ` · ${detalle}` : ''}</span>
    </div>
  )
}

export default function ContratosMembresia({ socio, puedeEscribir }: { socio: Socio; puedeEscribir: boolean }) {
  const { authUser } = useAuth()
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [cargos, setCargos]       = useState<Cargo[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  // alta/renovación
  const [showNuevo, setShowNuevo] = useState(false)
  const [anio, setAnio]           = useState('2027')
  const [tipoMov, setTipoMov]     = useState<'ALTA' | 'RENOVACION'>('RENOVACION')
  const [creando, setCreando]     = useState(false)

  // firma
  const [firmaId, setFirmaId]     = useState<number | null>(null)
  const [fechaFirma, setFechaFirma] = useState(hoyLocal())
  const [archivo, setArchivo]     = useState('')
  const [subiendo, setSubiendo]   = useState(false)
  const [guardandoFirma, setGuardandoFirma] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [cobrar, setCobrar] = useState<Cargo | null>(null)
  const [busy, setBusy]     = useState<number | null>(null)

  const nombre = [socio.nombre, socio.apellido_paterno, socio.apellido_materno].filter(Boolean).join(' ')

  const fetchAll = useCallback(async () => {
    const { data } = await dbGolf.from('ctrl_contratos_membresia').select(COLS)
      .eq('id_socio_fk', socio.id).order('anio', { ascending: false }).order('id', { ascending: false })
    const cs = (data as Contrato[]) ?? []
    setContratos(cs)
    const ids = cs.map(c => c.id)
    if (ids.length) {
      const { data: cg } = await dbGolf.from('cxc_golf')
        .select('id, id_contrato_fk, concepto, periodo, monto_original, descuento, monto_final, saldo, status, fecha_vencimiento, tipo')
        .in('id_contrato_fk', ids).order('periodo')
      setCargos((cg as Cargo[]) ?? [])
    } else setCargos([])
    setLoading(false)
  }, [socio.id])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Si ya hay algún contrato, lo natural es una renovación; si no, un alta
  useEffect(() => { setTipoMov(contratos.length > 0 ? 'RENOVACION' : 'ALTA') }, [contratos.length])

  // ── Alta / Renovación: crea el contrato en BORRADOR con los montos resueltos ──
  const resolverMonto = async (tipo: 'INSCRIPCION' | 'MENSUALIDAD', periodo: string) => {
    if (socio.id_categoria_fk == null) throw new Error('El socio no tiene categoría asignada')
    const { data: cfgs } = await dbGolf.from('cat_cuotas_config').select('id, tipo').eq('activo', true).eq('tipo', tipo)
    const ids = (cfgs ?? []).map((c: any) => c.id)
    if (ids.length === 0) throw new Error(`No hay cuota ${tipo} configurada`)
    const { data: dets } = await dbGolf.from('cat_cuotas_config_det').select('id_cuota_config_fk, monto')
      .in('id_cuota_config_fk', ids).eq('id_categoria_fk', socio.id_categoria_fk).eq('activo', true)
    const det = (dets ?? [])[0] as { id_cuota_config_fk: number; monto: number } | undefined
    const cfgId = det?.id_cuota_config_fk ?? ids[0]
    const { tarifas, error: eT } = await cargarTarifas(cfgId, socio.id)
    if (eT) throw new Error(eT)
    const { monto } = montoACargar(resolverTarifa(tarifas, socio.id, cfgId, periodo), det ? Number(det.monto) : null)
    if (monto == null) throw new Error(`No hay precio de ${tipo.toLowerCase()} para la categoría del socio`)
    return { cfgId, monto }
  }

  const handleCrear = async () => {
    const a = Number(anio)
    if (!a || a < 2020) { setError('Año inválido'); return }
    setCreando(true); setError('')
    try {
      const insc = await resolverMonto('INSCRIPCION', `${a}-01`)
      const mens = await resolverMonto('MENSUALIDAD', `${a}-01`)
      if (!(mens.monto > 0)) throw new Error('La mensualidad resuelta es $0; revisa la cuota o la tarifa pactada')
      const { error: err } = await dbGolf.from('ctrl_contratos_membresia').insert({
        id_socio_fk: socio.id,
        anio: a,
        tipo_movimiento: tipoMov,
        estado: 'BORRADOR',
        vigente: false,
        fecha_inicio: `${a}-01-01`,
        fecha_fin: `${a}-12-31`,
        monto_inscripcion: insc.monto,
        monto_mensualidad: mens.monto,
        monto_anual: Math.round(mens.monto * 12 * 100) / 100,
        id_cuota_inscripcion_fk: insc.cfgId,
        id_cuota_mensualidad_fk: mens.cfgId,
        usuario_crea: authUser?.nombre ?? null,
      })
      if (err) throw new Error(err.code === '23505' ? `Ya existe un contrato ${a} para este socio` : err.message)
      setShowNuevo(false)
      await fetchAll()
    } catch (e: any) {
      setError(e.message ?? 'Error al crear el contrato')
    }
    setCreando(false)
  }

  // ── Impresión: el contrato pasa a IMPRESO ──
  const imprimir = async (c: Contrato) => {
    setBusy(c.id); setError('')
    const data = {
      membresia:         socio.cat_categorias_socios?.nombre ?? '',
      nombre,
      lugar_nacimiento:  socio.lugar_nacimiento || '',
      fecha_nacimiento:  socio.fecha_nacimiento || '',
      curp:              socio.curp || '',
      domicilio:         socio.domicilio || '',
      telefono:          socio.telefono || '',
      email:             socio.email || '',
      anio:              c.anio,
      fecha_inicio:      c.fecha_inicio,
      fecha_fin:         c.fecha_fin,
      fecha_firma:       c.fecha_inicio,
      monto_inscripcion: c.monto_inscripcion,
      monto_anual:       c.monto_anual,
    }
    window.open(`/contrato-membresia.html?data=${encodeURIComponent(JSON.stringify(data))}`, '_blank')
    if (c.estado === 'BORRADOR') {
      const { error: err } = await dbGolf.from('ctrl_contratos_membresia')
        .update({ estado: 'IMPRESO', impreso_en: new Date().toISOString(), impreso_por: authUser?.nombre ?? null })
        .eq('id', c.id)
      if (err) setError(err.message)
      await fetchAll()
    }
    setBusy(null)
  }

  // ── Firma: archivo + fecha obligatorios ──
  const subirArchivo = async (file: File, c: Contrato) => {
    setSubiendo(true); setError('')
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    const path = `contratos/socio_${socio.id}_${c.anio}_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('golf-docs').upload(path, file, { upsert: true })
    if (upErr) setError(upErr.message); else setArchivo(path)
    setSubiendo(false)
  }

  const registrarFirma = async (c: Contrato) => {
    if (!archivo) { setError('Sube el contrato firmado (PDF o imagen)'); return }
    if (!fechaFirma) { setError('Captura la fecha de firma'); return }
    setGuardandoFirma(true); setError('')
    const { error: err } = await dbGolf.from('ctrl_contratos_membresia')
      .update({ estado: 'FIRMADO', archivo_url: archivo, fecha_firma: fechaFirma, firma_registrada_por: authUser?.nombre ?? null })
      .eq('id', c.id)
    if (err) { setError(err.message); setGuardandoFirma(false); return }
    setFirmaId(null); setArchivo(''); setGuardandoFirma(false)
    await fetchAll()
  }

  const eliminar = async (c: Contrato) => {
    if (!confirm(`¿Eliminar el contrato ${c.anio}?`)) return
    setBusy(c.id)
    const { error: err } = await dbGolf.from('ctrl_contratos_membresia').delete().eq('id', c.id)
    if (err) setError(err.message)
    setBusy(null)
    fetchAll()
  }

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Cargando…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileCheck size={15} style={{ color: '#7c3aed' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>Alta / Renovación de membresía</span>
          <span style={{ fontSize: 11, color: '#64748b' }}>({contratos.length})</span>
        </div>
        {puedeEscribir && !showNuevo && (
          <button onClick={() => { setShowNuevo(true); setError('') }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#7c3aed', background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>
            <Plus size={13} /> Alta / Renovar ciclo
          </button>
        )}
      </div>

      {showNuevo && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Ciclo (año)</label>
              <input style={inputStyle} type="number" value={anio} onChange={e => setAnio(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Movimiento</label>
              <select style={inputStyle} value={tipoMov} onChange={e => setTipoMov(e.target.value as any)}>
                <option value="ALTA">Alta (socio nuevo)</option>
                <option value="RENOVACION">Renovación</option>
              </select>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 10, lineHeight: 1.5 }}>
            Los montos de inscripción y mensualidad se toman de la tarifa pactada del socio o, si no hay, del precio de lista de su categoría.
            La inscripción se cobra al registrar el contrato firmado; las mensualidades se generan al quedar pagada.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowNuevo(false)}
              style={{ padding: '7px 14px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>Cancelar</button>
            <button onClick={handleCrear} disabled={creando}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#7c3aed', color: '#fff', cursor: 'pointer', opacity: creando ? 0.7 : 1 }}>
              {creando && <Loader size={12} className="animate-spin" />} Asignar contrato
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>{error}</div>
      )}

      {contratos.length === 0 && !showNuevo ? (
        <div style={{ textAlign: 'center', padding: '32px 20px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>Sin contratos registrados</div>
        </div>
      ) : contratos.map(c => {
        const cfg = ESTADO_CFG[c.estado]
        const flujo = c.tipo_movimiento != null
        const insc  = cargos.find(g => g.id_contrato_fk === c.id && g.tipo === 'INSCRIPCION')
        const mens  = cargos.filter(g => g.id_contrato_fk === c.id && g.tipo === 'MENSUALIDAD')
        const firmado = ['FIRMADO', 'ACTIVO'].includes(c.estado)
        return (
          <div key={c.id} style={{ border: `1px solid ${c.vigente ? '#a3e635' : '#e2e8f0'}`, background: c.vigente ? '#f7fee7' : '#fff', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Ciclo {c.anio}</span>
              {c.tipo_movimiento && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#ede9fe', color: '#6d28d9' }}>
                  {c.tipo_movimiento === 'ALTA' ? 'ALTA' : 'RENOVACIÓN'}
                </span>
              )}
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
              {c.vigente && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#84cc16', color: '#fff' }}>VIGENTE</span>}
              <span style={{ flex: 1 }} />
              {c.archivo_url && <ArchivoLink path={c.archivo_url} />}
              {puedeEscribir && ['BORRADOR', 'IMPRESO'].includes(c.estado) && flujo && (
                <button onClick={() => eliminar(c)} disabled={busy === c.id} title="Eliminar"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><Trash2 size={14} /></button>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: '#64748b', display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
              <span>Inscripción: <b style={{ color: '#16a34a' }}>{fmt$(c.monto_inscripcion)}</b></span>
              {c.monto_mensualidad != null && <span>Mensualidad: <b style={{ color: '#16a34a' }}>{fmt$(c.monto_mensualidad)}</b></span>}
              {c.fecha_firma && <span>Firmado: {fmtF(c.fecha_firma)}</span>}
            </div>

            {flujo && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 6, marginTop: 10 }}>
                <Paso ok label="Contrato asignado" />
                <Paso ok={c.estado !== 'BORRADOR'} label="Impreso" detalle={c.impreso_en ? fmtF(c.impreso_en.slice(0, 10)) : undefined} />
                <Paso ok={firmado} label="Firmado y registrado" />
                <Paso ok={c.estado === 'ACTIVO'} label="Inscripción pagada" detalle={insc ? fmt$(insc.monto_final) : undefined} />
                <Paso ok={mens.length > 0} label="Mensualidades asignadas" detalle={mens.length ? `${mens.length}` : undefined} />
              </div>
            )}

            {puedeEscribir && flujo && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {['BORRADOR', 'IMPRESO'].includes(c.estado) && (
                  <button onClick={() => imprimir(c)} disabled={busy === c.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, border: 'none', borderRadius: 8, background: '#7c3aed', color: '#fff', cursor: 'pointer' }}>
                    <Printer size={13} /> {c.estado === 'BORRADOR' ? 'Imprimir contrato' : 'Reimprimir'}
                  </button>
                )}
                {c.estado === 'IMPRESO' && firmaId !== c.id && (
                  <button onClick={() => { setFirmaId(c.id); setArchivo(''); setFechaFirma(hoyLocal()); setError('') }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, border: '1px solid #16a34a', borderRadius: 8, background: '#f0fdf4', color: '#15803d', cursor: 'pointer' }}>
                    <FileCheck size={13} /> Registrar contrato firmado
                  </button>
                )}
                {c.estado === 'FIRMADO' && insc && insc.status !== 'PAGADO' && (
                  <button onClick={() => setCobrar(insc)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', fontSize: 12.5, fontWeight: 600, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer' }}>
                    <Receipt size={13} /> Cobrar inscripción · {fmt$(insc.saldo ?? insc.monto_final)}
                  </button>
                )}
              </div>
            )}

            {firmaId === c.id && (
              <div style={{ marginTop: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Fecha de firma *</label>
                    <input style={inputStyle} type="date" value={fechaFirma} onChange={e => setFechaFirma(e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Contrato firmado (PDF/imagen) *</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => fileRef.current?.click()} disabled={subiendo}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#475569' }}>
                        {subiendo ? <Loader size={12} className="animate-spin" /> : <Upload size={12} />} {archivo ? 'Cambiar archivo' : 'Subir archivo'}
                      </button>
                      {archivo && <span style={{ fontSize: 11, color: '#16a34a' }}>✓ Archivo listo</span>}
                    </div>
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) subirArchivo(f, c); e.target.value = '' }} />
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 8 }}>
                  Al registrar la firma se genera de inmediato el cargo de inscripción ({fmt$(c.monto_inscripcion)}).
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setFirmaId(null)}
                    style={{ padding: '7px 14px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#475569', cursor: 'pointer' }}>Cancelar</button>
                  <button onClick={() => registrarFirma(c)} disabled={guardandoFirma || subiendo}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: '#16a34a', color: '#fff', cursor: 'pointer', opacity: guardandoFirma ? 0.7 : 1 }}>
                    {guardandoFirma && <Loader size={12} className="animate-spin" />} Registrar firma
                  </button>
                </div>
              </div>
            )}

            {c.estado === 'ACTIVO' && mens.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 11.5, color: '#64748b' }}>
                Mensualidades: {mens.filter(m => m.status === 'PAGADO').length} pagadas de {mens.length}
                {' '}({fmtF(mens[0].fecha_vencimiento)} → {fmtF(mens[mens.length - 1].fecha_vencimiento)}). Se cobran desde la pestaña Cobranza.
              </div>
            )}
          </div>
        )
      })}

      {cobrar && (
        <CobrarCuotaModal
          cuotas={[{ ...cobrar, saldo: cobrar.saldo ?? cobrar.monto_final }]}
          nombreSocio={nombre}
          idSocio={socio.id}
          onClose={() => { setCobrar(null); fetchAll() }}
          onSaved={() => { setCobrar(null); fetchAll() }}
        />
      )}
    </div>
  )
}
