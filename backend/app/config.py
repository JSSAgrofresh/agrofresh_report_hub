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
