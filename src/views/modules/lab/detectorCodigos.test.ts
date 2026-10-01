import { afterEach, describe, expect, it, vi } from 'vitest'
import { crearDetectorCodigos, FORMATOS_ESCANER } from './detectorCodigos'

describe('crearDetectorCodigos', () => {
  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).BarcodeDetector
  })

  it('usa el BarcodeDetector nativo cuando el navegador lo trae (Chrome en Android)', async () => {
    const construido = vi.fn()
    class Nativo {
      constructor(opts: { formats: string[] }) {
        construido(opts)
      }
      detect = async () => [{ rawValue: 'OT-AGF0072' }]
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).BarcodeDetector = Nativo
    const d = await crearDetectorCodigos()
    expect(construido).toHaveBeenCalledWith({ formats: FORMATOS_ESCANER })
    expect(await d.detect(document.createElement('video'))).toEqual([{ rawValue: 'OT-AGF0072' }])
  })

  it('cubre los formatos de la solicitud (Code 128) y de la muestra', () => {
    expect(FORMATOS_ESCANER).toEqual(expect.arrayContaining(['code_128', 'qr_code']))
  })
})
