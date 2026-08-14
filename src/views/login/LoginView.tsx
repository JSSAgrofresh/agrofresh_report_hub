import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import agrofreshLogo from '@/assets/agrofresh-logo.png'
import manzanas from '@/assets/login/manzanas.webp'
import uvas from '@/assets/login/uvas.webp'
import naranjos from '@/assets/login/naranjos.webp'
import { LoginForm } from '@/features/auth'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/cn'
import styles from './LoginView.module.css'

const CARRUSEL = [manzanas, uvas, naranjos]
const INTERVALO_MS = 6000

export function LoginView() {
  const navigate = useNavigate()
  const [indice, setIndice] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setIndice((i) => (i + 1) % CARRUSEL.length), INTERVALO_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={styles.pantalla}>
      <div className={styles.marca}>
        <div className={styles.carrusel} aria-hidden="true">
          {CARRUSEL.map((src, i) => (
            <img key={src} src={src} className={cn(styles.carruselImg, i === indice && styles.carruselImgActiva)} alt="" />
          ))}
          <div className={styles.carruselDegradado} />
        </div>

        <div className={styles.contenido}>
          <img src={agrofreshLogo} alt="AgroFresh" className={styles.logoMarca} />
          <div className={styles.marcaTexto}>
            <h1>Report Hub</h1>
            <p>Plataforma interna de trazabilidad y análisis de residuos de pesticidas en fruta.</p>
          </div>
          <ul className={styles.marcaLista}>
            <li>Trazabilidad de registros pH/ORP</li>
            <li>Homogenización de informes de laboratorio</li>
            <li>Cola de aprobación para cargas de datos</li>
          </ul>

          <div className={styles.carruselDots}>
            {CARRUSEL.map((src, i) => (
              <span key={src} className={cn(styles.dot, i === indice && styles.dotActivo)} />
            ))}
          </div>
        </div>
      </div>

      <div className={styles.panelForm}>
        <div className={styles.tarjeta}>
          <img src={agrofreshLogo} alt="AgroFresh" className={styles.logoTarjeta} />
          <div className={styles.encabezado}>
            <h2>Ingresa a tu cuenta</h2>
            <p>Usa tu correo corporativo de AgroFresh.</p>
          </div>
          <LoginForm onSuccess={() => navigate(ROUTES.dashboard, { replace: true })} />
        </div>
      </div>
    </div>
  )
}
