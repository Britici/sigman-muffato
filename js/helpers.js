/* ══════════════════════════════════════════════════════════════════
   SIGMAN — UTILITÁRIOS
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */
const v = id => { const el = document.getElementById(id); return el ? el.value : ''; };
const sv = (id, val) => {
  const el = document.getElementById(id);
  if (el) el.value = val;
  const disp = document.getElementById(id + '_disp');
  if (disp) disp.value = fd(val) === '—' ? '' : fd(val);
};
const today = () => new Date().toISOString().slice(0,10);

function debounce(fn, ms=300){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
var renderExecDebounced = debounce(()=>renderExec());

function fd(d) {
  if (!d) return '—';
  const s = String(d).slice(0,10);
  const p = s.split('-');
  return p.length === 3 && p[0].length === 4 ? `${p[2]}/${p[1]}/${p[0]}` : s;
}

// ══════════════════════════════════════════════════════════════════════
// MÁSCARA DE DATA (dd/mm/aaaa visível, ISO por trás)
// Todo campo de data agora é um par: <input type="hidden" id="X"> guarda
// o valor real (ISO, AAAA-MM-DD) — é nele que v()/sv() e toda a lógica
// existente (filtros, comparações de prazo, etc.) continuam operando sem
// nenhuma mudança. <input type="text" id="X_disp" class="date-mask"> é o
// que o usuário vê e digita, sempre em dd/mm/aaaa.
// ══════════════════════════════════════════════════════════════════════
function _brToISO(br) {
  const m = String(br).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function abrirDatePicker(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (el.showPicker) { try { el.showPicker(); return; } catch (e) { /* fallback abaixo */ } }
  el.style.pointerEvents = 'auto';
  el.focus();
  el.click();
  setTimeout(() => { el.style.pointerEvents = 'none'; }, 300);
}

// ══════════════════════════════════════════════════════════════════════
// ÍCONE 📅 DENTRO DO CAMPO DE DATA
// Auto-detecta todo <input class="date-mask"> na página (estático ou
// gerado dinamicamente) e injeta o ícone de calendário embutido no
// próprio campo, igual ao input type=time nativo. Não precisa mais
// montar o botão/picker manualmente no HTML — só colocar a classe
// "date-mask" no campo de texto que o resto é automático.
// Reaproveita hidden id=X existente (caso A/C) ou, se o próprio campo
// base já for type=date (caso do prev-dt), usa ele mesmo como picker.
// Idempotente: pode chamar de novo a qualquer momento sem duplicar.
// ══════════════════════════════════════════════════════════════════════
function wireDateIcon(dispEl) {
  if (!dispEl || (dispEl.parentElement && dispEl.parentElement.classList.contains('date-wrap'))) return;
  const base = dispEl.id.replace(/_disp$/, '');
  const baseEl = document.getElementById(base);

  const wrap = document.createElement('div');
  wrap.className = 'date-wrap';
  dispEl.parentNode.insertBefore(wrap, dispEl);
  wrap.appendChild(dispEl);

  let picker;
  if (baseEl && baseEl.type === 'date') {
    picker = baseEl; // caso prev-dt: o próprio campo já é hidden+picker
  } else {
    picker = document.getElementById(base + '_picker');
    if (!picker) {
      picker = document.createElement('input');
      picker.type = 'date';
      picker.id = base + '_picker';
      picker.onchange = function () { sv(base, this.value); dispEl.dispatchEvent(new Event('change', { bubbles: true })); };
      wrap.appendChild(picker);
    }
  }
  picker.style.cssText = 'position:absolute;opacity:0;pointer-events:none;width:1px;height:1px';
  if (picker.parentNode !== wrap) wrap.appendChild(picker);
  // força espaço pro ícone mesmo em campos com padding inline (ex: filtros
  // compactos do dashboard, que já trazem style="padding:5px 8px")
  dispEl.style.paddingRight = '30px';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dp-btn';
  btn.title = 'Escolher data';
  btn.textContent = '📅';
  btn.onclick = () => abrirDatePicker(picker.id);
  wrap.appendChild(btn);
}
function initDateIcons(root) {
  (root || document).querySelectorAll('input.date-mask').forEach(wireDateIcon);
}
document.addEventListener('DOMContentLoaded', () => initDateIcons());
function dateMaskInput(el) {
  let d = el.value.replace(/\D/g, '').slice(0, 8);
  if (d.length >= 5) d = d.slice(0, 2) + '/' + d.slice(2, 4) + '/' + d.slice(4);
  else if (d.length >= 3) d = d.slice(0, 2) + '/' + d.slice(2);
  el.value = d;
  const hid = document.getElementById(el.id.replace(/_disp$/, ''));
  if (!hid) return;
  hid.value = d.length === 10 ? _brToISO(d) : '';
}

function genOS() {
  const existentes = new Set(db.ordens.map(o => o.numero));
  while (existentes.has('OS-' + String(db.osC).padStart(4,'0'))) db.osC++;
  return 'OS-' + String(db.osC).padStart(4,'0');
}

function genPL() {
  const existentes = new Set(db.planejadas.map(p => p.numero));
  while (existentes.has('PL-' + String(db.plC).padStart(4,'0'))) db.plC++;
  return 'PL-' + String(db.plC).padStart(4,'0');
}

function genSOL() {
  const existentes = new Set(db.solicitacoes.map(s => s.numero));
  while (existentes.has('SOL-' + String(db.solC).padStart(4,'0'))) db.solC++;
  return 'SOL-' + String(db.solC).padStart(4,'0');
}

function updStats() {
  const t = today();
  document.getElementById('th-hj').textContent = db.ordens.filter(o => o.data === t).length;
}

function prio(p) {
  if (!p) return '';
  // Suporte tanto ao formato novo (1-4) quanto ao legado (Alta/Média/Baixa)
  const c = {'1':'b-c1','2':'b-c2','3':'b-c3','4':'b-c4','Alta':'b-c2','Média':'b-c3','Baixa':'b-c4','Urgente':'b-c1'};
  const d = {'1':'d-1','2':'d-2','3':'d-3','4':'d-4','Alta':'d-2','Média':'d-3','Baixa':'d-4','Urgente':'d-1'};
  const lbl = {'1':'1 – Crítico','2':'2 – Alta','3':'3 – Média','4':'4 – Baixa'};
  return `<span class="badge ${c[p]||''}"><span class="pdot ${d[p]||''}"></span>${lbl[p]||p}</span>`;
}

function tipoBadge(t) {
  if (!t) return '';
  const c = {Corretiva:'b-cor',Preventiva:'b-pre',Preditiva:'b-prd',Melhoria:'b-mel','Inspeção':'b-pre'};
  return `<span class="badge ${c[t]||''}">${t}</span>`;
}

function stBadge(s) {
  const c = {Pendente:'b-pen',Concluída:'b-con',Atrasada:'b-atr',Executada:'b-exe','Não Executada':'b-nexe'};
  return `<span class="badge ${c[s]||''}">${s}</span>`;
}

function roleBadge(t) {
  const c = {administracao:'b-adm',manutencao:'b-man',producao:'b-pro',diretoria:'b-dir'};
  const l = {administracao:'Administração',manutencao:'Manutenção',producao:'Produção',diretoria:'Diretoria'};
  return `<span class="badge ${c[t]||''}">${l[t]||t}</span>`;
}

function showAlert(id, msg, type='ok') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg; el.className = 'alert '+type+' on';
  setTimeout(()=>el.classList.remove('on'), 4000);
}

function logEdit(acao, numero, detalhe) {
  if (!CU) return;
  const agora = new Date().toISOString();
  const entry = {
    ts: agora,
    user: CU.nome,
    login: CU.login,
    acao,
    numero: numero || '',
    detalhe: detalhe || ''
  };
  db.historico.unshift(entry);
  if (db.historico.length > 100) db.historico.pop();
  saveDB();
  // Envia para o Sheets
  apiAppend('historico', {
    ID: agora,
    Data_Hora: agora,
    Usuario: CU.nome,
    Login: CU.login,
    Acao: acao,
    Numero_Ref: numero || '',
    Detalhe: detalhe || ''
  });
}

function calcDisponibilidadePorSala(ordPer, horasTurno1, horasTurno2, horasTurno3, diasPer) {
  const salas = db.salas.length ? [...db.salas] : [...new Set(db.maquinas.map(m => m.sala))];
  return salas.map(sala => {
    const maqsSala = db.maquinas.filter(m => m.sala === sala);
    if (maqsSala.length === 0) return { sala, disp: 100, minParada: 0 };
    const minParada = ordPer
      .filter(o =>
        o.sala === sala &&
        o.tipo === 'Corretiva' &&
        maqsSala.some(m => m.nome === o.maq)
      )
      .reduce((s, o) => s + (o.paradaMin || 0), 0);
    const minDisp = diasPer * (horasTurno1 + horasTurno2 + horasTurno3) * 60;
    if (minDisp === 0) return { sala, disp: 0, minParada };
    const disp = Math.min(100, Math.max(0, Math.round((1 - minParada / minDisp) * 100)));
    return { sala, disp: isNaN(disp) ? 0 : disp, minParada };
  }).filter(s => s !== null);
}

function renderSalasStatus(ordPer, horasTurno1, horasTurno2, horasTurno3, diasPer) {
  const dispPorSala = calcDisponibilidadePorSala(ordPer, horasTurno1, horasTurno2, horasTurno3, diasPer);
  const html = dispPorSala.map(s => {
    const cor = s.disp >= 85 ? 'var(--grn)' : s.disp >= 75 ? 'var(--org)' : 'var(--red)';
    return `
      <div class="sc-card" style="color:${cor}">
        <div class="sc-lbl">${s.sala}</div>
        <div class="sc-val">${s.disp}%</div>
        <div style="font-size:11px;color:var(--txt3);margin-top:4px">Parada: ${s.minParada}min</div>
        <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:${cor};opacity:.5"></div>
      </div>
    `;
  }).join('');
  document.getElementById('salas-grid').innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════════
// FOTO: abrir em janela dedicada pra imprimir / salvar como PDF
// Reaproveita driveThumb() (core.js) — já converte link do Drive pra
// uma URL de imagem direta (w1000), então serve tanto pra thumbnail
// quanto pra essa janela de impressão.
// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// FOTO: lightbox (pop-up) reutilizável — mesmo padrão do módulo de
// Compras/Acompanhamento (reusa a classe CSS .cac-lightbox). Fecha no
// clique fora ou tecla ESC. Botão de imprimir reaproveita abrirFotoImprimir().
// ══════════════════════════════════════════════════════════════════════
function _initFotoLightboxGlobal() {
  if (document.getElementById('foto-lightbox-g')) return;
  const div = document.createElement('div');
  div.id = 'foto-lightbox-g';
  div.className = 'cac-lightbox';
  div.innerHTML = '<img id="foto-lightbox-g-img" src="" alt="">'
    + '<button class="cac-lightbox-print" id="foto-lightbox-g-print">🖨️ Imprimir / Salvar como PDF</button>';
  document.body.appendChild(div);
  div.addEventListener('click', function(e) {
    if (e.target.id === 'foto-lightbox-g-print') return;
    this.classList.remove('open');
  });
  document.getElementById('foto-lightbox-g-print').addEventListener('click', function(e) {
    e.stopPropagation();
    const src = document.getElementById('foto-lightbox-g-img').dataset.original;
    if (src) abrirFotoImprimir(src);
  });
}
// ESC fecha qualquer popup aberto no sistema — tanto os modais padrão
// (.mb.on: Ver OS, RACR, editar, etc) quanto os lightboxes de foto
// (.cac-lightbox.open: este e o de Compras/Acompanhamento).
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.querySelectorAll('.cac-lightbox.open').forEach(function(l) {
      l.classList.remove('open');
    });
    document.querySelectorAll('.mb.on').forEach(function(m) {
      if (m.id === 'mb-racr' && typeof fecharRACR === 'function') { fecharRACR(); return; }
      m.classList.remove('on');
    });
  }
});
function abrirFotoLightbox(fotoUrl) {
  if (!fotoUrl) { showToast('Sem foto para exibir.'); return; }
  _initFotoLightboxGlobal();
  const img = document.getElementById('foto-lightbox-g-img');
  img.src = driveThumb(fotoUrl);
  img.dataset.original = fotoUrl;
  document.getElementById('foto-lightbox-g').classList.add('open');
}

function abrirFotoImprimir(fotoUrl) {
  if (!fotoUrl) { showToast('Sem foto para exibir.'); return; }
  const imgSrc = driveThumb(fotoUrl);
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Foto — SIGMAN</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#f4f4f4;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:14mm}
img{max-width:100%;max-height:85vh;object-fit:contain;box-shadow:0 4px 20px rgba(0,0,0,.15)}
.bar{display:flex;gap:10px;margin-top:16px}
.bar button{font-family:Arial,sans-serif;font-size:15px;padding:9px 18px;border-radius:5px;border:none;cursor:pointer;background:#C41230;color:#fff}
.bar button:hover{background:#a30f28}
@media print{.bar{display:none}body{padding:0;background:#fff}img{max-height:100vh}}
</style></head><body>
<img src="${imgSrc}" alt="Foto">
<div class="bar"><button onclick="window.print()">🖨️ Imprimir / Salvar como PDF</button></div>
</body></html>`);
  win.document.close();
}
