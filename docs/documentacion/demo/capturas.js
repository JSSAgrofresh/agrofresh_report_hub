const { chromium } = require('playwright');
const OUT = '/home/user/agrofresh_report_hub/docs/documentacion/capturas/';
const BASE = 'http://127.0.0.1:5173';
const admin = [
  ['01_inicio', '/'], ['02_agrofresh_lab', '/modulos/agrofresh-lab'], ['03_verificaciones', '/modulos/agrofresh-lab/verificaciones'],
  ['04_ingreso_lab', '/modulos/agrofresh-lab/ingreso'], ['05_envio_informes', '/modulos/agrofresh-lab/envio-informes'],
  ['06_toma_muestras', '/modulos/toma-muestras'], ['07_nueva_solicitud', '/modulos/toma-muestras/nueva'],
  ['08_ingreso_informes', '/modulos/ingesta'], ['09_report', '/modulos/reportes/laboratorio'],
  ['10_panel_control', '/modulos/auditoria-interna'], ['11_solicitudes_informes', '/modulos/auditoria-interna/solicitudes'],
  ['12_rendimiento_calidad', '/modulos/auditoria-interna/rendimiento-calidad'], ['13_vista_limites', '/modulos/auditoria-interna/limite-control'],
  ['14_post_venta', '/modulos/trace'], ['15_storage', '/modulos/storage'], ['16_usuarios', '/admin/usuarios'],
  ['17_listados', '/admin/listados'], ['18_laboratorios', '/admin/laboratorios'], ['19_administracion_general', '/admin/administracion-general'],
  ['20_monitoreo', '/monitoreo'], ['21_vista_cliente', '/vista-cliente/reportes'],
];
async function login(page, email, pass) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', pass);
  await page.click('button[type=submit]'); await page.waitForTimeout(2500);
}
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, locale: 'es-CL' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + '00_login.png' });
  await login(page, 'jorge.sandoval@agrofresh.com', process.env.DEMO_CLAVE);
  console.log('url tras login', page.url());
  for (const [n, r] of admin) {
    try {
      await page.goto(BASE + r, { waitUntil: 'networkidle', timeout: 25000 }); await page.waitForTimeout(1800);
      await page.screenshot({ path: OUT + n + '.png' }); console.log('ok', n, page.url().replace(BASE, ''));
    } catch (e) { console.log('FALLO', n, String(e).slice(0, 80)); }
  }
  const c2 = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  const p2 = await c2.newPage();
  await login(p2, 'cliente.demo@ejemplo.cl', process.env.DEMO_CLAVE);
  await p2.goto(BASE + '/modulos/reportes/laboratorio', { waitUntil: 'networkidle' }); await p2.waitForTimeout(3000);
  await p2.screenshot({ path: OUT + '30_portal_cliente.png' });
  await p2.evaluate(() => window.scrollBy(0, 1400)); await p2.waitForTimeout(1200);
  await p2.screenshot({ path: OUT + '31_portal_cliente_graficos.png' });
  const c3 = await b.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, isMobile: true });
  const p3 = await c3.newPage();
  await login(p3, 'cliente.demo@ejemplo.cl', process.env.DEMO_CLAVE);
  await p3.goto(BASE + '/modulos/reportes/laboratorio', { waitUntil: 'networkidle' }); await p3.waitForTimeout(3000);
  await p3.screenshot({ path: OUT + '32_portal_telefono.png' });
  await b.close();
})();
