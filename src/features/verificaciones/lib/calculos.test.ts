import { describe, expect, it } from 'vitest'
import {
  borradorVacio,
  calcularBalanza,
  calcularDetector,
  calcularDia,
  calcularFugas,
  calcularGas,
  calcularInyector,
  calcularMicropipeta,
  calcularTemperatura,
  factorZ,
  registroABorrador,
  resultadoDelDia,
  resumir,
} from './calculos'
import type { ConfigVerificaciones, Registro } from './tipos'

/**
 * Estos casos son los MISMOS que prueba `backend/tests/test_verificaciones.py`.
 * Están duplicados a propósito: el cálculo vive en los dos lados —el servidor
 * decide, la pantalla adelanta— y si una versión se desviara de la otra, un
 * usuario vería verde algo que se guarda rojo. Probar los dos contra los
 * mismos números es lo que hace que esa desviación salte.
 */

const TABLA_Z = [
  { temperatura: 18, factor: 1.0022 },
  { temperatura: 20, factor: 1.0026 },
  { temperatura: 25, factor: 1.0037 },
]

const CONFIG: ConfigVerificaciones = {
  micropipetas: [
    { id: 1, nombre: 'Microman E1000', codigo: '', volumen_nominal: 900, tolerancia: 8, orden: 1, activo: true },
    { id: 2, nombre: 'Microman E100', codigo: '', volumen_nominal: 100, tolerancia: 1, orden: 2, activo: true },
    { id: 3, nombre: 'Retirada', codigo: '', volumen_nominal: 500, tolerancia: 5, orden: 3, activo: false },
  ],
  pesas: [{ id: 1, nombre: '1 g', codigo: '', valor_nominal: 1, tolerancia: 0.03, orden: 1, activo: true }],
  puntos_temperatura: [
    { id: 1, nombre: 'Sala', codigo: '', minimo: 15, maximo: 25, orden: 1, activo: true },
    { id: 2, nombre: 'Congelador', codigo: '', minimo: -20, maximo: -18, orden: 2, activo: true },
  ],
  gases: [{ id: 1, nombre: 'Helio BIP', codigo: '', orden: 1, activo: true }],
  metodos: [{ id: 1, nombre: 'ECD_Pes', orden: 1, activo: true }],
  parametros: [
    { clave: 'gas_presion_contenido_min', valor: 200, descripcion: '', unidad: 'psi', orden: 1 },
    { clave: 'gas_presion_trabajo_min', valor: 80, descripcion: '', unidad: 'psi', orden: 2 },
    { clave: 'gas_presion_trabajo_max', valor: 120, descripcion: '', unidad: 'psi', orden: 3 },
    { clave: 'perla_voltaje_min', valor: 0, descripcion: '', unidad: 'V', orden: 4 },
    { clave: 'perla_voltaje_max', valor: 1, descripcion: '', unidad: 'V', orden: 5 },
    { clave: 'output_min', valor: 19, descripcion: '', unidad: '', orden: 6 },
    { clave: 'output_max', valor: 22, descripcion: '', unidad: '', orden: 7 },
  ],
  tabla_z: TABLA_Z,
  columnas_config: {},
}

describe('factor Z del agua', () => {
  it('sale de la tabla', () => {
    expect(factorZ(20, TABLA_Z)).toBe(1.0026)
  })

  it('redondea la temperatura al grado, igual que el Excel', () => {
    expect(factorZ(19.7, TABLA_Z)).toBe(1.0026)
  })

  it('sin temperatura no hay factor', () => {
    expect(factorZ(null, TABLA_Z)).toBeNull()
  })

  it('fuera de la tabla no inventa un factor', () => {
    // Un Z inventado daría un volumen inventado, y ese volumen es el que
    // decide si la micropipeta se acepta.
    expect(factorZ(40, TABLA_Z)).toBeNull()
  })
})

describe('micropipetas', () => {
  // Los pesos van en gramos (lo que muestra la balanza analítica).
  // Vol (µL) = masa_g × 1000 × Z(µL/mg).

  it('acepta lo que está dentro de tolerancia', () => {
    // 0.9 g × 1000 × 1 = 900 µL, desv = 0 ≤ 8 → Aceptable
    expect(calcularMicropipeta([0.9, 0.9, 0.9], 1, 900, 8).resultado).toBe('Aceptable')
  })

  it('rechaza lo que se pasa', () => {
    // 0.880 g × 1000 × 1 = 880 µL, desv = 20 > 8 → No aceptable
    const r = calcularMicropipeta([0.88, 0.88, 0.88], 1, 900, 8)
    expect(r.resultado).toBe('No aceptable')
    expect(r.desviacion).toBeCloseTo(20, 2)
  })

  it('el borde de la tolerancia es aceptable', () => {
    // 0.892 g × 1000 × 1 = 892 µL, desv = 8 = tolerancia → Aceptable
    expect(calcularMicropipeta([0.892, 0.892, 0.892], 1, 900, 8).resultado).toBe('Aceptable')
  })

  it('aplica el factor Z', () => {
    // 0.890 g a 25 °C: 0.890 × 1000 × 1.0037 = 893.293 µL
    // Sin corregir por Z sería 890 µL → rechazada por 10 µL que no existen.
    const r = calcularMicropipeta([0.890, 0.890, 0.890], 1.0037, 900, 8)
    expect(r.volumen_medio).toBeCloseTo(893.293, 2)
    expect(r.resultado).toBe('Aceptable')
  })

  it('con menos de tres pesadas no concluye', () => {
    expect(calcularMicropipeta([0.9, 0.9, null], 1, 900, 8).resultado).toBe('')
  })

  it('sin factor Z no concluye, y eso no es un rechazo', () => {
    expect(calcularMicropipeta([0.9, 0.9, 0.9], null, 900, 8).resultado).toBe('')
  })
})

describe('balanza', () => {
  it('convierte las lecturas de gramos a miligramos antes de evaluar', () => {
    const calculo = calcularBalanza([0.0999, 0.0999, 0.0999], 100, 0.016)
    expect(calculo.promedio).toBe(99.9)
    expect(calculo.resultado).toBe('No aceptable')
  })

  it('rechaza fuera de tolerancia', () => {
    expect(calcularBalanza([0.1001, 0.1001, 0.1001], 100, 0.03).resultado).toBe('No aceptable')
  })

  it('con menos de tres lecturas no concluye', () => {
    expect(calcularBalanza([0.1, null, null], 100, 0.03).resultado).toBe('')
  })
})

describe('temperatura', () => {
  it.each([
    [20, 'Aceptable'],
    [15, 'Aceptable'],
    [25, 'Aceptable'],
    [14.9, 'No aceptable'],
    [26, 'No aceptable'],
  ])('%s °C en un rango de 15 a 25 da %s', (lectura, esperado) => {
    expect(calcularTemperatura(lectura, 15, 25)).toBe(esperado)
  })

  it('funciona con rangos bajo cero', () => {
    // Con negativos es fácil escribir la comparación al revés.
    expect(calcularTemperatura(-19, -20, -18)).toBe('Aceptable')
    expect(calcularTemperatura(-17, -20, -18)).toBe('No aceptable')
  })

  it('sin lectura no concluye', () => {
    expect(calcularTemperatura(null, 15, 25)).toBe('')
  })
})

describe('gases', () => {
  it('acepta un cilindro en criterio', () => {
    expect(calcularGas(500, 100, 200, 80, 120)).toBe('Aceptable')
  })

  it('rechaza poco contenido', () => {
    expect(calcularGas(150, 100, 200, 80, 120)).toBe('No aceptable')
  })

  it('rechaza presión de trabajo alta', () => {
    expect(calcularGas(500, 130, 200, 80, 120)).toBe('No aceptable')
  })

  it('media medición no alcanza para aprobar un cilindro', () => {
    expect(calcularGas(500, null, 200, 80, 120)).toBe('')
  })

  it('las fugas se responden al revés: lo bueno es No', () => {
    expect(calcularFugas('No')).toBe('Aceptable')
    expect(calcularFugas('Sí')).toBe('No aceptable')
    expect(calcularFugas('')).toBe('')
  })
})

describe('inyector', () => {
  it('aguja sana y limpia', () => {
    expect(calcularInyector('Sí', 'No', 'No')).toBe('Aceptable')
  })

  it('aguja dañada pero reemplazada', () => {
    expect(calcularInyector('Sí', 'Sí', 'Sí')).toBe('Aceptable')
  })

  it('aguja dañada sin reemplazar', () => {
    expect(calcularInyector('Sí', 'Sí', 'No')).toBe('No aceptable')
  })

  it('sin limpiar', () => {
    expect(calcularInyector('No', 'No', 'No')).toBe('No aceptable')
  })

  it('sin responder no concluye', () => {
    expect(calcularInyector('', '', '')).toBe('')
  })
})

describe('detector', () => {
  it('todo en rango', () => {
    expect(calcularDetector(0.86, 'Sí', 20.3, 0, 1, 19, 22).resultado).toBe('Aceptable')
  })

  it('output fuera de rango tumba la sección', () => {
    const r = calcularDetector(0.86, 'Sí', 25, 0, 1, 19, 22)
    expect(r.resultado_output).toBe('No aceptable')
    expect(r.resultado).toBe('No aceptable')
  })

  it('método vacío no concluye (sin medir)', () => {
    // Antes era Sí/No; ahora es texto libre: vacío = sin medir, cualquier nombre = aceptable.
    expect(calcularDetector(0.86, '', 20.3, 0, 1, 19, 22).resultado_metodo).toBe('')
  })

  it('cualquier nombre de método da aceptable', () => {
    expect(calcularDetector(0.86, 'ECD', 20.3, 0, 1, 19, 22).resultado_metodo).toBe('Aceptable')
  })

  it('vacío no concluye', () => {
    expect(calcularDetector(null, '', null, 0, 1, 19, 22).resultado).toBe('')
  })
})

describe('resumen', () => {
  it('un no aceptable manda sobre todo', () => {
    expect(resumir(['Aceptable', 'Aceptable', 'No aceptable'])).toBe('No aceptable')
  })

  it('sin mediciones no queda aprobado por omisión', () => {
    expect(resumir(['', ''])).toBe('')
  })

  it('el día sin nada medido dice "Sin datos"', () => {
    expect(resultadoDelDia(['', '', '', '', '', ''])).toBe('Sin datos')
  })

  it('el día a medio llenar pero todo bien es aceptable', () => {
    expect(resultadoDelDia(['Aceptable', '', ''])).toBe('Aceptable')
  })
})

describe('borrador del día', () => {
  it('trae una fila por equipo activo y ninguna por los desactivados', () => {
    const borrador = borradorVacio(CONFIG)
    expect(borrador.micropipetas.map((m) => m.micropipeta_id)).toEqual([1, 2])
    expect(borrador.temperaturas).toHaveLength(2)
    expect(borrador.temperatura_agua).toBeNull()
  })

  it('un día en blanco no da ningún veredicto', () => {
    const previa = calcularDia(borradorVacio(CONFIG), CONFIG)
    expect(previa.resultado).toBe('Sin datos')
    expect(previa.secciones.micropipetas).toBe('')
  })

  it('calcula el día entero desde lo que hay escrito', () => {
    const borrador = borradorVacio(CONFIG)
    borrador.temperatura_agua = 20
    borrador.micropipetas[0] = { ...borrador.micropipetas[0], peso_1: 500, peso_2: 500, peso_3: 500 }
    borrador.fugas_visibles = 'No'

    const previa = calcularDia(borrador, CONFIG)
    expect(previa.factor_z).toBe(1.0026)
    // 500 mg × 1.0026 = 501,3 µL contra 900 nominales: muy fuera de tolerancia.
    expect(previa.micropipetas.get(1)?.resultado).toBe('No aceptable')
    expect(previa.secciones.micropipetas).toBe('No aceptable')
    expect(previa.secciones.gases).toBe('Aceptable')
    expect(previa.resultado).toBe('No aceptable')
  })

  it('una fuga visible tumba la sección de gases aunque los cilindros estén bien', () => {
    const borrador = borradorVacio(CONFIG)
    borrador.gases[0] = { ...borrador.gases[0], presion_contenido: 500, presion_trabajo: 100 }
    borrador.fugas_visibles = 'Sí'
    expect(calcularDia(borrador, CONFIG).secciones.gases).toBe('No aceptable')
  })
})

describe('un registro guardado, vuelto formulario', () => {
  const REGISTRO: Registro = {
    fecha: '2026-09-01',
    temperatura_agua: 20,
    factor_z: 1.0026,
    fugas_visibles: 'No',
    fugas_observacion: '',
    resultado_fugas: 'Aceptable',
    observaciones: 'Sin novedad',
    revisado_por: 'Romina Garrido',
    analista: 'Paz Salazar',
    editado_por: null,
    editado_en: null,
    observacion_edicion: '',
    creado_por: 'Paz Salazar',
    actualizado_en: '2026-09-01T12:00:00Z',
    micropipetas: [
      {
        micropipeta_id: 2,
        analista: 'Paz Salazar',
        peso_1: 0.1,
        peso_2: 0.1,
        peso_3: 0.1,
        nombre: 'Microman E100',
        volumen_nominal: 100,
        tolerancia: 1,
        volumen_medio: 100.26,
        desviacion: 0.26,
        error_pct: 0.26,
        resultado: 'Aceptable',
        observacion: '',
      },
    ],
    balanza: [],
    temperaturas: [],
    gases: [],
    inyector: {
      analista: 'Paz Salazar',
      limpieza_aguja: 'Sí',
      aguja_danada: 'No',
      aguja_reemplazada: '',
      cambio_septa: 'No',
      observaciones: '',
      resultado: 'Aceptable',
      metodo_nombre: '',
      observacion: '',
    },
    detector: {
      analista: 'Paz Salazar',
      voltaje_perla: 0.86,
      metodo_correcto: 'Sí',
      output_detector: 20.3,
      resultado_voltaje: 'Aceptable',
      resultado_metodo: 'Aceptable',
      resultado_output: 'Aceptable',
      resultado: 'Aceptable',
      metodo_nombre: '',
      observacion: '',
    },
    resultados_seccion: {
      micropipetas: 'Aceptable',
      balanza: '',
      temperatura: '',
      gases: 'Aceptable',
      inyector: 'Aceptable',
      detector: 'Aceptable',
    },
    resultado: 'Aceptable',
  }

  it('rellena lo medido y deja en blanco lo que no se midió', () => {
    const borrador = registroABorrador(REGISTRO, CONFIG)
    const medida = borrador.micropipetas.find((m) => m.micropipeta_id === 2)
    const sinMedir = borrador.micropipetas.find((m) => m.micropipeta_id === 1)
    expect(medida?.peso_1).toBe(0.1)
    expect(medida?.analista).toBe('Paz Salazar')
    expect(sinMedir?.peso_1).toBeNull()
  })

  it('un equipo agregado al catálogo después del día aparece igual, listo para llenar', () => {
    // Si solo se pintaran las mediciones guardadas, ese equipo faltaría en la
    // pantalla y no habría forma de registrarlo al corregir un día viejo.
    const borrador = registroABorrador(REGISTRO, CONFIG)
    expect(borrador.micropipetas.map((m) => m.micropipeta_id)).toContain(1)
  })

  it('conserva una medición de un equipo que después se desactivó', () => {
    // Si se perdiera, volver a guardar ese día la borraría sin que nadie lo pida.
    const conRetirada: Registro = {
      ...REGISTRO,
      micropipetas: [
        ...REGISTRO.micropipetas,
        { ...REGISTRO.micropipetas[0], micropipeta_id: 3, nombre: 'Retirada', peso_1: 500, peso_2: 500, peso_3: 500 },
      ],
    }
    const borrador = registroABorrador(conRetirada, CONFIG)
    expect(borrador.micropipetas.map((m) => m.micropipeta_id)).toContain(3)
  })

  it('no arrastra los veredictos del servidor al formulario', () => {
    // El borrador es lo que se manda de vuelta al guardar: si llevara el
    // resultado adentro, la pantalla estaría proponiendo su propio veredicto.
    const borrador = registroABorrador(REGISTRO, CONFIG)
    expect('resultado' in borrador.inyector).toBe(false)
    expect('resultado' in borrador.detector).toBe(false)
  })
})
