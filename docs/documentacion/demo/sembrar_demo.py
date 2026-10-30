"""Datos de DEMOSTRACIÓN para sacar capturas: clientes ficticios con la marca (DEMO)."""
import random, sys, datetime as dt
sys.path.insert(0, '.')
import psycopg2
from app import seguridad
random.seed(7)
c = psycopg2.connect(host='/tmp', port=5433, dbname='agrofresh_demo', user='postgres'); c.autocommit = False
cur = c.cursor(); cur.execute("SET search_path = lab, public")
import os
ph = seguridad.hashear_password(os.environ['DEMO_CLAVE'])
cur.execute("""INSERT INTO usuario (email,nombre,tipo_acceso,area,modulos,reportes,password_hash) VALUES
 ('jorge.sandoval@agrofresh.com','Jorge Sandoval','admin_general',NULL,'{}','{}',%s)""", (ph,))
cur.execute("""INSERT INTO usuario (email,nombre,tipo_acceso,area,cliente_nombre,modulos,reportes,password_hash) VALUES
 ('cliente.demo@ejemplo.cl','Cliente Demo','cliente','cromatografia','FRUTAS DEL SUR (DEMO)','{reports,storage}','{laboratorio}',%s)""", (ph,))
clientes = {'FRUTAS DEL SUR (DEMO)': ['PLANTA ROMERAL (DEMO)', 'PLANTA SAN FERNANDO (DEMO)'],
            'EXPORTADORA ANDES (DEMO)': ['PLANTA LONTUE (DEMO)', 'PLANTA RAPEL (DEMO)'],
            'AGRICOLA LOS CERROS (DEMO)': ['PLANTA CHILLAN (DEMO)', 'PLANTA TALCA (DEMO)']}
plantas = []
for n, (cli, pls) in enumerate(clientes.items()):
    cur.execute("INSERT INTO cliente (nombre,codigo_sap,activo) VALUES (%s,%s,true) RETURNING id", (cli, f'10{n}0001'))
    cid = cur.fetchone()[0]
    for k, pl in enumerate(pls):
        cur.execute("INSERT INTO planta (cliente_id,nombre,codigo_sap,activo) VALUES (%s,%s,%s,true) RETURNING id", (cid, pl, f'20{n}{k}001'))
        plantas.append((cur.fetchone()[0], cli, pl))
esp = {'Cerezas': ['Lapins', 'Santina', 'Regina'], 'Manzana': ['Fuji', 'Gala'], 'Pera': ['Packham', 'Abate Fetel'], 'Uva de mesa': ['Thompson', 'Crimson']}
for e, vs in esp.items():
    cur.execute("INSERT INTO valor_lista (tipo,valor,valor_normalizado,activo,es_estandar) VALUES ('especie',%s,%s,true,true) RETURNING id", (e, e.lower()))
    eid = cur.fetchone()[0]
    for v in vs:
        cur.execute("INSERT INTO valor_lista (tipo,valor,valor_normalizado,activo,es_estandar,especie_id) VALUES ('variedad',%s,%s,true,true,%s)", (v, v.lower(), eid))
analitos = {}
def an(cod, nom, lab, uni, cat):
    cur.execute("INSERT INTO analito (codigo,nombre,categoria,laboratorio,unidad,activo) VALUES (%s,%s,%s,%s,%s,true) RETURNING id", (cod, nom, cat, lab, uni))
    analitos[(cod, lab)] = cur.fetchone()[0]
for lab in ('Agrofresh', 'Quiteca'):
    an('FDL', 'Fludioxonil', lab, 'ppm', 'Fungicidas'); an('PYR', 'Pirimetanil', lab, 'ppm', 'Fungicidas'); an('TEBU', 'Tebuconazol', lab, 'ppm', 'Fungicidas')
an('ECOLI100', 'Escherichia coli', 'ALS', 'UFC/100 mL', 'Microbiología'); an('COLIF100', 'Coliformes totales', 'ALS', 'UFC/100 mL', 'Microbiología')
for h in ('Botrytis', 'Alternaria', 'Geotrichum', 'Penicillium'):
    an(h.upper()[:4], h, 'Diagnofruit', 'cel/mL', 'Fitopatología')
hoy = dt.date(2026, 10, 28)
n = 0
def sol(lab, d, pl, especie, var, tipo_srv):
    global n; n += 1
    pid, cli, pln = pl
    cur.execute("""INSERT INTO solicitud (nro_solicitud,laboratorio,fecha_muestreo,fecha_entrada,especie,variedad,semana_muestreo,mes,temporada,tipo_servicio,planta_id,sold_to_raw,ship_to_raw,vigente,origen,referencia,servicio)
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'2026-27',%s,%s,%s,%s,true,'demo',%s,NULL) RETURNING id""",
      (f'{2026}-{1800+n}-DM', lab, d, d + dt.timedelta(days=2), especie, var, d.isocalendar()[1], d.month, tipo_srv, pid, cli, pln, f'OT-DEMO{n:04d}'))
    return cur.fetchone()[0]
for i in range(48):
    d = hoy - dt.timedelta(days=random.randint(2, 70))
    pl = random.choice(plantas); e = random.choice(list(esp)); v = random.choice(esp[e]); lab = random.choice(['Agrofresh', 'Quiteca'])
    sid = sol(lab, d, pl, e, v, 'Línea de proceso')
    for cod in ('FDL', 'PYR', 'TEBU'):
        if random.random() < .8:
            cur.execute("INSERT INTO resultado (solicitud_id,analito_id,valor_num) VALUES (%s,%s,%s)", (sid, analitos[(cod, lab)], round(random.uniform(.02, 2.4), 3)))
for i in range(14):
    d = hoy - dt.timedelta(days=random.randint(2, 70)); pl = random.choice(plantas)
    sid = sol('ALS', d, pl, 'Cerezas', 'Lapins', 'Línea de proceso')
    for cod in ('ECOLI100', 'COLIF100'):
        txt = random.choice(['<1', '<1', '<1', '4', '12', '<1'])
        cur.execute("INSERT INTO resultado (solicitud_id,analito_id,valor_num,valor_texto) VALUES (%s,%s,%s,%s)", (sid, analitos[(cod, 'ALS')], None if txt.startswith('<') else float(txt), txt if txt.startswith('<') else None))
for i in range(14):
    d = hoy - dt.timedelta(days=random.randint(2, 70)); pl = random.choice(plantas); e = random.choice(['Cerezas', 'Uva de mesa'])
    sid = sol('Diagnofruit', d, pl, e, random.choice(esp[e]), 'Línea de proceso')
    for h in ('BOTR', 'ALTE', 'GEOT', 'PENI'):
        cur.execute("INSERT INTO resultado (solicitud_id,analito_id,valor_num,valor_texto) VALUES (%s,%s,%s,%s)", (sid, analitos[(h, 'Diagnofruit')], random.choice([0, 0, 15, 120, 340]), None))
c.commit(); print('sembrado', n, 'informes')
