'use client'
import { createContext, useContext } from 'react'
import { tablasAmbito, type Ambito } from './ambito'

const Ctx = createContext<Ambito>('campo')

/** Envuelve una página para que sus pestañas usen las tablas de ese ámbito. */
export function AmbitoProvider({ ambito, children }: { ambito: Ambito; children: React.ReactNode }) {
  return <Ctx.Provider value={ambito}>{children}</Ctx.Provider>
}

export const useAmbito = () => useContext(Ctx)
/** Nombres de tabla del ámbito actual: dbCtrl.from(T.vales_combustible) */
export const useTablas = () => tablasAmbito(useAmbito())
