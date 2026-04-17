# Instrucciones para Claude – Proyecto domusone

## Flujo de trabajo obligatorio

- **Siempre hacer `git push` después de cada cambio** al código.
- Secuencia estándar: `git add <archivos>` → `git commit -m "..."` → `git push origin main`
- No esperar confirmación del usuario; el push va incluido en cada tarea.

### Problema conocido: git index.lock en macOS
El sandbox de Claude crea archivos `.git/index.lock` y `.git/HEAD.lock` que quedan huérfanos
por permisos del sistema de archivos montado. Si el push falla con "index.lock exists":
1. Pedir al usuario que ejecute en su terminal:
   ```bash
   rm -f /Users/jkarloslc/Downloads/domusone/.git/index.lock \
         /Users/jkarloslc/Downloads/domusone/.git/HEAD.lock && \
   cd /Users/jkarloslc/Downloads/domusone && \
   git add <archivos> && git commit -m "..." && git push origin main
   ```
2. Todo en una sola línea para que el lock no se recree entre comandos.
3. Si `lsof` muestra "sin proceso activo" pero el lock persiste, es herencia del sandbox.

---

## Stack
- Next.js (App Router) + TypeScript
- Supabase (múltiples clientes: `dbCtrl`, `dbComp`, `dbCfg`)
- CSS-in-JS con estilos inline y clases globales (`card`, `btn-primary`, `btn-ghost`, etc.)

## Ramas
- Rama principal: `main`
- Repositorio: https://github.com/jkarloslc/domusone.git

---

## Módulos principales

### Tesorería (`/app/tesoreria/`)
- `page.tsx` — Dashboard con KPIs: CXP Total, CXP Vencido, Saldo en Cuentas, Cuentas Bancarias
- `cuentas-bancarias/` — Saldos y movimientos bancarios
- `cxp/` — Cuentas por pagar

### Dashboard Financiero (`/app/inicio/page.tsx`)
- KPIs: Ingresos, Egresos, Balance neto, CXP pendiente, Saldo bancos
- Layout de KPIs usa `display: flex, flexWrap: wrap, flex: '1 1 180px', maxWidth: 260`
  (corregido 2026-04-17: antes usaba grid auto-fit que estiraba el último card)

### Compras (`/app/compras/`)
Flujo completo: **Requisición → RFQ/Cotización → OC → Recepción → Inventario**

#### Bugs corregidos (2026-04-17)

**Bug raíz — `id_articulo_fk` se perdía en toda la cadena:**

| Archivo | Problema | Fix |
|---|---|---|
| `cotizaciones/page.tsx` | Al precargar `cotDet` desde `requisiciones_det`, no se copiaba `id_articulo_fk` | Agregado al estado `cotDet` y al insert de `rfq_cotizaciones_det` |
| `ordenes/page.tsx` → `aplicarRFQ` | Hardcodeaba `id_articulo_fk: null` al cargar ítems de la cotización ganadora | Ahora consulta `requisiciones_det` vía `id_requisicion_det_fk` para recuperar FK + nombre del artículo |
| `ordenes/page.tsx` → `handleSave` | Insert de `ordenes_compra_det` no incluía `id_articulo_fk` | Agregado `id_articulo_fk: d.id_articulo_fk ?? null` |
| `recepciones/page.tsx` | Sin manejo de errores en upsert de `inventario` y `movimientos_inv` | Errores ahora visibles al usuario; bloque `if (d.id_articulo_fk)` ahora funciona correctamente |

**Consecuencia:** Las recepciones de mercancía no actualizaban el inventario. Solo los ajustes manuales (que sí pasaban `id_articulo_fk` directamente) funcionaban.

**Nota sobre datos existentes:** OC creadas antes del fix tienen `id_articulo_fk = null` en `ordenes_compra_det`. Para esas recepciones el inventario no se actualizará automáticamente; requieren ajuste manual.

#### Tablas clave de inventario
- `inventario` — stock por artículo/almacén (`id_articulo_fk`, `id_almacen_fk`, `cantidad`, `costo_promedio`)
- `movimientos_inv` — kardex (`tipo_mov`: ENTRADA, SALIDA, AJUSTE, TRANSFERENCIA_IN/OUT)
- `recepciones` / `recepciones_det` — cabecera y detalle de recepciones
- `ordenes_compra` / `ordenes_compra_det` — OC con FK a artículos
- `rfq` / `rfq_cotizaciones` / `rfq_cotizaciones_det` — proceso de cotización
- `requisiciones` / `requisiciones_det` — solicitudes de compra con `id_articulo_fk`

---

### Reportes (`/app/reportes/`)
Índice central en `page.tsx` con grupos: Residencial, Mantenimiento, Tesorería, Compras e Inventarios.
Patrón estándar: componente `ReporteX.tsx` + filtros en cabecera + `<PrintBar>` (utils.tsx) + bloque con `id="reporte-print-area"` que contiene `<table id="reporte-table">`.

#### Reporte de Órdenes de Pago por CC/Área (2026-04-17)
Archivo: `ReporteOrdenesPago.tsx`. Registrado en los grupos `tesoreria` y `compras` con id `ordenes-pago-cc` (mismo componente reutilizado).

- **Vista jerárquica**: filas de Centro de Costo (colapsables) → filas de Área (colapsables) → detalle de OPs. Totales en cada nivel + total general al pie. Botones Expandir/Colapsar todo.
- **Filtros**: Status (los 5 de `ordenes_pago`: Pendiente Auth, Pendiente, Pagada, Rechazada, Cancelada), Centro de Costo (`cfg.centros_costo`), Área (`cfg.areas`, dependiente del CC seleccionado), rango de fechas sobre `fecha_op`.
- **KPIs**: 5 cards por status (monto y conteo) + 4 cards de totales (Total / Pagado / Por pagar / # de OPs). Los KPIs de status ignoran el filtro de status (para ver la distribución).
- **Columnas del detalle**: Folio, Proveedor, Concepto, Tipo Gasto, Fecha, Vencimiento (rojo si vencido y Pendiente), Monto, Pagado, Saldo, Status (badge con color).
- **Datos**: `dbComp.ordenes_pago` (campos: `monto`, `saldo`, `fecha_op`, `fecha_vencimiento`, `id_centro_costo_fk`, `id_area_fk`, `id_proveedor_fk`, `concepto`, `tipo_gasto`, `status`).
- **Status color map**: Pagada `#15803d`, Pendiente `#d97706`, Pendiente Auth `#7c3aed`, Rechazada `#dc2626`, Cancelada `#64748b`.
