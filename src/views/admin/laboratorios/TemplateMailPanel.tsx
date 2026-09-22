import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  guardarTemplateMail,
  guardarTemplateMailReanalisis,
  obtenerTemplateMail,
  obtenerTemplateMailReanalisis,
} from '@/features/laboratorios'
import type { TemplateMail } from '@/features/laboratorios'
import styles from './LaboratoriosView.module.css'

type TipoTemplate = 'analisis' | 'reanalisis'

interface TemplateMailPanelProps {
  laboratorio: string
  onError: (mensaje: string | null) => void
}

interface EditorProps {
  laboratorio: string
  tipo: TipoTemplate
  onError: (mensaje: string | null) => void
}

function TemplateEditor({ laboratorio, tipo, onError }: EditorProps) {
  const [template, setTemplate] = useState<TemplateMail | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    let vigente = true
    setTemplate(null)
    setGuardado(false)
    const cargar = tipo === 'reanalisis' ? obtenerTemplateMailReanalisis : obtenerTemplateMail
    cargar(laboratorio)
      .then((datos) => { if (vigente) setTemplate(datos) })
      .catch(() => { if (vigente) onError('No se pudo cargar el template del correo.') })
    return () => { vigente = false }
  }, [laboratorio, tipo, onError])

  async function guardar() {
    if (!template || !template.asunto.trim() || !template.cuerpo.trim()) return
    setGuardando(true)
    setGuardado(false)
    onError(null)
    try {
      const guardarFn = tipo === 'reanalisis' ? guardarTemplateMailReanalisis : guardarTemplateMail
      setTemplate(await guardarFn(laboratorio, {
        asunto: template.asunto,
        cuerpo: template.cuerpo,
      }))
      setGuardado(true)
    } catch {
      onError('No se pudo guardar. Revisa que las variables estén escritas exactamente como aparecen abajo.')
    } finally {
      setGuardando(false)
    }
  }

  function insertar(variable: string) {
    if (!template) return
    setTemplate({ ...template, cuerpo: `${template.cuerpo}{${variable}}` })
    setGuardado(false)
  }

  if (!template) return <p className={styles.estado}>Cargando template…</p>

  return (
    <>
      <label className={styles.campoTemplate}>
        <span>Asunto</span>
        <input
          className={styles.input}
          value={template.asunto}
          onChange={(e) => { setTemplate({ ...template, asunto: e.target.value }); setGuardado(false) }}
        />
      </label>

      <label className={styles.campoTemplate}>
        <span>Cuerpo del correo</span>
        <textarea
          className={styles.textareaTemplate}
          rows={12}
          value={template.cuerpo}
          onChange={(e) => { setTemplate({ ...template, cuerpo: e.target.value }); setGuardado(false) }}
        />
      </label>

      <div>
        <span className={styles.variablesTitulo}>Insertar variable</span>
        <div className={styles.variablesTemplate}>
          {template.variables.map((variable) => (
            <button key={variable} type="button" onClick={() => insertar(variable)}>
              {`{${variable}}`}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.formAcciones}>
        {guardado && <span className={styles.guardadoTemplate}>Template guardado</span>}
        <Button onClick={guardar} disabled={guardando || !template.asunto.trim() || !template.cuerpo.trim()}>
          {guardando ? 'Guardando…' : 'Guardar template'}
        </Button>
      </div>
    </>
  )
}

export function TemplateMailPanel({ laboratorio, onError }: TemplateMailPanelProps) {
  const [tipo, setTipo] = useState<TipoTemplate>('analisis')

  return (
    <section className={styles.templatePanel}>
      <div>
        <h3 className={styles.seccionTitulo}>Template mail de solicitudes</h3>
        <p className={styles.seccionNota}>
          Este texto acompaña el PDF y el Excel. Cada variable será reemplazada con los datos de la solicitud.
        </p>
      </div>

      <div className={styles.templateTabs}>
        <button
          type="button"
          className={tipo === 'analisis' ? styles.templateTabActivo : styles.templateTab}
          onClick={() => setTipo('analisis')}
        >
          Solicitud de análisis
        </button>
        <button
          type="button"
          className={tipo === 'reanalisis' ? styles.templateTabActivo : styles.templateTab}
          onClick={() => setTipo('reanalisis')}
        >
          Reanálisis
        </button>
      </div>

      <TemplateEditor
        key={`${laboratorio}-${tipo}`}
        laboratorio={laboratorio}
        tipo={tipo}
        onError={onError}
      />
    </section>
  )
}
