import backgroundLab from '@/assets/backgrounds/background_lab.jpg'
import backgroundAccutab from '@/assets/backgrounds/background_accutab.jpg'

export type AreaId = 'cromatografia' | 'postventa' | 'ryd' | 'toma_muestras'

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
    colorPrimario: '#3A8A52',
    colorOscuro: '#1E5930',
    fondo: backgroundLab,
    modulos: ['converter', 'ingest', 'reports'],
  },
  postventa: {
    id: 'postventa',
    nombre: 'Post Venta',
    colorPrimario: '#1C7FA6',
    colorOscuro: '#124D63',
    fondo: backgroundAccutab,
    // 'reports' da acceso al hub de Report; qué reporte concreto ve cada
    // usuario lo decide puedeVerReporte (ver features/usuarios/permisos.ts).
    modulos: ['trace', 'reports'],
  },
  ryd: {
    id: 'ryd',
    nombre: 'R y D',
    colorPrimario: '#7B5EA7',
    colorOscuro: '#4A3567',
    fondo: backgroundLab,
    modulos: ['reports', 'agrofresh_lab'],
  },
  toma_muestras: {
    id: 'toma_muestras',
    nombre: 'Toma de Muestras',
    colorPrimario: '#2E9E8A',
    colorOscuro: '#1A6057',
    fondo: backgroundAccutab,
    modulos: ['toma_muestras'],
  },
}

export const LISTA_AREAS = Object.values(AREAS)

/** Área dueña de un módulo (para heredar su color de marca), si tiene una. */
export function areaDeModulo(moduloId: string): AreaConfig | undefined {
  return LISTA_AREAS.find((a) => a.modulos.includes(moduloId))
}
