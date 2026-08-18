import styles from './DataCoreView.module.css'

interface Entidad {
  nombre: string
  x: number
  y: number
  w: number
  campos: string[]
}

interface Relacion {
  de: string
  a: string
  etiqueta: string
}

const ENTIDADES: Entidad[] = [
  { nombre: 'cliente', x: 20, y: 20, w: 190, campos: ['id PK', 'nombre', 'codigo_sap'] },
  { nombre: 'planta', x: 20, y: 170, w: 190, campos: ['id PK', 'cliente_id FK', 'nombre'] },
  { nombre: 'equipo_accutab', x: 20, y: 320, w: 190, campos: ['id PK', 'planta_id FK', 'codigo_equipo'] },
  { nombre: 'lectura_accutab', x: 20, y: 470, w: 190, campos: ['id PK', 'equipo_id FK', 'parametro', 'valor'] },
  {
    nombre: 'solicitud',
    x: 300,
    y: 150,
    w: 230,
    campos: ['id PK', 'planta_id FK', 'nro_solicitud', 'laboratorio', 'especie / variedad', 'tipo_servicio', 'fecha_muestreo'],
  },
  { nombre: 'resultado', x: 300, y: 400, w: 210, campos: ['id PK', 'solicitud_id FK', 'analito_id FK', 'valor_num / valor_texto'] },
  {
    nombre: 'producto_aplicado',
    x: 560,
    y: 400,
    w: 230,
    campos: ['id PK', 'solicitud_id FK', 'analito_id FK', 'tipo_aplicacion', 'dosis'],
  },
  {
    nombre: 'analito',
    x: 830,
    y: 250,
    w: 200,
    campos: ['id PK', 'codigo', 'nombre', 'laboratorio', 'unidad'],
  },
  { nombre: 'analito_limite', x: 830, y: 470, w: 200, campos: ['id PK', 'analito_id FK', 'especie', 'tipo_servicio', 'limite_min/central/max'] },
]

const RELACIONES: Relacion[] = [
  { de: 'cliente', a: 'planta', etiqueta: '1—N' },
  { de: 'planta', a: 'equipo_accutab', etiqueta: '1—N' },
  { de: 'equipo_accutab', a: 'lectura_accutab', etiqueta: '1—N' },
  { de: 'planta', a: 'solicitud', etiqueta: '1—N' },
  { de: 'solicitud', a: 'resultado', etiqueta: '1—N' },
  { de: 'solicitud', a: 'producto_aplicado', etiqueta: '1—N' },
  { de: 'resultado', a: 'analito', etiqueta: 'N—1' },
  { de: 'producto_aplicado', a: 'analito', etiqueta: 'N—1' },
  { de: 'analito', a: 'analito_limite', etiqueta: '1—N' },
]

const ALTO_CAMPO = 20
const ALTO_TITULO = 30

function altoEntidad(e: Entidad) {
  return ALTO_TITULO + e.campos.length * ALTO_CAMPO + 10
}

function puntoConexion(mapa: Map<string, Entidad>, nombre: string, lado: 'derecha' | 'izquierda' | 'abajo' | 'arriba') {
  const e = mapa.get(nombre)
  if (!e) return { x: 0, y: 0 }
  const h = altoEntidad(e)
  switch (lado) {
    case 'derecha':
      return { x: e.x + e.w, y: e.y + h / 2 }
    case 'izquierda':
      return { x: e.x, y: e.y + h / 2 }
    case 'abajo':
      return { x: e.x + e.w / 2, y: e.y + h }
    case 'arriba':
      return { x: e.x + e.w / 2, y: e.y }
  }
}

export function ErDiagrama() {
  const mapa = new Map(ENTIDADES.map((e) => [e.nombre, e]))

  return (
    <div className={styles.erWrap}>
      <svg viewBox="0 0 1080 640" className={styles.erSvg} role="img" aria-label="Modelo entidad-relación de la base de datos">
        <defs>
          <marker id="flecha" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-text-faint)" />
          </marker>
        </defs>

        {RELACIONES.map((r) => {
          const de = mapa.get(r.de)!
          const a = mapa.get(r.a)!
          const vertical = Math.abs(de.x - a.x) < 40
          const p1 = vertical
            ? puntoConexion(mapa, r.de, de.y < a.y ? 'abajo' : 'arriba')
            : puntoConexion(mapa, r.de, de.x < a.x ? 'derecha' : 'izquierda')
          const p2 = vertical
            ? puntoConexion(mapa, r.a, de.y < a.y ? 'arriba' : 'abajo')
            : puntoConexion(mapa, r.a, de.x < a.x ? 'izquierda' : 'derecha')
          const medio = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
          return (
            <g key={`${r.de}-${r.a}`}>
              <path
                d={`M${p1.x},${p1.y} C ${(p1.x + p2.x) / 2},${p1.y} ${(p1.x + p2.x) / 2},${p2.y} ${p2.x},${p2.y}`}
                className={styles.erLinea}
                markerEnd="url(#flecha)"
              />
              <rect x={medio.x - 16} y={medio.y - 8} width={32} height={16} className={styles.erEtiquetaFondo} />
              <text x={medio.x} y={medio.y + 4} className={styles.erEtiqueta} textAnchor="middle">
                {r.etiqueta}
              </text>
            </g>
          )
        })}

        {ENTIDADES.map((e) => (
          <g key={e.nombre}>
            <rect x={e.x} y={e.y} width={e.w} height={altoEntidad(e)} rx="8" className={styles.erCaja} />
            <rect x={e.x} y={e.y} width={e.w} height={ALTO_TITULO} rx="8" className={styles.erTitulo} />
            <rect x={e.x} y={e.y + ALTO_TITULO - 8} width={e.w} height={8} className={styles.erTituloRelleno} />
            <text x={e.x + e.w / 2} y={e.y + 20} textAnchor="middle" className={styles.erNombreTabla}>
              {e.nombre}
            </text>
            {e.campos.map((c, i) => (
              <text key={c} x={e.x + 12} y={e.y + ALTO_TITULO + 15 + i * ALTO_CAMPO} className={styles.erCampo}>
                {c}
              </text>
            ))}
          </g>
        ))}
      </svg>
    </div>
  )
}
