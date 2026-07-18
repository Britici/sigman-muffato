/* ══════════════════════════════════════════════════════════════════
   SIGMAN — RACR - RELATÓRIO DE ANÁLISE DE CAUSA RAÍZ
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */
  
// ── Abre modal RACR em branco (botão "+ Novo RACR" na página) ──────
function abrirNovoRACR() {
  _racrOsRef = null;
  // Popula select de salas
  const salaSel = document.getElementById('racr-sala');
  if (salaSel) {
    salaSel.innerHTML = '<option value="">Selecione...</option>' +
      db.salas.map(s => `<option value="${s}">${s}</option>`).join('');
    salaSel.removeAttribute('disabled');
  }
  // Popula select de equipamentos (todos)
  racrFiltrarMaq();
  const equipSel = document.getElementById('racr-equip');
  if (equipSel) equipSel.removeAttribute('disabled');
  // Limpa campos de texto
  ['racr-falha','racr-causa','racr-p1','racr-p2','racr-p3','racr-p4','racr-p5',
   'racr-imediata','racr-preventiva','racr-resp-prod','racr-resp-manu','racr-exec']
  .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  // Data e hora atuais
  const dtEl = document.getElementById('racr-data');
  const dtDispEl = document.getElementById('racr-data_disp');
  const hrEl = document.getElementById('racr-hora');
  if (dtEl) { dtEl.value = today(); dtEl.removeAttribute('readonly'); }
  if (dtDispEl) { dtDispEl.value = fd(today()); dtDispEl.removeAttribute('readonly'); }
  if (hrEl) { hrEl.value = new Date().toTimeString().slice(0,5); hrEl.removeAttribute('readonly'); }
  openM('mb-racr');
}
 
// ── Fecha o modal RACR ────────────────────────────────────────────
function fecharRACR() {
  closeM('mb-racr');
  _racrOsRef = null;
}
 
// ── Salva rascunho localmente (sem enviar ao Sheets) ──────────────
function salvarRACRRascunho() {
  const dados = _coletarDadosRACR();
  if (!dados) return;
  if (!db.racs) db.racs = [];
  // Verifica se já existe rascunho para essa OS
  const idx = _racrOsRef
    ? db.racs.findIndex(r => r.osNumero === _racrOsRef && r.status === 'Rascunho')
    : -1;
  const agora = new Date().toISOString();
  const id    = idx >= 0 ? db.racs[idx].id : 'RACR-' + agora.replace(/\D/g,'').slice(0,14);
  if (!dados.maquina && _racrOsRef) {
  const osRef = db.ordens.find(x => x.numero === _racrOsRef);
  if (osRef) { dados.maquina = osRef.maq; dados.sala = osRef.sala; }
  }
  const racr = { ...dados, id, status: 'Rascunho', dataAbertura: agora.slice(0,10), criadoEm: agora };
  if (idx >= 0) db.racs[idx] = racr; else db.racs.push(racr);
  saveDB();
  fecharRACR();
  showToast('Rascunho salvo localmente.', 'ok');
  renderRACR();
}
 
// ── Salva RACR definitivo + envia ao Sheets ───────────────────────
function salvarRACR() {
  const dados = _coletarDadosRACR();
  if (!dados) return;
  if (!db.racs) db.racs = [];
  const agora = new Date().toISOString();
  const id    = 'RACR-' + agora.replace(/\D/g,'').slice(0,14);
  const racr  = { ...dados, id, status: 'Aberto', dataAbertura: agora.slice(0,10), criadoEm: agora };
  // Remove rascunho anterior se existir
  if (_racrOsRef) {
    const idxR = db.racs.findIndex(r => r.osNumero === _racrOsRef && r.status === 'Rascunho');
    if (idxR >= 0) db.racs.splice(idxR, 1);
  }
  db.racs.push(racr);
  saveDB();
  // Envia ao Sheets (action salvarRACR no AppScript)
  apiPost({
    action: 'salvarRACR',
    racr: {
      data:          racr.dataAbertura,
      osNumero:      racr.osNumero,
      equipamento:   racr.maquina,
      sala:          racr.sala,
      criticidade:   racr.criticidade,
      tempoParada:   racr.tempoParada,
      limiteMin:     racr.limiteMin,
      falha:         racr.falha,
      causa:         racr.causaRaiz,
      why1:          racr.why1,
      why2:          racr.why2,
      why3:          racr.why3,
      why4:          racr.why4,
      why5:          racr.why5,
      acaoImediata:  racr.acaoImediata,
      acaoPreventiva:racr.acaoPreventiva,
      respProd:      racr.respProd,
      respManu:      racr.respManu,
      executantes:   racr.executantes,
      usuario:       CU?.nome || 'Sistema'
    }
  }).then(res => {
    if (res?.ok) {
      showToast('RACR salvo no Sheets.', 'ok');
      apiLoadAll(true).then(renderRACR);
    } else {
      showToast('Salvo localmente — Sheets indisponível.', 'war');
      renderRACR();
    }
  });
  fecharRACR();
  showToast('RACR criado com sucesso.', 'ok');
}
 
// ── Encerra/fecha um RACR ─────────────────────────────────────────
function encerrarRACR(id) {
  if (!confirm('Confirmar encerramento deste RACR?')) return;
  const idx = (db.racs||[]).findIndex(r => r.id === id);
  if (idx < 0) return;
  const agora = new Date().toISOString();
  db.racs[idx].status      = 'Fechado';
  db.racs[idx].dataBaixa   = agora.slice(0,10);
  db.racs[idx].fechadoPor  = CU?.nome || '';
  saveDB();
  renderRACR();
  showToast('RACR encerrado.', 'ok');
  apiPost({ action: 'encerrarRACR', id });
}
 
// ── Imprime o RACR em nova janela ─────────────────────────────────
function imprimirRACR() {
  const dados = _coletarDadosRACR(false); // false = não valida obrigatórios
  const win   = window.open('', '_blank');
  const data  = document.getElementById('racr-data')?.value  || today();
  const hora  = document.getElementById('racr-hora')?.value  || '';
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>RACR — ${dados?.maquina || ''}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:13px;color:#000;padding:12mm 15mm}
    h1{font-size:18px;font-weight:800;margin-bottom:2px}
    h2{font-size:14px;font-weight:700;background:#C41230;color:#fff;padding:4px 8px;margin:10px 0 4px;text-transform:uppercase;letter-spacing:.5px}
    .sub{font-size:11px;color:#555;margin-bottom:10px}
    .row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px}
    .row.two{grid-template-columns:1fr 1fr}
    .row.one{grid-template-columns:1fr}
    .field label{font-size:10px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:1px}
    .field p{border-bottom:1px solid #ccc;min-height:18px;padding:2px 0;font-size:13px}
    .why{counter-reset:why}
    .why-item{display:flex;gap:8px;margin-bottom:5px;align-items:flex-start}
    .why-num{background:#C41230;color:#fff;font-weight:700;font-size:11px;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .why-line{flex:1;border-bottom:1px solid #ccc;min-height:16px;padding:2px 0}
    .assinaturas{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:14px}
    .ass{border-top:1px solid #000;padding-top:4px;font-size:11px;text-align:center}
    .logo-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;border-bottom:2px solid #C41230;padding-bottom:6px}
    @media print{body{padding:8mm 10mm}}
  </style>
  </head><body>
  <div class="logo-row">
    <div>
      <h1>🔴 RAC — Análise de Causa Raiz</h1>
      <div class="sub">Muffato Foods · PCM · ${data} ${hora ? '· ' + hora : ''}</div>
    </div>
    <img src="https://muffatofoods.com.br/assets/images/foods_logo.png" style="height:40px">
  </div>
 
  <h2>1 — Identificação</h2>
  <div class="row">
    <div class="field"><label>Equipamento / TAG</label><p>${dados?.maquina||''}</p></div>
    <div class="field"><label>Sala</label><p>${dados?.sala||''}</p></div>
    <div class="field"><label>OS Referência</label><p>${dados?.osNumero||''}</p></div>
  </div>
  <div class="row">
    <div class="field"><label>Data</label><p>${data}</p></div>
    <div class="field"><label>Hora da Parada</label><p>${hora}</p></div>
    <div class="field"><label>Criticidade</label><p>${dados?.criticidade||''}</p></div>
  </div>
 
  <h2>2 — Falha / Defeito Identificado</h2>
  <div class="row one"><div class="field"><p style="min-height:36px">${dados?.falha||''}</p></div></div>
 
  <h2>3 — Causa Raiz</h2>
  <div class="row one"><div class="field"><p style="min-height:36px">${dados?.causaRaiz||''}</p></div></div>
 
  <h2>4 — Análise dos 5 Porquês</h2>
  <div class="why">
    ${[dados?.why1,dados?.why2,dados?.why3,dados?.why4,dados?.why5].map((w,i)=>`
    <div class="why-item">
      <div class="why-num">${i+1}</div>
      <div class="why-line">${w||''}</div>
    </div>`).join('')}
  </div>
 
  <h2>5 — Ação Imediata</h2>
  <div class="row one"><div class="field"><p style="min-height:30px">${dados?.acaoImediata||''}</p></div></div>
 
  <h2>6 — Ação Preventiva</h2>
  <div class="row one"><div class="field"><p style="min-height:30px">${dados?.acaoPreventiva||''}</p></div></div>
 
  <h2>7 — Equipe Responsável</h2>
  <div class="row">
    <div class="field"><label>Resp. Produção</label><p>${dados?.respProd||''}</p></div>
    <div class="field"><label>Resp. Manutenção</label><p>${dados?.respManu||''}</p></div>
    <div class="field"><label>Executantes</label><p>${dados?.executantes||''}</p></div>
  </div>
 
  <div class="assinaturas">
    <div class="ass">Responsável Produção</div>
    <div class="ass">Responsável Manutenção</div>
    <div class="ass">Coordenador / Supervisor</div>
  </div>
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}
 
// ── Renderiza tabelas de RACRs na página pg-analise-causa-raiz ────
function renderRACR() {
  const tbAbertos   = document.getElementById('tb-racr-abertos');
  const tbFechados  = document.getElementById('tb-racr-fechados');
  if (!tbAbertos || !tbFechados) return;
  const todosSheets = db.racs || [];
  const rascunhosLocais = JSON.parse(localStorage.getItem('sigman_v4') || '{}').racs || [];
  const idsSheets = new Set(todosSheets.map(r => r.id));
  const extras = rascunhosLocais.filter(r => r.status === 'Rascunho' && !idsSheets.has(r.id));
  const todos = [...todosSheets, ...extras];
  const abertos = todos.filter(r => r.status !== 'Fechado');
  const fechados = todos.filter(r => r.status === 'Fechado');
 
  tbAbertos.innerHTML = abertos.length ? abertos.map(r => `
    <tr>
      <td class="osn">${r.id}</td>
      <td>${fd(r.dataAbertura)}</td>
      <td>${r.maquina||'—'}</td>
      <td style="max-width:200px;white-space:normal">${r.falha||'—'}</td>
      <td style="max-width:200px;white-space:normal">${r.causaRaiz||'—'}</td>
      <td><span class="badge ${r.status==='Rascunho'?'b-pen':'b-cor'}">${r.status}</span></td>
      <td style="display:flex;gap:5px;flex-wrap:wrap">
        <button class="btn btn-edit btn-sm" onclick="verRACR('${r.id}')">👁 Ver</button>
        ${r.status!=='Fechado'?`<button class="btn btn-g btn-sm" onclick="encerrarRACR('${r.id}')">✅ Encerrar</button>`:''}
      </td>
    </tr>`).join('')
    : `<tr><td colspan="7" class="empty"><div class="ei">✅</div><p>Nenhum RAC em Aberto</p></td></tr>`;
 
  tbFechados.innerHTML = fechados.length ? fechados.map(r => `
    <tr>
      <td class="osn">${r.id}</td>
      <td>${fd(r.dataAbertura)}</td>
      <td>${r.maquina||'—'}</td>
      <td>${fd(r.dataBaixa)}</td>
      <td><button class="btn btn-edit btn-sm" onclick="verRACR('${r.id}')">👁 Ver</button></td>
    </tr>`).join('')
    : `<tr><td colspan="7" class="empty"><div class="ei">✅</div><p>Nenhum RAC Concluído</p></td></tr>`;
}
 
// ── Abre modal de visualização de um RACR existente ───────────────
function verRACR(id) {
  const r = (db.racs||[]).find(x => x.id === id);
  if (!r) return;
  // Preenche o modal com os dados do RACR
  _racrOsRef = r.osNumero || null;
  const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val||''; };
  setVal('racr-equip',    r.maquina);
  setVal('racr-sala',     r.sala);
  setVal('racr-data',     r.dataAbertura);
  setVal('racr-data_disp', fd(r.dataAbertura) === '—' ? '' : fd(r.dataAbertura));
  setVal('racr-hora',     '');
  setVal('racr-falha',    r.falha);
  setVal('racr-causa',    r.causaRaiz);
  setVal('racr-p1',       r.why1);
  setVal('racr-p2',       r.why2);
  setVal('racr-p3',       r.why3);
  setVal('racr-p4',       r.why4);
  setVal('racr-p5',       r.why5);
  setVal('racr-imediata',   r.acaoImediata);
  setVal('racr-preventiva', r.acaoPreventiva);
  setVal('racr-resp-prod',  r.respProd);
  setVal('racr-resp-manu',  r.respManu);
  setVal('racr-exec',       r.executantes);
  openM('mb-racr');
}
 
// ── Coleta dados do formulário modal RACR ────────────────────────
function _coletarDadosRACR(validar = true) {
  const g = id => document.getElementById(id)?.value?.trim() || '';
  const falha = g('racr-falha');
  if (validar && !falha) { showToast('Informe a falha identificada.', 'er'); return null; }
  const maquina = g('racr-equip') || (_racrOsRef ? (db.ordens.find(x=>x.numero===_racrOsRef)?.maq||'') : '');
  const crit    = getCriticidadeMaq(maquina);
  return {
    osNumero:      _racrOsRef || '',
    maquina,
    sala:          g('racr-sala'),
    criticidade:   crit,
    tempoParada:   0,
    limiteMin:     limiteRAC(crit),
    falha,
    causaRaiz:     g('racr-causa'),
    why1:          g('racr-p1'),
    why2:          g('racr-p2'),
    why3:          g('racr-p3'),
    why4:          g('racr-p4'),
    why5:          g('racr-p5'),
    acaoImediata:  g('racr-imediata'),
    acaoPreventiva:g('racr-preventiva'),
    respProd:      g('racr-resp-prod'),
    respManu:      g('racr-resp-manu'),
    executantes:   g('racr-exec')
  };
}
 
// Variável de estado: OS que originou o RACR atual
let _racrOsRef = null;
 
// Hook na função showPg para renderizar RACRs ao entrar na página
const _origShowPg = typeof showPg === 'function' ? showPg : null;
// (renderRACR é chamado manualmente ao navegar — ver instrução abaixo)
   
