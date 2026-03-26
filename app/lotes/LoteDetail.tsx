'use client'
import { useState, useEffect, useCallback } from 'react'
import { dbCfg, dbCtrl, type Lote } from '@/lib/supabase'
import { X, Edit2, MapPin, DollarSign, FileText, User, Zap, Droplets, Plus, Trash2, Save, Loader } from 'lucide-react'

type Props = { lote: Lote; onClose: () => void; onEdit: () => void }

export default function LoteDetail({ lote, onClose, onEdit }: Props) {
  const [tab, setTab] = useState<'datos' | 'servicios'>('datos')
  const [tipoNombre, setTipoNombre] = useState<string | null>(null)

  useEffect(() => {
    const fk = (lote as any).id_tipo_lote_fk
    if (fk) {
      dbCfg.from('tipos_lote').select('nombre').eq('id', fk).single()
        .then(({ data }) => { if (data) setTipoNombre(data.nombre) })
    }
  }, [(lote as any).id_tipo_lote_fk])

  const tipoDisplay = tipoNombre ?? lote.tipo_lote ?? 'Sin tipo'
  const fmtMon = (v: number | null) => v != null ? '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 0 }) : '—'

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, color: 'var(--gold-light)' }}>
              {lote.cve_lote ?? `Lote #${lote.lote}`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {tipoDisplay} · {lote.superficie ? lote.superficie.toLocaleString('es-MX') + ' m²' : 'Sin superficie'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-secondary" onClick={onEdit}><Edit2 size={13} /> Editar</button>
            <button className="btn-ghost" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', padding: '0 24px' }}>
          {(['datos', 'servicios'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === t ? 600 : 400,
                color: tab === t ? 'var(--blue)' : 'var(--text-muted)',
                borderBottom: tab === t ? '2px solid var(--blue)' : '2px solid transparent', marginBottom: -1 }}>
              {t === 'datos' ? 'Datos Generales' : 'Servicios'}
            </button>
          ))}
        </div>

        {tab === 'datos' && (
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', maxHeight: 'calc(90vh - 150px)' }}>
            <Grp label="Status y Clasificación" icon={<MapPin size={14} />}>
              <R label="Status Lote"       v={lote.status_lote} badge />
              <R label="Status Jurídico"   v={lote.status_juridico} />
              <R label="Cobranza"          v={lote.clasificacion_cobranza} />
              <R label="Paga Cuotas"       v={lote.paga_cuotas} />
              <R label="Urbanización"      v={lote.urbanizacion_disponible} />
            </Grp>
            <Grp label="Información Comercial" icon={<DollarSign size={14} />}>
              <R label="Valor Operación"   v={fmtMon(lote.valor_operacion)} />
              <R label="Precio Lista"      v={fmtMon(lote.precio_de_lista)} />
              <R label="Forma de Venta"    v={lote.forma_venta} />
              <R label="Incluye Membresía" v={lote.incluye_membresia} />
              <R label="Tipo Membresía"    v={lote.tipo_membresia} />
              <R label="Vendedor"          v={lote.vendedor} />
              <R label="Medio Captación"   v={lote.medio_captacion} />
            </Grp>
            <Grp label="Datos Catastrales y Fiscales" icon={<FileText size={14} />}>
              <R label="Clave Catastral"   v={lote.clave_catastral} />
              <R label="Valor Catastral"   v={fmtMon(lote.valor_catastral)} />
              <R label="RFC Factura"       v={lote.rfc_para_factura} />
              <R label="Razón Social"      v={lote.razon_social_para_factura} />
            </Grp>
            <Grp label="Contacto Rápido" icon={<User size={14} />}>
              <R label="Persona"   v={lote.persona_contacto} />
              <R label="Teléfono"  v={lote.telefono_persona_contacto} />
              <R label="Correo"    v={lote.correo_persona_contacto} />
            </Grp>
            {lote.observaciones && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Observaciones</div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{lote.observaciones}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'servicios' && (
          <SvcTab loteId={lote.id} />
        )}
      </div>
    </div>
  )
}

const SC: Record<string, string> = { 'Vendido': 'badge-vendido', 'Libre': 'badge-libre', 'Bloqueado': 'badge-bloqueado' }

function Grp({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, color: 'var(--gold)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
        {icon}{label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>{children}</div>
    </div>
  )
}

function R({ label, v, badge }: { label: string; v?: string | null; badge?: boolean }) {
  if (!v) return null
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      {badge ? <span className={`badge ${SC[v] ?? 'badge-default'}`}>{v}</span>
             : <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{v}</div>}
    </div>
  )
}

function SvcTab({ loteId }: { loteId: number }) {
  const [cfe,     setCfe]     = useState<any[]>([])
  const [agua,    setAgua]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [r1, r2] = await Promise.all([
      dbCtrl.from('servicios_cfe').select('*').eq('id_lote_fk', loteId).order('id'),
      dbCtrl.from('servicios_agua').select('*').eq('id_lote_fk', loteId).order('id'),
    ])
    setCfe(r1.data ?? [])
    setAgua(r2.data ?? [])
    setLoading(false)
  }, [loteId])

  useEffect(() => { load() }, [load])

  const sCFE  = (i: number, k: string, v: string) => setCfe(p  => p.map((x, j) => j===i ? {...x,[k]:v} : x))
  const sAGU  = (i: number, k: string, v: string) => setAgua(p => p.map((x, j) => j===i ? {...x,[k]:v} : x))

  const dCFE  = async (i: number) => { const s=cfe[i];  if(s?.id) await dbCtrl.from('servicios_cfe').delete().eq('id',s.id);  setCfe(p=>p.filter((_,j)=>j!==i)) }
  const dAGU  = async (i: number) => { const s=agua[i]; if(s?.id) await dbCtrl.from('servicios_agua').delete().eq('id',s.id); setAgua(p=>p.filter((_,j)=>j!==i)) }

  const save = async () => {
    setSaving(true); setMsg('')
    for (const s of cfe) {
      const p = { id_lote_fk: loteId, no_servicio: s.no_servicio||null, tarifa: s.tarifa||null, medidor: s.medidor||null, status: s.status||'Activo', notas: s.notas||null }
      if (s.id) await dbCtrl.from('servicios_cfe').update(p).eq('id', s.id)
      else { const {data} = await dbCtrl.from('servicios_cfe').insert(p).select('id').single(); if(data) s.id=data.id }
    }
    for (const s of agua) {
      const p = { id_lote_fk: loteId, no_contrato: s.no_contrato||null, tipo_toma: s.tipo_toma||null, medidor: s.medidor||null, status: s.status||'Activo', notas: s.notas||null }
      if (s.id) await dbCtrl.from('servicios_agua').update(p).eq('id', s.id)
      else { const {data} = await dbCtrl.from('servicios_agua').insert(p).select('id').single(); if(data) s.id=data.id }
    }
    setSaving(false); setMsg('Guardado')
    setTimeout(() => setMsg(''), 2000)
  }

  if (loading) return <div style={{padding:40,textAlign:'center'}}><Loader size={18} className="animate-spin" style={{margin:'0 auto',color:'var(--text-muted)'}}/></div>

  const SS = ['Activo','Suspendido','Inactivo']
  const TF = ['1','1A','1B','1C','DAC','2','TL','TE']
  const TT = ['Residencial','Comercial','Industrial']

  return (
    <div style={{padding:'20px 24px',overflowY:'auto',maxHeight:'calc(90vh - 150px)',display:'flex',flexDirection:'column',gap:20}}>

      {/* CFE */}
      <div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',gap:7}}>
            <Zap size={14} style={{color:'#d97706'}}/>
            <span style={{fontSize:13,fontWeight:600,color:'#d97706'}}>CFE — Energía Eléctrica ({cfe.length})</span>
          </div>
          <button className="btn-ghost" style={{fontSize:12}} onClick={() => setCfe(p=>[...p,{id_lote_fk:loteId,no_servicio:'',tarifa:'',medidor:'',status:'Activo',notas:''}])}>
            <Plus size={12}/> Agregar
          </button>
        </div>
        {cfe.length===0 && <p style={{fontSize:12,color:'var(--text-muted)',fontStyle:'italic'}}>Sin servicios CFE registrados</p>}
        {cfe.map((s,i) => (
          <div key={i} style={{padding:12,background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,marginBottom:8}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
              <div><label className="label">No. Servicio</label>
                <input className="input" value={s.no_servicio??''} onChange={e=>sCFE(i,'no_servicio',e.target.value)} style={{fontFamily:'monospace'}}/>
              </div>
              <div><label className="label">No. Medidor</label>
                <input className="input" value={s.medidor??''} onChange={e=>sCFE(i,'medidor',e.target.value)} style={{fontFamily:'monospace'}}/>
              </div>
              <div><label className="label">Tarifa</label>
                <select className="select" value={s.tarifa??''} onChange={e=>sCFE(i,'tarifa',e.target.value)}>
                  <option value="">—</option>{TF.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="label">Status</label>
                <select className="select" value={s.status??'Activo'} onChange={e=>sCFE(i,'status',e.target.value)}>
                  {SS.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
              <div style={{flex:1}}><label className="label">Notas</label>
                <input className="input" value={s.notas??''} onChange={e=>sCFE(i,'notas',e.target.value)} placeholder="Opcional"/>
              </div>
              <button className="btn-ghost" style={{padding:6,color:'#dc2626'}} onClick={()=>dCFE(i)}><Trash2 size={13}/></button>
            </div>
          </div>
        ))}
      </div>

      {/* Agua */}
      <div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',gap:7}}>
            <Droplets size={14} style={{color:'var(--blue)'}}/>
            <span style={{fontSize:13,fontWeight:600,color:'var(--blue)'}}>Agua Potable ({agua.length})</span>
          </div>
          <button className="btn-ghost" style={{fontSize:12}} onClick={() => setAgua(p=>[...p,{id_lote_fk:loteId,no_contrato:'',tipo_toma:'',medidor:'',status:'Activo',notas:''}])}>
            <Plus size={12}/> Agregar
          </button>
        </div>
        {agua.length===0 && <p style={{fontSize:12,color:'var(--text-muted)',fontStyle:'italic'}}>Sin servicios de agua registrados</p>}
        {agua.map((s,i) => (
          <div key={i} style={{padding:12,background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,marginBottom:8}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
              <div><label className="label">No. Contrato</label>
                <input className="input" value={s.no_contrato??''} onChange={e=>sAGU(i,'no_contrato',e.target.value)} style={{fontFamily:'monospace'}}/>
              </div>
              <div><label className="label">No. Medidor</label>
                <input className="input" value={s.medidor??''} onChange={e=>sAGU(i,'medidor',e.target.value)} style={{fontFamily:'monospace'}}/>
              </div>
              <div><label className="label">Tipo de Toma</label>
                <select className="select" value={s.tipo_toma??''} onChange={e=>sAGU(i,'tipo_toma',e.target.value)}>
                  <option value="">—</option>{TT.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="label">Status</label>
                <select className="select" value={s.status??'Activo'} onChange={e=>sAGU(i,'status',e.target.value)}>
                  {SS.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
              <div style={{flex:1}}><label className="label">Notas</label>
                <input className="input" value={s.notas??''} onChange={e=>sAGU(i,'notas',e.target.value)} placeholder="Opcional"/>
              </div>
              <button className="btn-ghost" style={{padding:6,color:'#dc2626'}} onClick={()=>dAGU(i)}><Trash2 size={13}/></button>
            </div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',gap:12}}>
        {msg && <span style={{fontSize:12,color:'#15803d',fontWeight:600}}>✓ {msg}</span>}
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? <><Loader size={13} className="animate-spin"/> Guardando…</> : <><Save size={13}/> Guardar</>}
        </button>
      </div>
    </div>
  )
}
