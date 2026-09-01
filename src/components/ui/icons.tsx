import type { SVGProps } from 'react'

/**
 * Set de iconos propio, trazo fino (currentColor) para no depender de una
 * librería externa y mantener consistencia con el estilo lineal de
 * Trace/Converter.
 */
type IconProps = SVGProps<SVGSVGElement>

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function IconPanel(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  )
}

/** Tabla de datos (estilo "vista de modelo" de Power BI): grilla de filas y
 * columnas, para el módulo que muestra la base de datos completa. */
export function IconDataCore(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3.5" y="4" width="17" height="16" rx="1.5" />
      <path d="M3.5 9.5h17" />
      <path d="M3.5 14.5h17" />
      <path d="M9.5 4v16" />
      <path d="M15 4v16" />
    </svg>
  )
}

export function IconTrace(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 13h3.2l2-5.5 3.6 11 2.4-7.5h2.6" strokeLinejoin="round" />
      <path d="M17.3 13h3.2" />
    </svg>
  )
}

export function IconConverter(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4.5 8.5h13l-3-3" />
      <path d="M19.5 15.5h-13l3 3" />
    </svg>
  )
}

export function IconReports(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 19.5V9" />
      <path d="M12 19.5V4.5" />
      <path d="M19 19.5v-7" />
      <path d="M3.5 19.5h17" />
    </svg>
  )
}

export function IconUser(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="8" r="3.3" />
      <path d="M5 19c1-3.2 3.8-5 7-5s6 1.8 7 5" />
    </svg>
  )
}

export function IconDatabase(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.5" />
      <path d="M5 5.5V18c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5.5" />
      <path d="M5 11.8c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" />
    </svg>
  )
}

export function IconLogout(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 20H5.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1H9" />
      <path d="M15.5 16 20 12l-4.5-4" />
      <path d="M20 12H9" />
    </svg>
  )
}

/** Panel lateral con una flecha: pliega y despliega la barra de navegación.
 *  La flecha se gira con CSS según el estado, así es un solo icono. */
export function IconPanelLateral(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="M15.5 9.5 13 12l2.5 2.5" />
    </svg>
  )
}

export function IconAlerta(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5 21 19.5H3L12 3.5Z" strokeLinejoin="round" />
      <path d="M12 10v4.2" />
      <circle cx="12" cy="17" r="0.15" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconClock(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5l3 2" />
    </svg>
  )
}

export function IconUpload(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 15.5V4.5" />
      <path d="m8 8.5 4-4 4 4" />
      <path d="M4.5 15.5v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3" />
    </svg>
  )
}

export function IconIngest(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
      <path d="M5 12v6c0 1.4 3.1 2.5 7 2.5 1.2 0 2.3-.13 3.2-.36" />
      <path d="M17.5 14.5v6" />
      <path d="m14.7 17.2 2.8 2.8 2.8-2.8" />
    </svg>
  )
}

export function IconTrendingUp(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m3.5 15.5 6-6 4 4 7-7" />
      <path d="M15.5 6h5v5" />
    </svg>
  )
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8.3" r="3" />
      <path d="M3.5 19c.8-2.9 3-4.5 5.5-4.5s4.7 1.6 5.5 4.5" />
      <path d="M15.5 5.3a3 3 0 0 1 0 5.8" />
      <path d="M17.5 14.7c2 .5 3.4 1.9 4 4.3" />
    </svg>
  )
}

export function IconListados(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6h2M4 12h2M4 18h2" />
      <path d="M9 6h11M9 12h11M9 18h11" />
    </svg>
  )
}

export function IconStorage(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 4h16v16H4z" />
      <path d="M4 10h16" />
      <path d="M12 14v4M9.5 16.5 12 14l2.5 2.5" />
    </svg>
  )
}

export function IconCarpeta(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 6.5a1 1 0 0 1 1-1h4.5l2 2H19a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    </svg>
  )
}

export function IconFrasco(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 3h4M10.5 3v5.5L5.5 18a1.5 1.5 0 0 0 1.3 2.2h10.4a1.5 1.5 0 0 0 1.3-2.2L13.5 8.5V3" />
      <path d="M8 15.5h8" />
    </svg>
  )
}

export function IconEmitir(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 20V6M6 12l6-6 6 6" />
      <path d="M5 20h14" />
    </svg>
  )
}

export function IconArchivoPlano(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 3.5h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z" />
      <path d="M14 3.5v4h4" />
    </svg>
  )
}
