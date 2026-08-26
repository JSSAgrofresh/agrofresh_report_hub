"""
Autorizacion OAuth 2.0 para Gmail API — ejecucion unica por desarrollador/admin.

Genera un refresh_token con el scope gmail.send que luego se agrega al .env
del backend como GMAIL_REFRESH_TOKEN.

Uso:
    cd backend
    pip install google-auth-oauthlib
    python ../scripts/autorizar_gmail.py

El script abre el navegador para que autorices con agrofreshreporthub@gmail.com.
Al finalizar imprime el refresh_token que debes copiar al .env.

NUNCA commits este script con tokens reales adentro.
NUNCA expongas el refresh_token fuera del .env del servidor.
"""
import os
import sys

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    print("ERROR: Instala la dependencia con: pip install google-auth-oauthlib")
    sys.exit(1)

# Scope minimo requerido para enviar correos.
# gmail.send   → enviar correos (notificaciones de solicitudes)
# gmail.modify → leer mensajes y gestionar etiquetas (ingesta AccuTab)
SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
]

print("=" * 60)
print("Autorizacion Gmail API — AgroFresh Report Hub")
print("=" * 60)
print()
print("Necesitas las credenciales OAuth de Google Cloud.")
print("Consiguelas en: APIs & Services > Credentials > OAuth 2.0 Client IDs")
print("Descarga el JSON del cliente Desktop y coloca su ruta abajo,")
print("o ingresa los valores manualmente.")
print()

# Intentar leer de variables de entorno primero
client_id = os.getenv("GMAIL_CLIENT_ID", "").strip()
client_secret = os.getenv("GMAIL_CLIENT_SECRET", "").strip()

if not client_id:
    client_id = input("GMAIL_CLIENT_ID: ").strip()
if not client_secret:
    client_secret = input("GMAIL_CLIENT_SECRET: ").strip()

if not client_id or not client_secret:
    print("ERROR: Se requieren GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET.")
    sys.exit(1)

client_config = {
    "installed": {
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uris": ["http://localhost"],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}

print()
print("Abriendo el navegador para autorizar con agrofreshreporthub@gmail.com...")
print("Si el navegador no se abre automaticamente, copia la URL que aparece.")
print()

flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)
# run_local_server abre el navegador y levanta un servidor local para recibir el callback
creds = flow.run_local_server(port=0, prompt="consent", login_hint="agrofreshreporthub@gmail.com")

print()
print("=" * 60)
print("AUTORIZACION EXITOSA")
print("=" * 60)
print()
print("Copia estas lineas a tu backend/.env:")
print()
print(f"GMAIL_CLIENT_ID={client_id}")
print(f"GMAIL_CLIENT_SECRET={client_secret}")
print(f"GMAIL_REFRESH_TOKEN={creds.refresh_token}")
print(f"GMAIL_ACCOUNT=agrofreshreporthub@gmail.com")
print()
print("IMPORTANTE:")
print("  - Nunca compartas ni hagas commit del GMAIL_REFRESH_TOKEN.")
print("  - Este token es de larga duracion pero puede revocarse desde")
print("    Google Account > Seguridad > Aplicaciones de terceros.")
print("  - Si se revoca, ejecuta este script nuevamente.")
print()
