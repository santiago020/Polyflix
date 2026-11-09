/* POLYFIX · Reportes en la nube
   Lee las tablas `reportes` y `proceso` de Supabase por la API REST (PostgREST)
   con la clave anónima, y permite filtrar y descargar en CSV (Excel), JSON y PDF. */
(() => {
'use strict';
const CFG = window.POLYFIX_CONFIG || {};
const TZ = CFG.ZONA_HORARIA || 'America/Bogota';
const $ = s => document.querySelector(s);
const LS = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};

/* ---------- conexion ---------- */
const conn = {
  url: LS.get('pf_url') || CFG.SUPABASE_URL || '',
  key: LS.get('pf_key') || CFG.SUPABASE_ANON_KEY || '',
  demo: false
};
conn.demo = !conn.key || LS.get('pf_demo') === '1';

async function sb(tabla, params){
  const u = `${conn.url.replace(/\/$/,'')}/rest/v1/${tabla}?${params}`;
  const r = await fetch(u, { headers: { apikey: conn.key, Authorization: `Bearer ${conn.key}` } });
  if(!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
function setConn(state, txt){
  const c = $('#conn'); c.className = 'conn ' + state; c.querySelector('span').textContent = txt;
  $('#demoBanner').hidden = state !== 'demo';
}

/* ---------- fechas ---------- */
function parseFecha(f){
  if(f instanceof Date) return f;
  let s = String(f).replace(' ', 'T');
  if(!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += 'Z';      // timestamp sin zona = UTC (asi lo guarda Node-RED)
  return new Date(s);
}
const fmtFecha = d => new Intl.DateTimeFormat('es-CO',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d).replace(',', '');
const fmtHora = d => new Intl.DateTimeFormat('es-CO',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
const isoBogota = (ymd, fin) => new Date(`${ymd}T${fin ? '23:59:59.999' : '00:00:00'}-05:00`).toISOString();
const tick = () => { $('#clock').textContent = fmtFecha(new Date()); }; tick(); setInterval(tick, 1000);

/* ---------- nombres, unidades y formato de cada campo del JSON ---------- */
const CAMPOS = {
  periodo:['Periodo',''], sp:['Setpoint','cm',1], nivel:['Nivel TK-2','cm',1],
  nivel_min:['Nivel mínimo','cm',1], nivel_max:['Nivel máximo','cm',1], nivel_prom:['Nivel promedio','cm',2],
  vel_prom:['Velocidad promedio','rpm',0], vel_variador:['Velocidad M-01','rpm',0], muestras:['Muestras','u',0],
  vol_envasado:['Volumen envasado','L',2], botellas:['Botellas producidas','u',0], vendidas:['Botellas vendidas','u',0],
  inventario:['En inventario','u',0], costo_mp:['Costo de material','$',0], costo_mezcla:['Costo mezcla','$',0],
  costo_envases:['Costo envases','$',0], ingresos:['Ingresos','$',0], t_muerto_min:['Tiempo parado','min',1],
  t_marcha_min:['Tiempo en marcha','min',1], costo_muerto:['Costo del paro','$',0],
  kpi_disp:['Disponibilidad','%',1], disponibilidad:['Disponibilidad','%',1],
  kpi_prod_h:['Producción','bot/h',1], produccion_h:['Producción','bot/h',1],
  kpi_costo_unit:['Costo unitario','$/bot',0], costo_unit:['Costo unitario','$/bot',0],
  margen:['Margen bruto','%',1], kpi_margen:['Margen bruto','%',1], alarmas:['Alarmas','']
};
const nombre = k => (CAMPOS[k] || [k.replace(/_/g,' ').replace(/^./, c => c.toUpperCase())])[0];
const unidad = k => (CAMPOS[k] || [, ''])[1] || '';
function valor(k, v){
  if(typeof v !== 'number') return v == null ? '--' : String(v);
  const d = CAMPOS[k] ? (CAMPOS[k][2] ?? 2) : (Number.isInteger(v) ? 0 : 2);
  return v.toLocaleString('es-CO',{minimumFractionDigits:d,maximumFractionDigits:d});
}
const pick = (o, ks) => { for(const k of ks) if(o && o[k] != null) return Number(o[k]); return null; };
function contenido(r){
  let c = r.contenido;
  if(typeof c === 'string'){ try{ c = JSON.parse(c); }catch(e){ c = { texto: c }; } }
  return c || {};
}
function resumen(r){
  const c = contenido(r);
  if(r.tipo === 'gerencia') return `Botellas ${valor('botellas',pick(c,['botellas']))} · margen ${valor('margen',pick(c,['margen','kpi_margen']))} %`;
  const mn = pick(c,['nivel_min']), mx = pick(c,['nivel_max']);
  return `SP ${valor('sp',pick(c,['sp']))} cm · nivel ${valor('nivel_min',mn)}–${valor('nivel_max',mx)} cm`;
}

/* ---------- datos de demostracion (mismas fechas que los reportes reales del 5-nov) ---------- */
function demoReportes(){
  const sup = (id, f, sp, mn, mx, pr, vel, n, vol, bot) => ({id, fecha:f, tipo:'supervisor', contenido:{periodo:'ultima hora', sp, nivel_min:mn, nivel_max:mx, nivel_prom:pr, vel_prom:vel, muestras:n, vol_envasado:vol, botellas:bot}});
  const ger = (id, f, bot, vend, inv, mp, ing, tm, cm, disp, prod, cu, mar) => ({id, fecha:f, tipo:'gerencia', contenido:{botellas:bot, vendidas:vend, inventario:inv, costo_mp:mp, ingresos:ing, t_muerto_min:tm, costo_muerto:cm, kpi_disp:disp, kpi_prod_h:prod, kpi_costo_unit:cu, margen:mar}});
  return [
    sup(159,'2026-11-05 15:12:21',7,0,7.02,4.81,598,720,36.4,36),
    sup(158,'2026-11-05 15:10:36',7,0,6.98,4.77,592,720,36.0,36),
    ger(157,'2026-11-05 15:09:00',36,0,36,454248,0,6.5,9750,88.4,40.1,12888,54.7),
    ger(156,'2026-11-05 14:50:44',0,0,0,3033,0,1.2,1800,0,0,0,54.7),
    ger(155,'2026-11-05 14:31:32',92,40,52,1159861,1120000,12.0,18000,91.2,42.6,12803,54.7),
    sup(154,'2026-11-05 14:31:27',7,7,7.14,7.03,879,720,92.3,92),
    sup(153,'2026-11-05 14:31:22',7,7,7.16,7.04,880,720,92.0,92)
  ];
}
function demoProceso(horas){
  const out = [], n = Math.min(720, horas * 60), t0 = Date.now() - horas * 3600e3;
  let h = 0, vol = 0;
  for(let i = 0; i < n; i++){
    const t = new Date(t0 + i * horas * 3600e3 / n);
    const fase = (i / n) * 4 % 1, marcha = fase < 0.82, sp = (i / n) < 0.5 ? 6 : 7;
    h += marcha ? (sp - h) * 0.08 + Math.sin(i / 3) * 0.02 : -h * 0.05;
    h = Math.max(0, h); vol += marcha ? 0.08 * Math.sqrt(h) : 0;
    out.push({fecha:t.toISOString(), nivel:+h.toFixed(2), sp, vel_variador: marcha && h >= 5 ? Math.round(125 * h) : 0, sentido:0, marcha: marcha ? 1 : 0, vol_envasado:+vol.toFixed(2), botellas:Math.floor(vol)});
  }
  return out;
}

/* ---------- estado ---------- */
let reportes = [], selId = null, proceso = [];

async function cargarReportes(){
  const tipo = $('#fTipo').value, d = $('#fDesde').value, h = $('#fHasta').value;
  try{
    if(conn.demo){
      reportes = demoReportes().filter(r => (!tipo || r.tipo === tipo)
        && (!d || parseFecha(r.fecha) >= new Date(isoBogota(d)))
        && (!h || parseFecha(r.fecha) <= new Date(isoBogota(h, true))));
      setConn('demo', 'Modo demo');
    }else{
      const p = new URLSearchParams({ select:'*', order:'fecha.desc', limit:'1000' });
      if(tipo) p.append('tipo', `eq.${tipo}`);
      const and = [];
      if(d) and.push(`fecha.gte.${isoBogota(d)}`);
      if(h) and.push(`fecha.lte.${isoBogota(h, true)}`);
      if(and.length) p.append('and', `(${and.join(',')})`);
      reportes = await sb(CFG.TABLA_REPORTES || 'reportes', p.toString());
      setConn('ok', 'Supabase en línea');
    }
  }catch(e){
    console.error(e); reportes = []; setConn('err', 'Error de conexión');
    $('#dBody').innerHTML = `<p class="hint" style="color:var(--red)">No se pudo leer Supabase: ${esc(e.message).slice(0,200)}</p>`;
  }
  pintarTabla(); pintarKPI();
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function pintarTabla(){
  const tb = $('#tabla tbody'); tb.innerHTML = '';
  for(const r of reportes){
    const tr = document.createElement('tr'); tr.dataset.id = r.id; if(r.id === selId) tr.className = 'sel';
    tr.innerHTML = `<td><input type="checkbox" class="chk" data-id="${r.id}"></td><td>${r.id}</td><td>${fmtFecha(parseFecha(r.fecha))}</td><td><span class="pill ${esc(r.tipo)}">${esc(String(r.tipo).toUpperCase())}</span></td><td class="res">${esc(resumen(r))}</td>`;
    tr.addEventListener('click', ev => { if(ev.target.classList.contains('chk')) return; seleccionar(r.id); });
    tb.appendChild(tr);
  }
  $('#empty').hidden = reportes.length > 0;
  $('#count').textContent = `${reportes.length} reporte${reportes.length === 1 ? '' : 's'}`;
  $('#chkAll').checked = false;
  if(!reportes.find(r => r.id === selId)){ selId = null; $('#dBtns').hidden = true; if(!$('#dBody').querySelector('.hint[style]')) $('#dBody').innerHTML = '<p class="hint">Selecciona un reporte de la lista.</p>'; $('#dId').textContent = ''; }
}

function pintarKPI(){
  const g = reportes.find(r => r.tipo === 'gerencia' && pick(contenido(r),['botellas']) > 0) || reportes.find(r => r.tipo === 'gerencia');
  const c = g ? contenido(g) : {};
  const set = (id, v, k, max) => { $('#k_' + id).textContent = v == null ? '--' : valor(k, v); $('#kb_' + id).style.width = v == null ? '0' : Math.max(0, Math.min(100, v / max * 100)) + '%'; };
  set('disp', pick(c,['kpi_disp','disponibilidad']), 'kpi_disp', 100);
  set('prod', pick(c,['kpi_prod_h','produccion_h']), 'kpi_prod_h', 60);
  set('cu', pick(c,['kpi_costo_unit','costo_unit']), 'kpi_costo_unit', 28000);
  set('mar', pick(c,['margen','kpi_margen']), 'margen', 100);
}

function seleccionar(id){
  selId = id; const r = reportes.find(x => x.id === id); if(!r) return;
  document.querySelectorAll('#tabla tbody tr').forEach(tr => tr.classList.toggle('sel', +tr.dataset.id === id));
  const c = contenido(r);
  $('#dId').textContent = `#${r.id}`;
  let html = `<div class="dhead"><span class="pill ${esc(r.tipo)}">${esc(String(r.tipo).toUpperCase())}</span><b>${fmtFecha(parseFecha(r.fecha))}</b></div>`;
  for(const [k, v] of Object.entries(c)){
    if(v !== null && typeof v === 'object'){ html += `<div class="sec">${esc(nombre(k).toUpperCase())}</div>`; for(const [k2, v2] of Object.entries(v)) html += ind(k2, v2); }
    else html += ind(k, v);
  }
  $('#dBody').innerHTML = html; $('#dBtns').hidden = false;
}
const ind = (k, v) => `<div class="ind"><span>${esc(nombre(k))}</span><output>${esc(valor(k, typeof v === 'string' && v.trim() !== '' && !isNaN(v) ? Number(v) : v))}</output><u>${esc(unidad(k))}</u></div>`;

/* ---------- descargas ---------- */
function marcados(){
  const ids = [...document.querySelectorAll('.chk:checked')].map(c => +c.dataset.id);
  return ids.length ? reportes.filter(r => ids.includes(r.id)) : reportes;
}
function bajar(nombreArch, texto, mime){
  const b = new Blob([texto], { type: mime }), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = nombreArch; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const stamp = () => new Date().toISOString().slice(0,16).replace(/[-:T]/g,'');
const celda = v => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
function csvReportes(lista){
  // una columna por campo del JSON; separador ; y coma decimal para Excel en español
  const keys = []; lista.forEach(r => Object.keys(contenido(r)).forEach(k => { if(!keys.includes(k)) keys.push(k); }));
  const head = ['id','fecha_bogota','tipo', ...keys.map(k => unidad(k) ? `${nombre(k)} (${unidad(k)})` : nombre(k))];
  const rows = lista.map(r => { const c = contenido(r); return [r.id, fmtFecha(parseFecha(r.fecha)), r.tipo, ...keys.map(k => typeof c[k] === 'number' ? String(c[k]).replace('.', ',') : (typeof c[k] === 'object' && c[k] ? JSON.stringify(c[k]) : c[k]))]; });
  return '﻿' + [head, ...rows].map(r => r.map(celda).join(';')).join('\r\n');
}
function imprimir(lista){
  if(!lista.length) return;
  $('#print').innerHTML = lista.map(r => {
    const c = contenido(r);
    const filas = Object.entries(c).map(([k, v]) => `<tr><td>${esc(nombre(k))}</td><td class="n">${esc(typeof v === 'object' && v ? JSON.stringify(v) : valor(k, v))}</td><td>${esc(unidad(k))}</td></tr>`).join('');
    return `<div class="rep"><div class="ph"><div><b>POLYFIX</b><br>Planta piloto P-85</div><div style="text-align:right">Reporte #${r.id}<br>${fmtFecha(parseFecha(r.fecha))} (hora Colombia)</div></div>
      <h2>Reporte de ${r.tipo === 'gerencia' ? 'gerencia' : 'supervisor'}</h2>
      <table><tr><th>Variable</th><th>Valor</th><th>Unidad</th></tr>${filas}</table>
      <div class="pf">Generado desde la nube (Supabase) el ${fmtFecha(new Date())}. Universidad Militar Nueva Granada · Automatización Industrial.</div></div>`;
  }).join('');
  window.print();
}
$('#dlCSV').onclick = () => bajar(`polyfix_reportes_${stamp()}.csv`, csvReportes(marcados()), 'text/csv;charset=utf-8');
$('#dlJSON').onclick = () => bajar(`polyfix_reportes_${stamp()}.json`, JSON.stringify(marcados().map(r => ({...r, contenido: contenido(r)})), null, 2), 'application/json');
$('#dlPDF').onclick = () => imprimir(marcados());
const actual = () => reportes.filter(r => r.id === selId);
$('#d1CSV').onclick = () => bajar(`polyfix_reporte_${selId}.csv`, csvReportes(actual()), 'text/csv;charset=utf-8');
$('#d1JSON').onclick = () => bajar(`polyfix_reporte_${selId}.json`, JSON.stringify({...actual()[0], contenido: contenido(actual()[0])}, null, 2), 'application/json');
$('#d1PDF').onclick = () => imprimir(actual());
$('#chkAll').onchange = e => document.querySelectorAll('.chk').forEach(c => { c.checked = e.target.checked; });
$('#btnBuscar').onclick = cargarReportes;
$('#btnLimpiar').onclick = () => { $('#fTipo').value = ''; $('#fDesde').value = ''; $('#fHasta').value = ''; cargarReportes(); };
$('#fTipo').onchange = cargarReportes;

/* ---------- historial (tabla proceso) ---------- */
async function cargarProceso(){
  const horas = +$('#hRango').value;
  try{
    if(conn.demo) proceso = demoProceso(horas);
    else{
      const desde = new Date(Date.now() - horas * 3600e3).toISOString();
      proceso = await sb(CFG.TABLA_PROCESO || 'proceso', new URLSearchParams({ select:'*', order:'fecha.asc', limit:'5000', fecha:`gte.${desde}` }).toString());
    }
  }catch(e){ console.error(e); proceso = []; setConn('err', 'Error de conexión'); }
  $('#hCount').textContent = `${proceso.length} muestras`;
  const u = proceso[proceso.length - 1] || {};
  const put = (id, k, v) => { $('#' + id).textContent = v == null ? '--' : valor(k, Number(v)); };
  put('i_nivel','nivel',u.nivel); put('i_sp','sp',u.sp); put('i_vel','vel_variador',u.vel_variador); put('i_vol','vol_envasado',u.vol_envasado); put('i_bot','botellas',u.botellas);
  $('#L_marcha').classList.toggle('on', !!+u.marcha); $('#L_sent').classList.toggle('on', !!+u.sentido);
  dibujar();
}
function dibujar(){
  const cv = $('#trend'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = 330;
  cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const L = 44, R = 50, T = 12, B = 28, w = W - L - R, h = H - T - B;
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.font = '11px Consolas,monospace'; g.strokeStyle = '#e1e3e7'; g.fillStyle = '#5a6170';
  for(let i = 0; i <= 6; i++){ const y = T + h - i / 6 * h; g.beginPath(); g.moveTo(L, y); g.lineTo(L + w, y); g.stroke(); g.textAlign = 'right'; g.fillText((i * 2).toString(), L - 6, y + 4); g.textAlign = 'left'; g.fillText((i * 250).toString(), L + w + 6, y + 4); }
  g.save(); g.translate(12, T + h / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('cm', 0, 0); g.restore();
  g.save(); g.translate(W - 8, T + h / 2); g.rotate(Math.PI / 2); g.textAlign = 'center'; g.fillText('rpm', 0, 0); g.restore();
  g.strokeStyle = '#9aa0a8'; g.strokeRect(L, T, w, h);
  if(proceso.length < 2){ g.textAlign = 'center'; g.fillText('Sin datos en el rango', L + w / 2, T + h / 2); return; }
  const t0 = parseFecha(proceso[0].fecha).getTime(), t1 = parseFecha(proceso[proceso.length - 1].fecha).getTime() || t0 + 1;
  const X = f => L + (parseFecha(f).getTime() - t0) / (t1 - t0 || 1) * w;
  g.textAlign = 'center';
  for(let i = 0; i <= 6; i++){ const t = new Date(t0 + i / 6 * (t1 - t0)); g.fillText(fmtHora(t), L + i / 6 * w, T + h + 18); }
  const linea = (k, col, max, step) => {
    g.strokeStyle = col; g.lineWidth = 1.8; g.beginPath();
    proceso.forEach((p, i) => { const x = X(p.fecha), y = T + h - Math.max(0, Math.min(1, (+p[k] || 0) / max)) * h; if(i && step){ g.lineTo(x, g._ly); } i ? g.lineTo(x, y) : g.moveTo(x, y); g._ly = y; });
    g.stroke();
  };
  linea('vel_variador', '#2fbf3a', 1500); linea('sp', '#d7262b', 12, true); linea('nivel', '#2eb7e6', 12);
}
$('#hBuscar').onclick = cargarProceso; $('#hRango').onchange = cargarProceso;
$('#hCSV').onclick = () => {
  if(!proceso.length) return;
  const keys = Object.keys(proceso[0]).filter(k => k !== 'fecha');
  const rows = proceso.map(p => [fmtFecha(parseFecha(p.fecha)), ...keys.map(k => typeof p[k] === 'number' ? String(p[k]).replace('.', ',') : p[k])]);
  bajar(`polyfix_proceso_${stamp()}.csv`, '﻿' + [['fecha_bogota', ...keys], ...rows].map(r => r.map(celda).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
};
window.addEventListener('resize', () => { if(!$('#view-historial').hidden) dibujar(); });

/* ---------- navegacion inferior ---------- */
const TITULOS = { reportes:'Reportes', historial:'Historial', acerca:'Acerca' };
document.querySelectorAll('.bottomnav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.bottomnav button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + b.dataset.view; });
  $('#viewTitle').textContent = TITULOS[b.dataset.view];
  LS.set('pf_view', b.dataset.view);
  if(b.dataset.view === 'historial') cargarProceso();
});

/* ---------- dialogo de conexion ---------- */
$('#btnCfg').onclick = () => { $('#cUrl').value = conn.url; $('#cKey').value = conn.demo ? '' : conn.key; $('#cfg').showModal(); };
$('#cfg').addEventListener('close', () => {
  const v = $('#cfg').returnValue;
  if(v === 'ok' && $('#cKey').value.trim()){
    conn.url = $('#cUrl').value.trim(); conn.key = $('#cKey').value.trim(); conn.demo = false;
    LS.set('pf_url', conn.url); LS.set('pf_key', conn.key); LS.del('pf_demo');
  }else if(v === 'demo'){ conn.demo = true; LS.set('pf_demo', '1'); }
  else return;
  cargarReportes(); if(!$('#view-historial').hidden) cargarProceso();
});

/* ---------- inicio ---------- */
const v0 = LS.get('pf_view'); if(v0 && v0 !== 'reportes'){ const b = document.querySelector(`.bottomnav button[data-view="${v0}"]`); if(b) b.click(); }
cargarReportes().then(() => { if(reportes[0]) seleccionar(reportes[0].id); });
})();
