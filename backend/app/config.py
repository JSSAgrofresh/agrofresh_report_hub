import os

from dotenv import load_dotenv

load_dotenv()

# Si DATABASE_URL está definida (Neon/Supabase/Render) se usa directamente.
# Si no, se construye a partir de los parámetros individuales (desarrollo local).
DATABASE_URL = os.getenv("DATABASE_URL")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "agrofresh")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

# Carpeta donde el módulo Storage guarda los archivos subidos. En el servidor de
# AgroFresh es una ruta fija de Windows (ver backend/.env); si no se configura,
# cae a una carpeta "storage" junto al backend (útil para desarrollo).
STORAGE_DIR = os.getenv("STORAGE_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "storage"))

MAIL_USER = os.getenv("MAIL_USER", "")
MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "")
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")

# Gmail SMTP — proveedor activo de correo saliente
# Genera la App Password en: myaccount.google.com/apppasswords
# Requiere verificación en 2 pasos activa en la cuenta Gmail.
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
GMAIL_ACCOUNT = os.getenv("GMAIL_ACCOUNT", "agrofreshreporthub@gmail.com")

# Gmail OAuth2 — para leer correos entrantes (AccuTab mail ingest)
# Credenciales de la Google Cloud Console (proyecto con Gmail API habilitada).
GMAIL_CLIENT_ID = os.getenv("GMAIL_CLIENT_ID", "")
GMAIL_CLIENT_SECRET = os.getenv("GMAIL_CLIENT_SECRET", "")
GMAIL_REFRESH_TOKEN = os.getenv("GMAIL_REFRESH_TOKEN", "")

R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL", "")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.getenv("R2_BUCKET", "agrofresh-storage")

# Bucket de Auditoría interna: guarda los PDF de los informes de laboratorio
# (<laboratorio>/<ship to>/<archivo>.pdf). Es un bucket aparte del de
# Storage/solicitudes. Usa el mismo endpoint y las mismas llaves de R2 salvo
# que se definan las R2_AUDITORIA_* (útil si el token de R2 se limitó al bucket).
R2_AUDITORIA_BUCKET = os.getenv("R2_AUDITORIA_BUCKET", "auditoria")
R2_AUDITORIA_ENDPOINT_URL = os.getenv("R2_AUDITORIA_ENDPOINT_URL", "") or R2_ENDPOINT_URL
R2_AUDITORIA_ACCESS_KEY_ID = os.getenv("R2_AUDITORIA_ACCESS_KEY_ID", "") or R2_ACCESS_KEY_ID
R2_AUDITORIA_SECRET_ACCESS_KEY = os.getenv("R2_AUDITORIA_SECRET_ACCESS_KEY", "") or R2_SECRET_ACCESS_KEY

# Única cuenta que puede crear solicitudes de prueba (Toma de muestras →
# Solicitudes → "Solicitud de prueba"). No es una credencial: solo decide a
# quién se le muestra el botón. Se puede cambiar en el .env del backend.
SOLICITUDES_PRUEBA_EMAIL = os.getenv("SOLICITUDES_PRUEBA_EMAIL", "jorge.sandoval@agrofresh.com").strip().lower()
