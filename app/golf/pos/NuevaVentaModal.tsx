'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { dbGolf, dbCfg } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { X, Search, Plus, Minus, Trash2, ShoppingCart, Loader, CheckCircle, Printer, ShieldCheck, Lock } from 'lucide-react'
import { fechaLocal, inicioDelDia } from '@/lib/dateUtils'

// ── Tipos ──────────────────────────────────────────────────────
type Producto = {
  id: number; nombre: string; descripcion: string | null; sku: string | null
  precio: number; iva_pct: number; aplica_iva: boolean; tipo: string
  id_centro_fk: number | null; precio_variable: boolean
}
type FormaPago = { id: number; nombre: string }
type Socio = { id: number; numero_socio: string | null; nombre: string; apellido_paterno: string | null; apellido_materno: string | null }
type LineaVenta = { id_producto: number; concepto: string; cantidad: number; precio_unitario: number; iva_pct: number; aplica_iva: boolean; precio_variable: boolean }

type Props = {
  idCentro: number
  nombreCentro: string
  onClose: () => void
  onVentaGuardada: () => void
}

const fmt$ = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
const nc = (s: Socio) => [s.nombre, s.apellido_paterno, s.apellido_materno].filter(Boolean).join(' ')

function calcLinea(l: LineaVenta) {
  // precio_unitario = precio FINAL que paga el cliente (IVA ya incluido cuando aplica_iva=true)
  // El IVA se desglosa hacia adentro para efectos de CFDI; nunca se suma por fuera.
  const total = Math.round(l.precio_unitario * l.cantidad * 100) / 100
  if (!l.aplica_iva || l.iva_pct === 0) {
    return { subtotal: total, iva: 0, total }
  }
  const factor   = 1 + l.iva_pct / 100                            // e.g. 1.16
  const subtotal = Math.round((total / factor) * 100) / 100       // base sin IVA
  const iva      = Math.round((total - subtotal) * 100) / 100     // IVA incluido
  return { subtotal, iva, total }
}

export default function NuevaVentaModal({ idCentro: idCentroProp, nombreCentro: nombreCentroProp, onClose, onVentaGuardada }: Props) {
  const { authUser } = useAuth()

  // Se fija el centro al abrir la venta: si el centro activo del padre cambia
  // mientras la venta está en curso (p.ej. re-render por refresh de sesión),
  // esta venta debe seguir perteneciendo al centro con el que se inició.
  const [idCentro]     = useState(idCentroProp)
  const [nombreCentro] = useState(nombreCentroProp)

  const [productos,   setProductos]   = useState<Producto[]>([])
  const [formasPago,  setFormasPago]  = useState<FormaPago[]>([])
  const [loading,     setLoading]     = useState(true)

  // Líneas del carrito
  const [lineas, setLineas] = useState<LineaVenta[]>([])

  // Cliente
  const [esSocio,       setEsSocio]       = useState(true)
  const [socioSearch,   setSocioSearch]   = useState('')
  const [socioResults,  setSocioResults]  = useState<Socio[]>([])
  const [socioSelec,    setSocioSelec]    = useState<Socio | null>(null)
  const [buscandoSocio, setBuscandoSocio] = useState(false)

  // Búsqueda de productos
  const [prodSearch, setProdSearch] = useState('')

  // Mini-diálogo para precio variable
  const [precioVarProducto, setPrecioVarProducto] = useState<Producto | null>(null)
  const [precioVarInput,    setPrecioVarInput]    = useState('')

  // Pago
  const [forma1, setForma1] = useState<number>(0)
  const [monto1, setMonto1] = useState<string>('')
  const [forma2, setForma2] = useState<number>(0)
  const [monto2, setMonto2] = useState<string>('')
  const [dosFormas, setDosFormas] = useState(false)

  // Estado guardado
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState<{ id: number; folio_dia: number } | null>(null)

  // Auth condonación
  const [showCondonAuth,  setShowCondonAuth]  = useState(false)
  const [condonEmail,     setCondonEmail]     = useState('')
  const [condonPassword,  setCondonPassword]  = useState('')
  const [condonError,     setCondonError]     = useState('')
  const [condonLoading,   setCondonLoading]   = useState(false)

  // ── Cargar catálogo ────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      dbGolf.from('cat_productos_pos').select('*').eq('activo', true).eq('id_centro_fk', idCentro).order('nombre'),
      dbCfg.from('formas_pago').select('id, nombre').eq('activo', true).order('nombre'),
    ]).then(([{ data: prods }, { data: fps }]) => {
      setProductos((prods as Producto[]) ?? [])
      const fps2 = (fps as FormaPago[]) ?? []
      setFormasPago(fps2)
      if (fps2.length) setForma1(fps2[0].id)
      setLoading(false)
    })
  }, [idCentro])

  // ── Búsqueda de socios ────────────────────────────────────
  useEffect(() => {
    if (!esSocio) { setSocioResults([]); return }
    if (socioSearch.trim().length < 2) { setSocioResults([]); return }
    const t = setTimeout(async () => {
      setBuscandoSocio(true)
      const words = socioSearch.trim().split(/\s+/).filter(Boolean)
      let qb: any = dbGolf.from('cat_socios')
        .select('id, numero_socio, nombre, apellido_paterno, apellido_materno')
        .eq('activo', true)
      for (const w of words) {
        qb = qb.or(`nombre.ilike.%${w}%,apellido_paterno.ilike.%${w}%,apellido_materno.ilike.%${w}%,numero_socio.ilike.%${w}%`)
      }
      const { data } = await qb.limit(8)
      setSocioResults((data as Socio[]) ?? [])
      setBuscandoSocio(false)
    }, 300)
    return () => clearTimeout(t)
  }, [socioSearch, esSocio])

  // ── Cálculos ──────────────────────────────────────────────
  const totales = lineas.reduce((acc, l) => {
    const c = calcLinea(l)
    return { subtotal: acc.subtotal + c.subtotal, iva: acc.iva + c.iva, total: acc.total + c.total }
  }, { subtotal: 0, iva: 0, total: 0 })

  const totalPagado = (parseFloat(monto1) || 0) + (dosFormas ? (parseFloat(monto2) || 0) : 0)
  const cambio      = totalPagado - totales.total
  const canSave     = lineas.length > 0 && forma1 > 0 && totalPagado >= totales.total && totales.total > 0

  const esCondonacion = (idForma: number) =>
    !!formasPago.find(f => f.id === idForma)?.nombre.toLowerCase().includes('condonac')
  const requiereCondonAuth = esCondonacion(forma1) || (dosFormas && esCondonacion(forma2))

  // ── Agregar producto al carrito ───────────────────────────
  const agregarProducto = (p: Producto) => {
    if (p.precio_variable) {
      // Abrir mini-diálogo para capturar el precio
      setPrecioVarProducto(p)
      setPrecioVarInput(p.precio > 0 ? String(p.precio) : '')
      return
    }
    agregarConPrecio(p, p.precio)
  }

  const agregarConPrecio = (p: Producto, precio: number) => {
    setLineas(prev => {
      const idx = prev.findIndex(l => l.id_producto === p.id && !l.precio_variable)
      if (idx >= 0 && !p.precio_variable) {
        const next = [...prev]
        next[idx] = { ...next[idx], cantidad: next[idx].cantidad + 1 }
        return next
      }
      return [...prev, { id_producto: p.id, concepto: p.nombre, cantidad: 1, precio_unitario: precio, iva_pct: p.iva_pct, aplica_iva: p.aplica_iva, precio_variable: p.precio_variable }]
    })
  }

  const confirmarPrecioVariable = () => {
    if (!precioVarProducto) return
    const precio = parseFloat(precioVarInput)
    if (isNaN(precio) || precio <= 0) return
    agregarConPrecio(precioVarProducto, precio)
    setPrecioVarProducto(null)
    setPrecioVarInput('')
  }

  const cambiarCantidad = (idx: number, delta: number) => {
    setLineas(prev => {
      const next = [...prev]
      const nueva = next[idx].cantidad + delta
      if (nueva <= 0) { next.splice(idx, 1); return next }
      next[idx] = { ...next[idx], cantidad: nueva }
      return next
    })
  }

  const cambiarPrecio = (idx: number, val: string) => {
    const n = parseFloat(val)
    if (isNaN(n) || n < 0) return
    setLineas(prev => { const next = [...prev]; next[idx] = { ...next[idx], precio_unitario: n }; return next })
  }

  const quitarLinea = (idx: number) => setLineas(prev => prev.filter((_, i) => i !== idx))

  // ── Monto1 auto = total si solo una forma ─────────────────
  useEffect(() => {
    if (!dosFormas) setMonto1(totales.total > 0 ? totales.total.toFixed(2) : '')
  }, [totales.total, dosFormas])

  // ── Verificar credenciales admin para condonación ─────────
  const verificarAdminCondonacion = async (email: string, password: string): Promise<{ ok: boolean; nombre?: string; errorMsg?: string }> => {
    const tempClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'condon-verify-tmp' } },
    )
    const { error: authErr } = await tempClient.auth.signInWithPassword({ email: email.trim(), password })
    if (authErr) return { ok: false, errorMsg: 'Contraseña o correo incorrecto.' }

    const { data: uData } = await dbCfg
      .from('usuarios')
      .select('rol, nombre')
      .eq('email', email.trim().toLowerCase())
      .in('rol', ['superadmin', 'admin'])
      .maybeSingle()

    if (!uData) return { ok: false, errorMsg: 'El usuario no tiene permisos de administrador.' }
    return { ok: true, nombre: uData.nombre }
  }

  // ── Botón Cobrar: redirige a auth si hay condonación ─────
  const handleCobrar = () => {
    if (!canSave) return
    if (requiereCondonAuth) {
      setCondonEmail(''); setCondonPassword(''); setCondonError('')
      setShowCondonAuth(true)
    } else {
      handleSave()
    }
  }

  const handleCondonAuth = async () => {
    if (!condonEmail || !condonPassword) return
    setCondonLoading(true); setCondonError('')
    const result = await verificarAdminCondonacion(condonEmail, condonPassword)
    if (!result.ok) {
      setCondonError(result.errorMsg ?? 'Error de autorización.')
      setCondonLoading(false)
      return
    }
    setShowCondonAuth(false)
    setCondonLoading(false)
    handleSave(result.nombre)
  }

  // ── Guardar venta ─────────────────────────────────────────
  const handleSave = async (autorizadoPor?: string) => {
    if (!canSave) return
    setSaving(true); setError('')

    // Calcular folio_dia (MAX del día en el centro — usando TZ local)
    const hoy = fechaLocal()
    const { data: maxFolio } = await dbGolf
      .from('ctrl_ventas')
      .select('folio_dia')
      .eq('id_centro_fk', idCentro)
      .gte('fecha', inicioDelDia(hoy))
      .order('folio_dia', { ascending: false })
      .limit(1)
    const folioDia = maxFolio && maxFolio.length > 0 ? (maxFolio[0].folio_dia + 1) : 1

    const nombreCliente = socioSelec ? nc(socioSelec) : 'Público en General'

    // Insert venta
    const { data: venta, error: e1 } = await dbGolf.from('ctrl_ventas').insert({
      folio_dia:      folioDia,
      id_centro_fk:   idCentro,
      fecha:          new Date().toISOString(),
      id_socio_fk:    socioSelec?.id ?? null,
      nombre_cliente: nombreCliente,
      es_socio:       esSocio && !!socioSelec,
      subtotal:       totales.subtotal,
      iva:            totales.iva,
      total:          totales.total,
      descuento:      0,
      status:         'PAGADA',
      usuario_crea:   authUser?.nombre ?? 'sistema',
      ...(autorizadoPor ? { autoriza_condonacion: autorizadoPor } : {}),
    }).select('id, folio_dia').single()

    if (e1 || !venta) { setError(e1?.message ?? 'Error al crear venta'); setSaving(false); return }

    // Insert detalles
    const detInsert = lineas.map(l => {
      const c = calcLinea(l)
      return {
        id_venta_fk:    venta.id,
        id_producto_fk: l.id_producto,
        concepto:       l.concepto,
        cantidad:       l.cantidad,
        precio_unitario: l.precio_unitario,
        iva_pct:        l.iva_pct,
        iva:            c.iva,
        subtotal:       c.subtotal,
        total:          c.total,
        descuento:      0,
      }
    })
    const { error: e2 } = await dbGolf.from('ctrl_ventas_det').insert(detInsert)
    if (e2) { setError(e2.message); setSaving(false); return }

    // Insert pagos
    const pagosInsert = [
      { id_venta_fk: venta.id, id_forma_fk: forma1 || null, forma_nombre: formasPago.find(f => f.id === forma1)?.nombre ?? '', monto: parseFloat(monto1) || 0 },
    ]
    if (dosFormas && forma2 && parseFloat(monto2) > 0) {
      pagosInsert.push({ id_venta_fk: venta.id, id_forma_fk: forma2 || null, forma_nombre: formasPago.find(f => f.id === forma2)?.nombre ?? '', monto: parseFloat(monto2) || 0 })
    }
    const { error: e3 } = await dbGolf.from('ctrl_ventas_pagos').insert(pagosInsert)
    if (e3) { setError(e3.message); setSaving(false); return }

    setSaving(false)
    setSuccess({ id: venta.id, folio_dia: venta.folio_dia })
    onVentaGuardada()
  }

  // ── Imprimir ticket ───────────────────────────────────────
  const abrirTicket = async (ventaId: number, folioDia: number, autoPrint = false) => {
    const { data: cfg } = await dbGolf.from('cfg_pos').select('*').single()
    const nombreForma1 = formasPago.find(f => f.id === forma1)?.nombre ?? ''
    const nombreForma2 = formasPago.find(f => f.id === forma2)?.nombre ?? ''
    const pagos = [
      { forma: nombreForma1, monto: parseFloat(monto1) || 0 },
      ...(dosFormas && forma2 && parseFloat(monto2) > 0
        ? [{ forma: nombreForma2, monto: parseFloat(monto2) || 0 }]
        : []),
    ].filter(p => p.monto > 0)

    const ticketData = {
      id:          ventaId,
      folio_dia:   folioDia,
      fecha:       new Date().toISOString(),
      cliente:     socioSelec ? nc(socioSelec) : 'Público en General',
      cajero:      authUser?.nombre ?? '—',
      centro:      nombreCentro,
      razon_social: cfg?.razon_social ?? 'Balvanera Golf, Polo & Country Club',
      municipio:   cfg?.municipio ?? '',
      direccion:   cfg?.direccion ?? '',
      rfc:         cfg?.rfc ?? '',
      telefono:    cfg?.telefono ?? '',
      leyenda:     cfg?.leyenda_ticket ?? '¡Gracias por su visita!',
      subtotal:    totales.subtotal,
      iva:         totales.iva,
      total:       totales.total,
      pagos,
      items: lineas.map(l => {
        const c = calcLinea(l)
        return { concepto: l.concepto, cantidad: l.cantidad, precio_unitario: l.precio_unitario, iva: c.iva, total: c.total }
      }),
    }
    const encoded = encodeURIComponent(JSON.stringify(ticketData))
    const url = `/ticket-golf.html?data=${encoded}${autoPrint ? '&print=1' : ''}`
    window.open(url, '_blank', 'width=400,height=700')
  }

  const prodsFiltrados = productos.filter(p => {
    if (!prodSearch.trim()) return true
    return p.nombre.toLowerCase().includes(prodSearch.toLowerCase()) || (p.sku ?? '').toLowerCase().includes(prodSearch.toLowerCase())
  })

  // ── Pantalla de éxito ─────────────────────────────────────
  if (success) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '40px 32px', maxWidth: 380, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <CheckCircle size={52} color="#059669" style={{ margin: '0 auto 16px' }} />
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>¡Venta registrada!</div>
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6 }}>Folio #{String(success.id).padStart(6, '0')} · Día {success.folio_dia}</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#059669', marginBottom: 24 }}>{fmt$(totales.total)}</div>
        {cambio > 0.005 && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 16px', marginBottom: 16, fontSize: 14, color: '#92400e', fontWeight: 600 }}>
            Cambio: {fmt$(cambio)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
          <button onClick={() => abrirTicket(success.id, success.folio_dia, true)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            <Printer size={15} /> Imprimir Ticket
          </button>
          <button onClick={() => abrirTicket(success.id, success.folio_dia, false)}
            style={{ padding: '8px', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
            Ver Ticket
          </button>
          <button onClick={onClose}
            style={{ padding: '8px', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )

  // ── Mini-diálogo precio variable ─────────────────────────
  if (precioVarProducto) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: '28px 24px', maxWidth: 340, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{precioVarProducto.nombre}</div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 18 }}>
          Ingresa el precio a cobrar al cliente
          {precioVarProducto.aplica_iva && <span style={{ marginLeft: 6, color: '#059669', fontWeight: 600 }}>(IVA {precioVarProducto.iva_pct}% incluido)</span>}
        </div>
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 14, fontWeight: 700 }}>$</span>
          <input
            autoFocus
            type="number" min={0.01} step={0.01}
            value={precioVarInput}
            onChange={e => setPrecioVarInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmarPrecioVariable(); if (e.key === 'Escape') { setPrecioVarProducto(null); setPrecioVarInput('') } }}
            style={{ width: '100%', padding: '10px 12px 10px 24px', fontSize: 22, fontWeight: 700, border: '2px solid #fbbf24', borderRadius: 8, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: '#1e293b', background: '#fffbeb', textAlign: 'right' }}
            placeholder="0.00" />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setPrecioVarProducto(null); setPrecioVarInput('') }}
            style={{ flex: 1, padding: '10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={confirmarPrecioVariable}
            disabled={!precioVarInput || parseFloat(precioVarInput) <= 0}
            style={{ flex: 2, padding: '10px', fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 8, background: '#059669', color: '#fff', cursor: 'pointer', opacity: (!precioVarInput || parseFloat(precioVarInput) <= 0) ? 0.5 : 1 }}>
            Agregar al carrito
          </button>
        </div>
      </div>
    </div>
  )

  // ── Diálogo de autorización de condonación ───────────────
  if (showCondonAuth) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '32px 28px', maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ background: '#fef3c7', borderRadius: '50%', width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <ShieldCheck size={26} color="#d97706" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 4, textAlign: 'center' }}>Autorización requerida</div>
          <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center' }}>
            La forma de pago <strong>Condonación</strong> requiere<br />autorización de un administrador.
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Correo del administrador</label>
          <input
            autoFocus
            type="email"
            value={condonEmail}
            onChange={e => setCondonEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCondonAuth() }}
            placeholder="admin@ejemplo.com"
            style={{ width: '100%', padding: '9px 12px', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 8, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Contraseña</label>
          <div style={{ position: 'relative' }}>
            <Lock size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="password"
              value={condonPassword}
              onChange={e => setCondonPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCondonAuth() }}
              placeholder="••••••••"
              style={{ width: '100%', padding: '9px 12px 9px 30px', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 8, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {condonError && (
          <div style={{ padding: '7px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, fontSize: 12, color: '#dc2626', marginBottom: 12 }}>
            {condonError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowCondonAuth(false)}
            style={{ flex: 1, padding: '10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={handleCondonAuth}
            disabled={condonLoading || !condonEmail || !condonPassword}
            style={{ flex: 2, padding: '10px', fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 8, background: '#d97706', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: (condonLoading || !condonEmail || !condonPassword) ? 0.6 : 1 }}>
            {condonLoading ? <Loader size={15} /> : <ShieldCheck size={15} />}
            {condonLoading ? 'Verificando…' : 'Autorizar y Cobrar'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 12 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 900, maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderRadius: '16px 16px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShoppingCart size={18} color="#059669" />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>Nueva Venta</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{nombreCentro}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={18} /></button>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
            <Loader size={24} />
          </div>
        ) : (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 340px', overflow: 'hidden', minHeight: 0 }}>

            {/* ── Panel izquierdo: productos ───────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #e2e8f0', overflow: 'hidden' }}>

              {/* Búsqueda productos */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input
                    style={{ width: '100%', padding: '8px 10px 8px 30px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                    placeholder="Buscar producto o SKU…"
                    value={prodSearch} onChange={e => setProdSearch(e.target.value)} />
                </div>
              </div>

              {/* Grid de productos */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, alignContent: 'start' }}>
                {prodsFiltrados.length === 0 ? (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#94a3b8', padding: '32px 0', fontSize: 13 }}>
                    Sin productos configurados para este centro.<br />
                    <span style={{ fontSize: 11 }}>Agrégalos en Configuración.</span>
                  </div>
                ) : prodsFiltrados.map(p => (
                  <button key={p.id} onClick={() => agregarProducto(p)}
                    style={{ padding: '10px 8px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all 0.1s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f0fdf4'; (e.currentTarget as HTMLElement).style.borderColor = '#a7f3d0' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff'; (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b', marginBottom: 4, lineHeight: 1.3 }}>{p.nombre}</div>
                    {p.sku && <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 4 }}>{p.sku}</div>}
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#059669' }}>{fmt$(p.precio)}</div>
                    <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                      {p.tipo === 'PRODUCTO' ? '📦 Producto' : '⚡ Servicio'}
                      {p.aplica_iva ? ` (IVA inc.)` : ''}
                    </div>
                    {p.precio_variable && (
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#d97706', marginTop: 2 }}>✏ Precio variable</div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Panel derecho: carrito + pago ────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              {/* Cliente */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
                  <button onClick={() => setEsSocio(true)}
                    style={{ flex: 1, padding: '6px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: esSocio ? '#ecfdf5' : '#fff', color: esSocio ? '#065f46' : '#94a3b8' }}>
                    Socio
                  </button>
                  <button onClick={() => { setEsSocio(false); setSocioSelec(null); setSocioSearch('') }}
                    style={{ flex: 1, padding: '6px', fontSize: 12, fontWeight: 600, border: 'none', borderLeft: '1px solid #e2e8f0', cursor: 'pointer', background: !esSocio ? '#ecfdf5' : '#fff', color: !esSocio ? '#065f46' : '#94a3b8' }}>
                    Público General
                  </button>
                </div>
                {esSocio && (
                  socioSelec ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>{nc(socioSelec)}</div>
                        {socioSelec.numero_socio && <div style={{ fontSize: 10, color: '#6b7280' }}>#{socioSelec.numero_socio}</div>}
                      </div>
                      <button onClick={() => setSocioSelec(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={13} /></button>
                    </div>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      {buscandoSocio && <Loader size={11} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />}
                      <input
                        style={{ width: '100%', padding: '6px 8px 6px 26px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                        placeholder="Buscar socio…" value={socioSearch} onChange={e => setSocioSearch(e.target.value)} />
                      {socioResults.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', marginTop: 2, maxHeight: 160, overflowY: 'auto' }}>
                          {socioResults.map(s => (
                            <button key={s.id} onClick={() => { setSocioSelec(s); setSocioSearch(''); setSocioResults([]) }}
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', padding: '7px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{nc(s)}</span>
                              {s.numero_socio && <span style={{ fontSize: 10, color: '#64748b' }}>#{s.numero_socio}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>

              {/* Carrito */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                {lineas.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0', fontSize: 12 }}>
                    Selecciona productos<br />del panel izquierdo
                  </div>
                ) : lineas.map((l, i) => {
                  const c = calcLinea(l)
                  return (
                    <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{l.concepto}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <button onClick={() => cambiarCantidad(i, -1)} style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={10} /></button>
                          <span style={{ fontSize: 12, fontWeight: 600, minWidth: 20, textAlign: 'center' }}>{l.cantidad}</span>
                          <button onClick={() => cambiarCantidad(i, 1)} style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={10} /></button>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>× </span>
                          {l.precio_variable ? (
                            <input
                              type="number" min={0} step={0.01}
                              value={l.precio_unitario}
                              onChange={e => cambiarPrecio(i, e.target.value)}
                              style={{ width: 64, padding: '2px 4px', fontSize: 11, border: '1px solid #fbbf24', borderRadius: 4, textAlign: 'right', fontFamily: 'inherit', outline: 'none', background: '#fffbeb' }} />
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', minWidth: 64, textAlign: 'right' }}>{fmt$(l.precio_unitario)}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{fmt$(c.total)}</div>
                        {l.aplica_iva && c.iva > 0 && <div style={{ fontSize: 9, color: '#94a3b8' }}>IVA inc. {fmt$(c.iva)}</div>}
                        <button onClick={() => quitarLinea(i)} style={{ marginTop: 2, background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5' }}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Totales + Pago */}
              <div style={{ padding: '10px 12px', borderTop: '1px solid #e2e8f0', background: '#fafafa' }}>
                {/* Resumen */}
                <div style={{ marginBottom: 8 }}>
                  {totales.iva > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 2 }}>
                      <span>Subtotal</span><span>{fmt$(totales.subtotal)}</span>
                    </div>
                  )}
                  {totales.iva > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 2 }}>
                      <span>IVA</span><span>{fmt$(totales.iva)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800, color: '#059669', marginTop: 4 }}>
                    <span>TOTAL</span><span>{fmt$(totales.total)}</span>
                  </div>
                </div>

                {/* Forma de pago */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 6, marginBottom: 4 }}>
                    <select value={forma1} onChange={e => setForma1(Number(e.target.value))}
                      style={{ padding: '6px 8px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
                      {formasPago.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                    </select>
                    <input type="number" min={0} step={0.01} value={monto1} onChange={e => setMonto1(e.target.value)}
                      style={{ padding: '6px 8px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontFamily: 'inherit', outline: 'none', textAlign: 'right' }}
                      placeholder="Monto" />
                  </div>
                  {dosFormas ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 24px', gap: 6 }}>
                      <select value={forma2} onChange={e => setForma2(Number(e.target.value))}
                        style={{ padding: '6px 8px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontFamily: 'inherit', outline: 'none' }}>
                        <option value={0}>— Forma 2 —</option>
                        {formasPago.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                      </select>
                      <input type="number" min={0} step={0.01} value={monto2} onChange={e => setMonto2(e.target.value)}
                        style={{ padding: '6px 8px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontFamily: 'inherit', outline: 'none', textAlign: 'right' }}
                        placeholder="Monto" />
                      <button onClick={() => { setDosFormas(false); setForma2(0); setMonto2('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={14} /></button>
                    </div>
                  ) : (
                    <button onClick={() => setDosFormas(true)}
                      style={{ fontSize: 11, color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
                      + Agregar segunda forma de pago
                    </button>
                  )}
                </div>

                {/* Cambio */}
                {cambio > 0.005 && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '4px 8px', fontSize: 12, color: '#92400e', fontWeight: 600, marginBottom: 6, textAlign: 'center' }}>
                    Cambio: {fmt$(cambio)}
                  </div>
                )}

                {error && <div style={{ padding: '6px 8px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 11, color: '#dc2626', marginBottom: 6 }}>{error}</div>}

                <button onClick={handleCobrar} disabled={saving || !canSave}
                  style={{ width: '100%', padding: '10px', fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 8, background: requiereCondonAuth ? '#d97706' : '#059669', color: '#fff', cursor: canSave ? 'pointer' : 'default', opacity: canSave ? 1 : 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {saving ? <Loader size={15} /> : requiereCondonAuth ? <ShieldCheck size={15} /> : <ShoppingCart size={15} />}
                  {saving ? 'Registrando…' : requiereCondonAuth ? 'Cobrar (requiere auth)' : 'Cobrar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
