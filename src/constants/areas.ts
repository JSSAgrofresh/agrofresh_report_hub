import backgroundLab from '@/assets/backgrounds/background_lab.jpg'
import backgroundAccutab from '@/assets/backgrounds/background_accutab.jpg'

export type AreaId = 'cromatografia' | 'postcosecha'

export interface AreaConfig {
  id: AreaId
  nombre: string
  colorPrimario: string
  colorOscuro: string
  fondo: string
  /** ids de módulos (ver constants/modules.ts) exclusivos de esta área */
  modulos: string[]
}

export const AREAS: Record<AreaId, AreaConfig> = {
  cromatografia: {
    id: 'cromatografia',
    nombre: 'Cromatografía',
    colorPrimario: '#B3394A',
    colorOscuro: '#6E2029',
    fondo: backgroundLab,
    modulos: ['converter', 'ingest'],
  },
  postcosecha: {
    id: 'postcosecha',
    nombre: 'Postcosecha',
    colorPrimario: '#1C7FA6',
    colorOscuro: '#124D63',
    fondo: backgroundAccutab,
    modulos: ['trace'],
  },
}

export const LISTA_AREAS = Object.values(AREAS)
