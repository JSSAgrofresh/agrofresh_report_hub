import { useState } from 'react'
import {
  guardarTemplateMail,
  guardarTemplateMailReanalisis,
  obtenerTemplateMail,
  obtenerTemplateMailReanalisis,
} from '@/features/laboratorios'
import { TemplateMailEditor } from './TemplateMailEditor'
import styles from './LaboratoriosView.module.css'

type TipoTemplate = 'analisis' | 'reanalisis'

interface TemplateMailPanelProps {
  laboratorio: string
  onError: (mensaje: string | null) => void
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

      <TemplateMailEditor
        clave={`${laboratorio}-${tipo}`}
        cargar={() => (tipo === 'reanalisis' ? obtenerTemplateMailReanalisis : obtenerTemplateMail)(laboratorio)}
        guardar={(datos) => (tipo === 'reanalisis' ? guardarTemplateMailReanalisis : guardarTemplateMail)(laboratorio, datos)}
        onError={onError}
      />
    </section>
  )
}
