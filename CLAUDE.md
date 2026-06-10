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

## Sistema de Roles — Regla crítica al agregar o modificar roles

El sistema de autorización está dividido en **DOS archivos independientes** que deben actualizarse **siempre juntos**. Olvidar uno causa que el rol funcione a medias (bug vivido con `admin_lector`).

### Archivo 1 — `lib/AuthContext.tsx`
Controla **qué puede hacer** el usuario (permisos funcionales):

| Elemento | Qué define |
|---|---|
| `type Rol` | Lista de valores válidos — agregar el nuevo rol aquí |
| `getHomeRouteByRole()` | Ruta inicial al hacer login |
| `LEER: Record<Rol, …>` | Módulos visibles en sidebar (`can()`) |
| `ESCRIBIR: Record<Rol, …>` | Módulos donde aparecen botones Nuevo/Editar (`canWrite()`) |
| `ROLES_DELETE` | Roles que pueden eliminar registros |
| `ROLES_AUTH` | Roles que pueden autorizar documentos (Req, OC, Transferencias) |
| `canCompras()` | Nivel de acceso al hub de Compras: `'all' \| 'compras' \| 'almacen' \| 'seguridad' \| 'solicitante' \| false` |

### Archivo 2 — `components/layout/Sidebar.tsx`
Controla **qué ve** el usuario en el menú lateral (estructura visual):

| Elemento | Qué define |
|---|---|
| `type Rol` | **Copia local** del tipo — debe coincidir con AuthContext |
| `ROL_LABEL` | Texto que aparece bajo el avatar del usuario |
| `NAV_POR_ROL: Record<Rol, NavSection[]>` | Secciones y enlaces del sidebar por rol |

> ⚠️ **Si el rol no existe en `NAV_POR_ROL`, `sections` queda `[]` y el usuario solo ve Inicio** — aunque `LEER` esté correctamente configurado en AuthContext.

### Archivo 3 — `app/usuarios/page.tsx`
Array `ROLES` — aparece en el selector del modal de creación/edición de usuarios. Agregar entrada con `value`, `label` y `desc`.

### Archivo 4 — Migration SQL
```sql
-- supabase/migrations/YYYYMMDDHHMMSS_rol_nuevo.sql
ALTER TABLE cfg.usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
ALTER TABLE cfg.usuarios ADD CONSTRAINT usuarios_rol_check CHECK (
  rol IN ('superadmin', 'admin', 'admin_lector', ... 'nuevo_rol')
);
```

### Checklist al agregar un nuevo rol

- [ ] `lib/AuthContext.tsx` → `type Rol`, `getHomeRouteByRole`, `LEER`, `ESCRIBIR`, `canCompras` (si aplica), `ROLES_DELETE` / `ROLES_AUTH` (si aplica)
- [ ] `components/layout/Sidebar.tsx` → `type Rol`, `ROL_LABEL`, `NAV_POR_ROL`
- [ ] `app/usuarios/page.tsx` → array `ROLES`
- [ ] Migration SQL → CHECK constraint en `cfg.usuarios`

### Roles existentes (2026-05-11)

| Valor | Label | Acceso |
|---|---|---|
| `superadmin` | Super Administrador | Total (incluye Usuarios, Config, eliminar) |
| `admin` | Administrador | Todo operativo, sin Usuarios/Config |
| `admin_lector` | Admin Solo Lectura | Igual que admin, sin escritura/eliminar/autorizar |
| `usuarioadmin` | Administrador (Op.) | Admin sin Mantenimiento |
| `usuariomantto` | Administrador (Mant.) | Admin sin Tesorería ni Golf |
| `fraccionamiento` | Fraccionamiento | Residencial + Compras + Tesorería + Reportes |
| `atencion_residentes` | Atención a Residentes | Residencial, incidencias, mantenimiento |
| `cobranza` | Cobranza | Lotes, propietarios, cobranza, facturas |
| `tesoreria` | Tesorería | Tesorería, ingresos, reportes |
| `ingresos` | Ingresos | Módulo ingresos + reportes |
| `compras` | Compras | Req, cot, OC, OP, proveedores, artículos |
| `compras_supervisor` | Supervisor de Compras | Compras + autorización |
| `almacen` | Almacén | Recepciones, transferencias, artículos |
| `usuario_solicitante` | Solicitante | Solo crea requisiciones y transferencias |
| `mantenimiento` | Mantenimiento | Órdenes de trabajo, vehículos |
| `vigilancia` | Vigilancia | Accesos, incidencias |
| `seguridad` | Seguridad | Accesos, incidencias, requisiciones |
| `usuariogolf` | Operador Golf | Módulo Golf completo + req/transf |
| `usuariohipico` | Operador Hípico | Módulo Hípico completo + req/transf |
| `usuariohospitality` | Operador Hospitality | Módulo Hospitality + req/transf |

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

- **Tabs**: `Jerárquico` (CC → Área → OPs) y `Matriz CC × Área` (tabla pivote con filas = CC, columnas = áreas únicas del set filtrado, celdas = monto total; con totales por fila y columna, y header/primera columna *sticky* para scroll horizontal).
- **Vista jerárquica**: filas de Centro de Costo (colapsables) → filas de Área (colapsables) → detalle de OPs. Totales en cada nivel + total general al pie. Botones Expandir/Colapsar todo.
- **Filtros**: Status (los 5), Centro de Costo, Área (dependiente del CC), Proveedor, Tipo de Gasto (lista sincronizada con `app/compras/ordenes-pago/page.tsx`), rango de fechas sobre `fecha_op`.
- **KPIs**: 5 cards por status (monto y conteo) + 4 cards de totales (Total / Pagado / Por pagar / # de OPs). Los KPIs de status ignoran el filtro de status (para ver la distribución), pero sí respetan el resto.
- **Columnas del detalle**: Folio, Proveedor, Concepto, Tipo Gasto, Fecha, Vencimiento (rojo si vencido y Pendiente), Monto, Pagado, Saldo, Status (badge con color).
- **Export Excel** (`xlsx` ^0.18.5, instalado como dep): botón `Exportar Excel` genera `Ordenes-de-Pago-CC-Area_YYYY-MM-DD.xlsx` con 3 hojas: `Resumen` (fila por CC+Área + total), `Detalle` (todas las OPs con CC, Área, proveedor, fechas, montos) y `Matriz CC x Area` (pivote completo).
- **Datos**: `dbComp.ordenes_pago` (campos: `monto`, `saldo`, `fecha_op`, `fecha_vencimiento`, `id_centro_costo_fk`, `id_area_fk`, `id_proveedor_fk`, `concepto`, `tipo_gasto`, `status`).
- **Status color map**: Pagada `#15803d`, Pendiente `#d97706`, Pendiente Auth `#7c3aed`, Rechazada `#dc2626`, Cancelada `#64748b`.

#### Reporte de Antigüedad de OPs por CC/Área (2026-04-17)
Archivo: `ReporteAntiguedadOPporCC.tsx`. Registrado en los grupos `tesoreria` y `compras` con id `antiguedad-op-cc`.

- **Bandas**: `Por vencer` (≤ 0), `0-30`, `31-60`, `61-90`, `+90` días desde `fecha_vencimiento` (hoy a las 00:00).
- **Universo de datos**: OPs con `status NOT IN ('Pagada', 'Cancelada')` y `saldo > 0` (si `saldo` es null se usa `monto`).
- **Vista jerárquica**: CC → Área → OPs. Cada fila (y el total general) muestra columnas por banda + columna de saldo total. Las celdas vacías se muestran como `—`.
- **Filtros**: Centro de Costo, Área (dependiente del CC), Proveedor, Banda.
- **KPIs**: 5 cards (una por banda) con monto y % del saldo total + 2 cards grandes (saldo total por pagar, # de OPs con saldo).
- **Detalle**: incluye columna `Días` (negativa = por vencer, positiva = vencido) y marca la banda correspondiente en la celda de esa columna (resto queda en `—`).
