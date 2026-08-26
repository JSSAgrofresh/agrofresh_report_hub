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

# Gmail API OAuth 2.0 — proveedor activo de correo saliente
GMAIL_CLIENT_ID = os.getenv("GMAIL_CLIENT_ID", "")
GMAIL_CLIENT_SECRET = os.getenv("GMAIL_CLIENT_SECRET", "")
GMAIL_REFRESH_TOKEN = os.getenv("GMAIL_REFRESH_TOKEN", "")
GMAIL_ACCOUNT = os.getenv("GMAIL_ACCOUNT", "agrofreshreporthub@gmail.com")

R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL", "")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.getenv("R2_BUCKET", "agrofresh-storage")
