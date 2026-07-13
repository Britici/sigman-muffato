/* ══════════════════════════════════════════════════════════════════
   SIGMAN — UTILITÁRIOS
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */

const v   = id => { const el = document.getElementById(id); return el ? el.value : ''; };
const sv  = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
const today = () => new Date().toISOString().slice(0,10);
  
  function debounce(fn, ms=300){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
var renderExecDebounced = debounce(()=>renderExec());

function fd(d) {
  if (!d) return '—';
  const s = String(d).slice(0,10);
  const p = s.split('-');
  return p.length === 3 && p[0].length === 4 ? `${p[2]}/${p[1]}/${p[0]}` : s;
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
  const c = {administracao:'b-adm',manutencao:'b-man',producao:'b-pro'};
  const l = {administracao:'Administração',manutencao:'Manutenção',producao:'Produção'};
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
    ts:      agora,
    user:    CU.nome,
    login:   CU.login,
    acao,
    numero:  numero || '',
    detalhe: detalhe || ''
  };
  db.historico.unshift(entry);
  if (db.historico.length > 100) db.historico.pop();
  saveDB();
  // Envia para o Sheets
  apiAppend('historico', {
    ID:         agora,
    Data_Hora:  agora,
    Usuario:    CU.nome,
    Login:      CU.login,
    Acao:       acao,
    Numero_Ref: numero || '',
    Detalhe:    detalhe || ''
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
        <div style="font-size:10px;color:var(--txt3);margin-top:4px">Parada: ${s.minParada}min</div>
        <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:${cor};opacity:.5\"></div>
      </div>
    `;
  }).join('');
  
  document.getElementById('salas-grid').innerHTML = html;
}