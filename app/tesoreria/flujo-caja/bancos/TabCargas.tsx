'use client'
import { useCallback, useEffect, useState } from 'react'
import { Trash2, AlertTriangle } from 'lucide-react'
import { dbComp } from '@/lib/supabase'
import { mxn, nombreCuenta } from '@/lib/flujoBanco'
import { Aviso, CatalogosBanco, Etiqueta, num, td, th } from './comun'

type Carga = {
  id: number; id_cuenta_fk: number; archivo: string; fecha_desde: string; fecha_hasta: string
  saldo_inicial: number | null; saldo_final: number | null; total_abonos: number; total_cargos: number
  movimientos: number; nuevos: number; duplicados: number; cuadra: boolean | null
  created_by: string | null; created_at: string
}

const fmtFH = (d: string) => new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const n = (v: number | null) => v == null ? null : Number(v)

export default function TabCargas({ cat, puedeBorrar, recarga, onCambio }: {
  cat: CatalogosBanco; puedeBorrar: boolean; recarga: number; onCambio: () => void
}) {
  const [cargas, setCargas] = useState<Carga[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    const { data, error: e } = await dbComp.from('flujo_cargas').select('*').order('created_at', { ascending: false }).limit(500)
    setError(e ? e.message : '')
    setCargas((data ?? []) as Carga[])
    setCargando(false)
  }, [])
  useEffect(() => { cargar() }, [cargar, recarga])

  async function borrar(c: Carga) {
    if (!window.confirm(`¿Deshacer la carga «${c.archivo}»? Se eliminan sus ${c.nuevos} movimientos (también lo que se haya clasificado a mano). No se puede deshacer.`)) return
    const { error: e } = await dbComp.from('flujo_cargas').delete().eq('id', c.id)
    if (e) { setError('No se pudo eliminar: ' + e.message); return }
    cargar(); onCambio()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && <Aviso color="#C23B3B"><AlertTriangle size={14} /> {error}</Aviso>}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={th}>Cuenta</th><th style={th}>Archivo</th><th style={th}>Periodo</th>
              <th style={{ ...th, textAlign: 'right' }}>Saldo inicial</th><th style={{ ...th, textAlign: 'right' }}>Depósitos</th>
              <th style={{ ...th, textAlign: 'right' }}>Retiros</th><th style={{ ...th, textAlign: 'right' }}>Saldo final</th>
              <th style={th}>Cuadre</th><th style={{ ...th, textAlign: 'right' }}>Nuevos</th><th style={{ ...th, textAlign: 'right' }}>Ya cargados</th>
              <th style={th}>Cargó</th><th style={th}></th>
            </tr></thead>
            <tbody>
              {cargando && <tr><td style={td} colSpan={12}>Cargando…</td></tr>}
              {!cargando && cargas.length === 0 && <tr><td style={{ ...td, color: '#62666E' }} colSpan={12}>Todavía no se ha cargado ningún estado de cuenta.</td></tr>}
              {cargas.map(c => {
                const dif = c.saldo_inicial != null && c.saldo_final != null
                  ? n(c.saldo_inicial)! + Number(c.total_abonos) - Number(c.total_cargos) - n(c.saldo_final)! : null
                return (
                  <tr key={c.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 600 }}>{nombreCuenta(cat.cuentas.find(x => x.id === c.id_cuenta_fk))}</td>
                    <td style={{ ...td, maxWidth: 220, wordBreak: 'break-all' }}>{c.archivo}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{c.fecha_desde} — {c.fecha_hasta}</td>
                    <td style={{ ...td, ...num }}>{c.saldo_inicial != null ? mxn(Number(c.saldo_inicial)) : '—'}</td>
                    <td style={{ ...td, ...num }}>{mxn(Number(c.total_abonos))}</td>
                    <td style={{ ...td, ...num }}>{mxn(Number(c.total_cargos))}</td>
                    <td style={{ ...td, ...num }}>{c.saldo_final != null ? mxn(Number(c.saldo_final)) : '—'}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {c.cuadra === true && <Etiqueta color="#1F7A50">Cuadra</Etiqueta>}
                      {c.cuadra === false && <><Etiqueta color="#C23B3B">No cuadra</Etiqueta>{dif != null && <div style={{ fontSize: 11, color: '#C23B3B', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>{mxn(dif)}</div>}</>}
                      {c.cuadra === null && <Etiqueta color="#62666E">Sin saldos</Etiqueta>}
                    </td>
                    <td style={{ ...td, ...num }}>{c.nuevos.toLocaleString('es-MX')}</td>
                    <td style={{ ...td, ...num, fontWeight: 400, color: '#62666E' }}>{c.duplicados.toLocaleString('es-MX')}</td>
                    <td style={{ ...td, fontSize: 12, whiteSpace: 'nowrap' }}>{c.created_by ?? '—'}<div style={{ color: '#7A7E87', fontSize: 11 }}>{fmtFH(c.created_at)}</div></td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {puedeBorrar && <button className="btn-ghost" title="Deshacer carga" onClick={() => borrar(c)}><Trash2 size={14} color="#C23B3B" /></button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
