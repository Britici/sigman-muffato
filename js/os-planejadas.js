/* ══════════════════════════════════════════════════════════════════
   SIGMAN — O.S. PLANEJADAS
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */

var planSort = { col: 'numero', dir: 'desc' };

// ── Abas Preventivas / Outras + geração manual ───────────────────────
// Preventivas = Tipo 'Preventiva' (criadas pelo backend). A geração diária
// é do servidor; aqui o PCM vê o que vence hoje e pode gerar à mão.
var planAba = 'outras'; // 'preventivas' | 'outras' | 'solicitacoes'
var planPrev = null;     // último retorno de previewPreventivas
var planPrevMsg = '';    // resultado da última geração manual
var _prevBusy = false;

function _escPl(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function _qtdPl(x) { return Array.isArray(x) ? x.length : (Number(x) || 0); }

function ehPreventivaPl_(p) { return p.tipo === 'Preventiva'; }

// Só Administração (único perfil com o menu PCM). O servidor NÃO checa perfil:
// isto só esconde o botão.
function podeGerarPreventivas() {
  return !!(typeof CU !== 'undefined' && CU && CU.tipo === 'administracao');
}

function filtrarPlan_() {
  const tx  = (v('fp-tx') || '').toLowerCase();
  const tp  = v('fp-tp');
  const sl  = v('fp-sl');
  const st  = v('fp-st');
  const dtI = v('fp-dt-ini');
  const dtF = v('fp-dt-fim');
  let data = db.planejadas.filter(p => planAba === 'preventivas' ? ehPreventivaPl_(p) : !ehPreventivaPl_(p));
  if (tx)  data = data.filter(p => [p.numero, p.sala, p.maq, p.tipo].some(x => x && x.toLowerCase().includes(tx)));
  if (tp)  data = data.filter(p => p.tipo === tp);
  if (sl)  data = data.filter(p => p.sala === sl);
  if (st)  data = data.filter(p => p.status === st);
  if (dtI) data = data.filter(p => p.prazo >= dtI);
  if (dtF) data = data.filter(p => p.prazo <= dtF);
  return data;
}

// Solicitações da Produção — só consulta/execução aqui; a criação e a lista de
// concluídas continuam na tela de Solicitação. Sem prazo: ordenado por criticidade.
function filtrarSol_() {
  const tx = (v('fp-tx') || '').toLowerCase();
  const tp = v('fp-tp');
  const sl = v('fp-sl');
  let data = (db.solicitacoes || []).filter(s => s.status !== 'Concluída');
  if (tx) data = data.filter(s => [s.numero, s.sala, s.maq, s.tipo].some(x => x && x.toLowerCase().includes(tx)));
  if (tp) data = data.filter(s => s.tipo === tp);
  if (sl) data = data.filter(s => s.sala === sl);
  data.sort((a, b) => getCriticidadeMaq(a.maq) - getCriticidadeMaq(b.maq)); // mais crítico primeiro
  return data;
}

function setPlanAba(aba) {
  if (['preventivas', 'outras', 'solicitacoes'].indexOf(aba) < 0) return;
  planAba = aba;
  const tp = document.getElementById('fp-tp');
  if (tp) tp.value = ''; // o filtro de tipo conflita com a aba
  renderPlan();
}

function ensurePlanAbasUI_() {
  if (document.getElementById('plan-abas')) return;
  const tb  = document.getElementById('tb-plan');
  const tbl = tb && tb.closest('table');
  if (!tbl || !tbl.parentNode) return;
  const bar = document.createElement('div');
  bar.id = 'plan-abas';
  bar.style.cssText = 'display:flex;gap:6px;margin:0 0 12px;flex-wrap:wrap';
  bar.innerHTML =
    '<button id="pab-preventivas" class="btn btn-sm" onclick="setPlanAba(\'preventivas\')"></button>' +
    '<button id="pab-outras" class="btn btn-sm" onclick="setPlanAba(\'outras\')"></button>' +
    '<button id="pab-solicitacoes" class="btn btn-sm" onclick="setPlanAba(\'solicitacoes\')"></button>';
  const panel = document.createElement('div');
  panel.id = 'plan-prev-panel';
  panel.style.cssText = 'display:none;margin:0 0 14px;padding:12px 14px;border:1px solid var(--brd,#2a3140);border-radius:8px';
  const solPanel = document.createElement('div');
  solPanel.id = 'plan-sol-panel';
  solPanel.style.cssText = 'display:none';
  tbl.parentNode.insertBefore(panel, tbl);
  tbl.parentNode.insertBefore(bar, panel);
  tbl.parentNode.insertBefore(solPanel, tbl); // fica logo antes da tabela, que é escondida nesta aba
}

function atualizarAbasPlan_() {
  ensurePlanAbasUI_();
  const abertas = db.planejadas.filter(p => p.status !== 'Concluída');
  const nP = abertas.filter(ehPreventivaPl_).length;
  const nO = abertas.length - nP;
  const nS = (db.solicitacoes || []).filter(s => s.status !== 'Concluída').length;
  const bP = document.getElementById('pab-preventivas');
  const bO = document.getElementById('pab-outras');
  const bS = document.getElementById('pab-solicitacoes');
  if (bP) { bP.textContent = 'Preventivas (' + nP + ')';     bP.className = 'btn btn-sm ' + (planAba === 'preventivas'   ? 'btn-g' : 'btn-gh'); }
  if (bO) { bO.textContent = 'Outras (' + nO + ')';          bO.className = 'btn btn-sm ' + (planAba === 'outras'       ? 'btn-g' : 'btn-gh'); }
  if (bS) { bS.textContent = 'Solicitações (' + nS + ')';    bS.className = 'btn btn-sm ' + (planAba === 'solicitacoes' ? 'btn-g' : 'btn-gh'); }

  const tb  = document.getElementById('tb-plan');
  const tbl = tb && tb.closest('table');
  if (tbl) tbl.style.display = planAba === 'solicitacoes' ? 'none' : '';

  renderPrevPanel_();
  renderSolPanel_();
}

function tipoCorrecaoMelhoriaBadge_(tipo) {
  const cor = tipo === 'Melhoria' ? 'var(--org,#d97706)' : 'var(--red)';
  return '<span style="font-size:11px;font-weight:600;color:' + cor + '">' + _escPl(tipo || '—') + '</span>';
}

function renderSolPanel_() {
  const el = document.getElementById('plan-sol-panel');
  if (!el) return;
  el.style.display = planAba === 'solicitacoes' ? 'block' : 'none';
  if (planAba !== 'solicitacoes') return;

  const lista = filtrarSol_();
  if (!lista.length) {
    el.innerHTML = '<div class="empty"><div class="ei">✅</div><p>Nenhuma solicitação pendente.</p></div>';
    return;
  }
  el.innerHTML = lista.map(s => {
    // Mesma regra de quem abre O.S. (ROLES.administracao/.manutencao têm 'abertura'
    // em core.js; produção e diretoria não têm).
    const podeExecutar = typeof CU !== 'undefined' && CU &&
      (CU.tipo === 'administracao' || CU.tipo === 'manutencao');
    return '<div style="display:flex;align-items:flex-start;justify-content:space-between;' +
      'padding:10px 0;border-bottom:1px solid var(--bord,#2a3140);gap:10px">' +
      '<div>' +
        '<span class="osn">' + _escPl(s.numero) + '</span>' +
        '<div style="font-size:15px;font-weight:500;margin-top:2px">' + _escPl(s.sala) + ' · ' + _escPl(s.maq) + '</div>' +
        '<div style="font-size:13px;color:var(--txt3)">' + _escPl(fd((s.criadoEm || '').slice(0, 10))) + ' · ' + _escPl(s.solicitante) + '</div>' +
        (s.desc ? '<div style="font-size:14px;color:var(--txt2);margin-top:3px">' + _escPl(s.desc) + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">' +
        tipoCorrecaoMelhoriaBadge_(s.tipo) + getCriticidadeBadge(s.maq) +
        (podeExecutar ? '<button class="btn btn-sm btn-g" onclick="abrirConcluir(\'' + s.numero.replace(/'/g, "\\'") + '\',\'sol\')">✓ Executar</button>' : '') +
      '</div></div>';
  }).join('');
}

function renderPrevPanel_() {
  const el = document.getElementById('plan-prev-panel');
  if (!el) return;
  el.style.display = planAba === 'preventivas' ? 'block' : 'none';
  if (planAba !== 'preventivas') return;

  const pode  = podeGerarPreventivas();
  const prev  = planPrev;
  const total = prev && prev.ok ? (prev.totalASerGerado || 0) : 0;
  let corpo = '';

  if (_prevBusy) {
    corpo = '<div style="color:var(--txt2)">Consultando o servidor… pode levar até 1 minuto.</div>';
  } else if (prev && !prev.ok) {
    corpo = '<div style="color:var(--red)">Erro: ' + _escPl(prev.error || 'sem resposta do servidor') + '</div>';
  } else if (prev) {
    const itens = prev.itens || [];
    const MAX = 40;
    corpo = '<div style="margin-bottom:6px"><strong>' + total + '</strong> O.S. a gerar hoje</div>';
    if (itens.length) {
      corpo += '<div style="max-height:220px;overflow:auto"><table style="width:100%;font-size:13px"><thead><tr>' +
        '<th style="text-align:left">Sala</th><th style="text-align:left">Máquina</th><th style="text-align:left">Tag</th>' +
        '<th style="text-align:left">Periodicidade</th><th style="text-align:left">Prazo</th></tr></thead><tbody>' +
        itens.slice(0, MAX).map(i => '<tr><td>' + _escPl(i.sala) + '</td><td>' + _escPl(i.maquina) + '</td><td>' +
          _escPl(i.tag) + '</td><td>' + _escPl(i.periodicidade) + '</td><td>' + _escPl(fd(i.prazoLimite)) + '</td></tr>').join('') +
        '</tbody></table></div>';
      if (itens.length > MAX) corpo += '<div style="color:var(--txt2);font-size:12px;margin-top:4px">+ ' + (itens.length - MAX) + ' não listadas</div>';
    }
    if (prev.semReferencia) {
      corpo += '<div style="color:var(--txt2);font-size:12px;margin-top:6px">' + prev.semReferencia +
        ' máquina(s) ainda sem data de agendamento (entram na agenda na próxima geração).</div>';
    }
  } else {
    corpo = '<div style="color:var(--txt2)">Clique em “Verificar vencimentos” para ver o que vence hoje.</div>';
  }

  el.innerHTML =
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">' +
      '<button class="btn btn-sm btn-gh" onclick="verificarPreventivas()"' + (_prevBusy ? ' disabled' : '') + '>Verificar vencimentos</button>' +
      (pode ? '<button class="btn btn-sm btn-g" onclick="gerarPreventivasAgora()"' + ((_prevBusy || total <= 0) ? ' disabled' : '') + '>Gerar agora</button>' : '') +
      (!pode ? '<span style="color:var(--txt2);font-size:12px">Geração manual: somente Administração.</span>' : '') +
    '</div>' + corpo +
    (planPrevMsg ? '<div style="margin-top:8px;font-size:13px">' + _escPl(planPrevMsg) + '</div>' : '');
}

async function verificarPreventivas() {
  if (_prevBusy) return;
  _prevBusy = true; planPrevMsg = ''; renderPrevPanel_();
  try {
    const r = await apiGet({ action: 'previewPreventivas' });
    planPrev = r || { ok: false, error: 'Sem resposta do servidor.' };
  } finally {
    _prevBusy = false; renderPrevPanel_();
  }
}

async function gerarPreventivasAgora() {
  if (!podeGerarPreventivas()) { showToast('Somente Administração pode gerar preventivas.', 'er'); return; }
  if (_prevBusy) return;
  const total = planPrev && planPrev.ok ? (planPrev.totalASerGerado || 0) : 0;
  if (total <= 0) { showToast('Verifique os vencimentos antes de gerar.', 'war'); return; }
  if (!confirm('Gerar ' + total + ' O.S. preventiva(s) agora?')) return;

  _prevBusy = true; planPrevMsg = ''; renderPrevPanel_();
  let res = null;
  try {
    // noQueueOnFail: não reenviar sozinho depois (evita gerar em duplicidade)
    res = await apiPost({ action: 'gerarPreventivasManual', usuario: (CU && CU.nome) || '' }, true);
  } finally {
    _prevBusy = false;
  }
  planPrev = null;
  if (res && res.ok) {
    const nC = _qtdPl(res.criadas), nF = _qtdPl(res.falhas);
    planPrevMsg = 'Geradas: ' + nC + (nF ? ' · Falhas: ' + nF + ' (tentam de novo na próxima geração)' : '') +
      (res.agendadas ? ' · Máquinas agendadas: ' + res.agendadas : '');
    showToast(planPrevMsg);
  } else if (res) {
    planPrevMsg = 'Erro do servidor: ' + (res.error || 'desconhecido');
    showToast(planPrevMsg, 'er');
  } else {
    planPrevMsg = 'Sem resposta do servidor. A geração pode ter sido concluída: confira a lista e use “Verificar vencimentos” antes de tentar de novo.';
    showToast('Sem resposta do servidor. Confira a lista antes de repetir.', 'war');
  }
  await apiLoadAll(true, true);
  renderPlan();
}

function sortPlan(col) {
  if (planSort.col === col) {
    planSort.dir = planSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    planSort.col = col;
    planSort.dir = col === 'prazo' ? 'asc' : 'desc';
  }
  renderPlan();
}

function renderPlan() {
  if (!document.getElementById('tb-plan')) return; // página de Planejadas não está aberta
  populateSalaFilter('fp-sl');
  const t = today();
  let changed = false;
  db.planejadas.forEach(p => {
    if (p.status === 'Pendente' && p.prazo && p.prazo < t) {
      p.status = 'Atrasada'; changed = true;
      apiUpdate('planejadas', p.numero, 'PL_Numero', { Status: 'Atrasada' });
    }
  });
  if (changed) saveDB();

  let data = filtrarPlan_();

  atualizarAbasPlan_();

  const { col, dir } = planSort;
  const prioMap = { 'Urgente':1, 'Alta':2, 'Média':3, 'Baixa':4 };
  const stMap   = { 'Atrasada':1, 'Pendente':2, 'Concluída':3 };
  data.sort((a, b) => {
    let va = a[col] || '', vb = b[col] || '';
    if (col === 'prioridade') { va = prioMap[va] || 9; vb = prioMap[vb] || 9; return dir === 'asc' ? va - vb : vb - va; }
    if (col === 'status')     { va = stMap[va]   || 9; vb = stMap[vb]   || 9; return dir === 'asc' ? va - vb : vb - va; }
    const cmp = va.localeCompare(vb, 'pt-BR', { numeric: true });
    return dir === 'asc' ? cmp : -cmp;
  });

  ['numero','sala','maq','tipo','prioridade','prazo','status'].forEach(c => {
    const el = document.getElementById('ph-' + c);
    if (!el) return;
    el.classList.remove('asc','desc');
    if (c === col) el.classList.add(dir);
  });

  const tb = document.getElementById('tb-plan');
  const tbC = document.getElementById('tb-plan-concluidas');
  const rowHtml = p => {
    const osGerada = p.status==='Concluída'
      ? (db.ordens.find(o => o.origem==='plan' && o.origemNum===p.numero)||{}).numero
      : null;
    return `<tr>
    <td><span class="osn">${p.numero}</span>${osGerada?`<div style="text-align:left;font-size:11px;color:var(--txt2);margin-top:1px">(${osGerada})</div>`:''}</td>
    <td>${p.sala}</td><td>${p.maq}</td>
    <td>${tipoBadge(p.tipo)}</td><td>${prio(p.prioridade)}</td>
    <td style="font-family:var(--fm);font-size:13px;color:${p.prazo<t&&p.status!=='Concluída'?'var(--red)':'var(--txt)'}">${fd(p.prazo)}</td>
    <td>${stBadge(p.status)}</td>
    <td><div style="display:flex;gap:4px;flex-wrap:nowrap;align-items:center">
      ${p.status!=='Concluída'?`<button class="btn btn-sm btn-g" onclick="abrirConcluir('${p.numero}','plan')">Concluir</button>`:''}
      ${podeEditar(p.criadoEm)?`<button class="btn btn-sm btn-gh" onclick="editarPlan('${p.numero}')">✎ Editar</button>`:''}
      <button class="btn btn-sm btn-gh" onclick="verDet('${p.numero}','pl')">Ver</button>
      ${podeEditar(p.criadoEm)?`<button class="btn btn-d" onclick="delPlan('${p.numero}')">✕</button>`:''}
    </div></td>
  </tr>`;
  };

  const naoConcl = data.filter(p => p.status !== 'Concluída');
  const concl    = data.filter(p => p.status === 'Concluída');

  tb.innerHTML = naoConcl.length ? naoConcl.map(rowHtml).join('')
    : `<tr><td colspan="8" class="empty"><div class="ei">✅</div><p>Nenhuma O.S. não concluída.</p></td></tr>`;
  if (tbC) {
    tbC.innerHTML = concl.length ? concl.map(rowHtml).join('')
      : `<tr><td colspan="8" class="empty"><div class="ei">✅</div><p>Nenhuma O.S. concluída.</p></td></tr>`;
  }
}

// Debounce para o campo de busca
let _planSearchTimer = null;
function renderPlanDebounced() {
  clearTimeout(_planSearchTimer);
  _planSearchTimer = setTimeout(renderPlan, 280);
}

function exportPlanCSV() {
  let data = filtrarPlan_();
  if (!data.length) { showToast('Sem dados para exportar com os filtros selecionados.', 'war'); return; }
  const h = ['PL_Numero','Sala','Maquina','Tipo','Prioridade','Prazo','Horas_Turno','Status','Descricao'];
  const rows = data.map(p => [
    p.numero, p.sala, p.maq, p.tipo, p.prioridade||'',
    p.prazo||'', p.horasTurno||'', p.status||'',
    (p.desc||'').replace(/,/g,'|')
  ]);
  const csv = [h, ...rows].map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `SIGMAN_Planejadas_${today()}_${planAba}${v('fp-tp')?'_'+v('fp-tp'):''}${v('fp-sl')?'_'+v('fp-sl'):''}${v('fp-st')?'_'+v('fp-st'):''}.csv`;
  a.click();
}

function _outroSel_(v) { return v === '__outros__' || /^Outros:\s*/.test(String(v || '')); }
function _outroTxt_(v) { return String(v || '').replace(/^Outros:\s*/, ''); }

function editarPlan(id) {
  const p = db.planejadas.find(x => x.numero === id);
  if (!p) return;
  document.getElementById('me-t').textContent = 'Editar O.S. Planejada — ' + p.numero;

  const salaEhOutro = _outroSel_(p.sala), maqEhOutro = _outroSel_(p.maq);
  const salasOpts = db.salas.sort().map(s =>
    `<option value="${s}"${s===p.sala?' selected':''}>${s}</option>`
  ).join('');

  const maqsFiltradas = db.maquinas.filter(m => m.sala === p.sala);
  const maqsOpts = maqsFiltradas.sort((a,b)=>a.nome.localeCompare(b.nome)).map(m =>
    `<option value="${m.nome}"${m.nome===p.maq?' selected':''}>${m.nome}${m.tag?' ('+m.tag+')':''}</option>`
  ).join('');

  document.getElementById('me-b').innerHTML = `
    <div class="fg"><label>Sala / Local</label>
      <select id="ep-sala" onchange="epFiltrarMaq();epSyncOutro()">
        <option value="">Selecione...</option>
        ${salasOpts}
        <option value="__outros__"${salaEhOutro?' selected':''}>Outros</option>
      </select>
    </div>
    <div class="fg" id="ep-sala-outro-wrap" style="display:${salaEhOutro?'':'none'}">
      <label>Qual local? (Outros)</label>
      <input type="text" id="ep-sala-outro" maxlength="80" value="${_escPl(salaEhOutro?_outroTxt_(p.sala):'')}">
    </div>
    <div class="fg"><label>Máquina / Ativo</label>
      <select id="ep-maq" onchange="epSyncOutro()">
        <option value="">Selecione...</option>
        ${maqsOpts}
        <option value="__outros__"${maqEhOutro?' selected':''}>Outros</option>
      </select>
    </div>
    <div class="fg" id="ep-maq-outro-wrap" style="display:${maqEhOutro?'':'none'}">
      <label>Qual ativo? (Outros)</label>
      <input type="text" id="ep-maq-outro" maxlength="80" value="${_escPl(maqEhOutro?_outroTxt_(p.maq):'')}">
    </div>
    <div class="fg"><label>Tipo de Serviço</label>
      <select id="ep-tipo">
        <option value="">Selecione...</option>
        ${['Corretiva','Inspeção','Melhoria','Preditiva','Preventiva'].map(t=>
          `<option${t===p.tipo?' selected':''}>${t}</option>`
        ).join('')}
      </select>
    </div>
    <div class="fg"><label>Prioridade</label>
      <select id="ep-prio">
        <option value="1"${p.prioridade==='1'?' selected':''}>🔴 Crítico (Parada de Máquina)</option>
        <option value="2"${(p.prioridade==='2'||p.prioridade==='Alta')?' selected':''}>🟠 Alta (Risco de Parada)</option>
        <option value="3"${(p.prioridade==='3'||p.prioridade==='Média')?' selected':''}>🟡 Média (Importante - Planejamento)</option>
        <option value="4"${(p.prioridade==='4'||p.prioridade==='Baixa')?' selected':''}>🟢 Baixo (Melhoria - Planejamento)</option>
      </select>
    </div>
    <div class="fg"><label>Prazo Limite</label>
      <input type="hidden" id="ep-prazo" value="${p.prazo||''}">
      <input type="text" id="ep-prazo_disp" class="date-mask" placeholder="dd/mm/aaaa" inputmode="numeric" maxlength="10" oninput="dateMaskInput(this)" value="${p.prazo?fd(p.prazo):''}">
    </div>
    <div class="fg" style="display:none"><label>Horas por Turno</label>
      <input type="number" id="ep-horas" value="${p.horasTurno||10}" min="1" max="24">
    </div>
    <div class="fg"><label>Status</label>
      <select id="ep-status">
        <option${p.status==='Pendente'?' selected':''}>Pendente</option>
        <option${p.status==='Atrasada'?' selected':''}>Atrasada</option>
        <option${p.status==='Concluída'?' selected':''}>Concluída</option>
      </select>
    </div>
    <div class="fg"><label>Descrição</label>
      <textarea id="ep-desc">${p.desc||''}</textarea>
    </div>`;

  initDateIcons(document.getElementById('me-b'));
  _editType = 'plan'; _editIdx = id;
  openM('m-edit');
}

function epFiltrarMaq() {
  const sala = document.getElementById('ep-sala')?.value;
  const sel  = document.getElementById('ep-maq');
  if (!sel) return;
  const maqsFiltradas = db.maquinas
    .filter(m => !sala || m.sala === sala)
    .sort((a,b) => a.nome.localeCompare(b.nome));
  sel.innerHTML = '<option value="">Selecione...</option>' +
    maqsFiltradas.map(m =>
      `<option value="${m.nome}">${m.nome}${m.tag?' ('+m.tag+')':''}</option>`
    ).join('') +
    '<option value="__outros__">Outros</option>';
}

// Mostra/esconde os campos de texto livre de "Outros" no modal de edição de Planejada.
function epSyncOutro() {
  const slSel = document.getElementById('ep-sala'), mqSel = document.getElementById('ep-maq');
  const slWrap = document.getElementById('ep-sala-outro-wrap'), mqWrap = document.getElementById('ep-maq-outro-wrap');
  if (slWrap) slWrap.style.display = (slSel && slSel.value === '__outros__') ? '' : 'none';
  if (mqWrap) mqWrap.style.display = (mqSel && mqSel.value === '__outros__') ? '' : 'none';
}

// Lê ep-sala/ep-maq já resolvendo "Outros" + texto livre para "Outros: <texto>".
// Retorna null se "Outros" foi escolhido sem preencher o texto.
function epResolverOutro_(selId, outroId) {
  const sel = document.getElementById(selId);
  const val = sel ? sel.value : '';
  if (val !== '__outros__') return val;
  const texto = (document.getElementById(outroId)?.value || '').trim();
  return texto ? 'Outros: ' + texto : null;
}
  
function delPlan(id) {
  const _chkPl = db.planejadas.find(p => p.numero === id);
  if (_chkPl && !podeEditar(_chkPl.criadoEm)) { showToast('Prazo de exclusão expirado (5 min).','er'); return; }
  if (!confirm('Excluir esta O.S. planejada?')) return;
  const pl = db.planejadas.find(p => p.numero === id);
  if (pl) logEdit('Excluiu Planejada', pl.numero, pl.sala + ' · ' + pl.maq);
  db.planejadas = db.planejadas.filter(p => p.numero !== id);
  saveDB(); renderPlan();
  if (pl) apiDelete('planejadas', pl.numero, 'PL_Numero');
}

// ── RAC — helpers ────────────────────────────────────────────────────
function getCriticidadeMaq(maqNome) {
  const m = db.maquinas.find(x => normStr(x.nome) === normStr(maqNome));
  return parseInt(m?.criticidade) || 3;
}
function getCriticidadeBadge(maqNome) {
  const crit = getCriticidadeMaq(maqNome);
  const critMap = {'1':'Criticidade 1','2':'Criticidade 2','3':'Criticidade 3','4':'Criticidade 4'};
  const critColor = {'1':'#ff2244','2':'var(--red)','3':'var(--org)','4':'var(--grn)'}[String(crit)] || 'var(--txt3)';
  return `<span style="font-size:11px;color:${critColor};font-weight:600">${critMap[String(crit)] || '—'}</span>`;
}
function limiteRAC(crit) {
  return {1:60, 2:120, 3:10080, 4:20160}[crit] ?? 120;
}
function precisaRAC(o) {
  if (o.tipo !== 'Corretiva') return false;
  const parada = o.paradaMin || o.durMin || 0;
  if (parada <= 0) return false;
  const crit  = getCriticidadeMaq(o.maq);
  if (parada <= limiteRAC(crit)) return false;
  const rac = (db.racs||[]).find(r => r.osNumero === o.numero);
  return !rac || rac.status !== 'Concluído';
} 
