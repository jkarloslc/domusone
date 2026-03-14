'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { dbCfg } from '@/lib/supabase'

type Config = {
  org_nombre:        string
  org_nombre_corto:  string
  org_subtitulo:     string
  org_rfc:           string
  org_direccion:     string
  org_telefono:      string
  org_correo:        string
  moneda:            string
  app_version:       string
  [key: string]: string
}

const defaults: Config = {
  org_nombre:        'Mi Organización',
  org_nombre_corto:  'MiOrg',
  org_subtitulo:     'Administración Residencial',
  org_rfc:           '',
  org_direccion:     '',
  org_telefono:      '',
  org_correo:        '',
  moneda:            'MXN',
  app_version:       '1.0.0',
}

const ConfigContext = createContext<{
  config: Config
  reload: () => void
}>({ config: defaults, reload: () => {} })

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config>(defaults)

  const load = async () => {
    const { data } = await dbCfg.from('configuracion').select('clave, valor')
    if (data?.length) {
      const map: Config = { ...defaults }
      data.forEach((row: any) => { if (row.valor != null) map[row.clave] = row.valor })
      setConfig(map)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <ConfigContext.Provider value={{ config, reload: load }}>
      {children}
    </ConfigContext.Provider>
  )
}

export const useConfig = () => useContext(ConfigContext)
