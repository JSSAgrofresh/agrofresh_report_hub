import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

const base: P = {
  viewBox: '0 0 24 24',
  width: 18,
  height: 18,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export const IconoBuscar = (p: P) => (
  <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
)
export const IconoCerrar = (p: P) => (
  <svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>
)
export const IconoDescargar = (p: P) => (
  <svg {...base} {...p}><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" /><path d="M5 19.5h14" /></svg>
)
export const IconoOjo = (p: P) => (
  <svg {...base} {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></svg>
)
export const IconoLapiz = (p: P) => (
  <svg {...base} {...p}><path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z" /><path d="M14.5 6.5l3 3" /></svg>
)
export const IconoPapelera = (p: P) => (
  <svg {...base} {...p}><path d="M4.5 7h15M9.5 7V4.5h5V7" /><path d="M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" /><path d="M10 11v6M14 11v6" /></svg>
)
export const IconoCandado = (p: P) => (
  <svg {...base} {...p}><rect x="5.5" y="10.5" width="13" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>
)
export const IconoPdf = (p: P) => (
  <svg {...base} {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></svg>
)
export const IconoCarpeta = (p: P) => (
  <svg {...base} {...p}><path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2.5h8A1.5 1.5 0 0 1 20.5 10v8A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z" /></svg>
)
export const IconoInicio = (p: P) => (
  <svg {...base} {...p}><path d="M4 11l8-6.5 8 6.5" /><path d="M6 10v9.5h12V10" /></svg>
)
export const IconoActualizar = (p: P) => (
  <svg {...base} {...p}><path d="M19.5 12a7.5 7.5 0 1 1-2.3-5.4" /><path d="M19.5 4.5v4h-4" /></svg>
)
export const IconoFlecha = (p: P & { sentido?: 'asc' | 'desc' | null }) => {
  const { sentido, ...resto } = p
  return (
    <svg {...base} width={12} height={12} strokeWidth={2.2} {...resto}>
      <path d="M12 5v14M7 10l5-5 5 5" opacity={sentido === 'desc' ? 0.28 : 1} />
      <path d="M7 14l5 5 5-5" opacity={sentido === 'asc' ? 0.28 : sentido === 'desc' ? 1 : 0.28} />
    </svg>
  )
}
export const IconoAlerta = (p: P) => (
  <svg {...base} {...p}><path d="M12 4.5l8.5 15h-17z" /><path d="M12 10v4.2M12 16.9v.1" /></svg>
)
export const IconoExcel = (p: P) => (
  <svg {...base} {...p}><rect x="4.5" y="4" width="15" height="16" rx="2" /><path d="M4.5 9.5h15M4.5 14.5h15M10 4v16" /></svg>
)
