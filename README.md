# DomusOne — Sistema de Administración Residencial
## Stack: Next.js 14 · Supabase · Tailwind CSS · TypeScript

---

## Requisitos
- Node.js 18+
- Cuenta en [supabase.com](https://supabase.com)
- El schema `domusone_schema.sql` aplicado en tu proyecto Supabase

---

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.local.example .env.local
# Edita .env.local con tus credenciales de Supabase

# 3. Levantar en desarrollo
npm run dev
# → http://localhost:3000
```

---

## Credenciales Supabase
Ve a tu proyecto en supabase.com → Settings → API y copia:

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

---

## Módulos disponibles

| Módulo         | Ruta            | Status         |
|----------------|-----------------|----------------|
| Lotes          | /lotes          | ✅ Funcional   |
| Propietarios   | /propietarios   | 🔄 Sprint 2    |
| Cobranza       | /cobranza       | 🔄 Sprint 2    |
| Accesos        | /accesos        | 🔄 Sprint 3    |
| Contratos      | /contratos      | 🔄 Sprint 3    |
| Escrituras     | /escrituras     | 🔄 Sprint 3    |
| Proyectos      | /proyectos      | 🔄 Sprint 4    |
| Servicios      | /servicios      | 🔄 Sprint 4    |
| Vehículos      | /vehiculos      | 🔄 Sprint 4    |
| Reportes       | /reportes       | 🔄 Sprint 5    |
| Configuración  | /configuracion  | 🔄 Sprint 5    |

---

## Estructura del proyecto

```
domusone/
├── app/
│   ├── lotes/
│   │   ├── page.tsx          ← Lista principal con búsqueda y filtros
│   │   ├── LoteModal.tsx     ← Alta / edición de lote
│   │   ├── LoteDetail.tsx    ← Panel de detalle
│   │   └── layout.tsx
│   ├── propietarios/
│   └── ...otros módulos
├── components/
│   └── layout/
│       ├── Sidebar.tsx
│       └── DashLayout.tsx
├── lib/
│   └── supabase.ts           ← Cliente Supabase + tipos TypeScript
└── app/globals.css           ← Tema luxury dark + clases utilitarias
```

---

## Deploy en Vercel

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel

# Agregar variables de entorno en Vercel Dashboard:
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## Próximos pasos (Sprint 2)
1. Módulo Propietarios — CRUD completo + asignación a lotes
2. Módulo Cobranza — Recibos, cuotas, estado de cuenta por lote
3. Auth — Login con Supabase Auth + roles (admin, cobranza, accesos)
