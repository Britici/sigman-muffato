/* ══════════════════════════════════════════════════════════════════
   SIGMAN — O.S. PLANEJADAS
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */

var planSort = { col: 'numero', dir: 'desc' };
var solSort  = { col: 'crit', dir: 'asc' }; // aba Solicitações (Planejadas): padrão = mais crítico primeiro
var solPgSort = { col: 'numero', dir: 'desc' }; // tela Solicitação de O.S.: padrão = mais recente primeiro

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

// Data local (BRT) a partir do ISO de criadoEm. Evita o erro de fuso de usar
// slice(0,10) direto no UTC (solicitação aberta à noite caía no dia seguinte).
function dtLocalSol_(iso) {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return String(iso);
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Solicitações da Produção — aba "Solicitações" de Planejadas.
// concl=false: não concluídas (cartão de cima). concl=true: concluídas (cartão de baixo).
// Mesmos filtros do topo; as datas filtram pela data de abertura.
function filtrarSol_(concl) {
  const tx  = (v('fp-tx') || '').toLowerCase();
  const tp  = v('fp-tp');
  const sl  = v('fp-sl');
  const st  = v('fp-st');
  const dtI = v('fp-dt-ini');
  const dtF = v('fp-dt-fim');
  let data = (db.solicitacoes || []).filter(s => concl ? s.status === 'Concluída' : s.status !== 'Concluída');
  if (tx)  data = data.filter(s => [s.numero, s.sala, s.maq, s.tipo, s.solicitante, s.desc].some(x => x && String(x).toLowerCase().includes(tx)));
  if (tp)  data = data.filter(s => s.tipo === tp);
  if (sl)  data = data.filter(s => s.sala === sl);
  if (st)  data = data.filter(s => s.status === st);
  if (dtI) data = data.filter(s => dtLocalSol_(s.criadoEm) >= dtI);
  if (dtF) data = data.filter(s => dtLocalSol_(s.criadoEm) <= dtF);
  ordenarSol_(data);
  return data;
}

function ordenarSol_(data, st) {
  st = st || solSort;
  const col = st.col, m = st.dir === 'asc' ? 1 : -1;
  const prioMap = { '1':1, '2':2, '3':3, '4':4, 'Urgente':1, 'Alta':2, 'Média':3, 'Baixa':4 };
  const porNumero = (a, b) => String(b.numero || '').localeCompare(String(a.numero || ''), 'pt-BR', { numeric: true });
  data.sort((a, b) => {
    if (col === 'crit') {
      const d = getCriticidadeMaq(a.maq) - getCriticidadeMaq(b.maq);
      return d !== 0 ? d * m : porNumero(a, b);
    }
    if (col === 'prioridade') {
      const d = (prioMap[a.prioridade] || 9) - (prioMap[b.prioridade] || 9);
      return d !== 0 ? d * m : porNumero(a, b);
    }
    if (col === 'criado') {
      const d = String(a.criadoEm || '').localeCompare(String(b.criadoEm || ''));
      return d !== 0 ? d * m : porNumero(a, b);
    }
    const va = String(a[col] || ''), vb = String(b[col] || '');
    const d = va.localeCompare(vb, 'pt-BR', { numeric: true });
    return d !== 0 ? d * m : porNumero(a, b);
  });
}

function _alternaSort_(st, col) {
  if (st.col === col) {
    st.dir = st.dir === 'asc' ? 'desc' : 'asc';
  } else {
    st.col = col;
    st.dir = (col === 'numero' || col === 'criado') ? 'desc' : 'asc';
  }
}

function sortSol(col) {   // aba Solicitações de Planejadas
  _alternaSort_(solSort, col);
  renderSolPanel_();
}

function sortSolPg(col) { // tela Solicitação de O.S.
  _alternaSort_(solPgSort, col);
  if (typeof renderSol === 'function') renderSol();
}

function setPlanAba(aba) {
  if (['preventivas', 'outras', 'solicitacoes'].indexOf(aba) < 0) return;
  planAba = aba;
  const tp = document.getElementById('fp-tp');
  if (tp) tp.value = ''; // o filtro de tipo conflita com a aba
  const st = document.getElementById('fp-st');
  if (st) st.value = ''; // status de Planejadas e de Solicitações são diferentes
  renderPlan();
}

function ensurePlanAbasUI_() {
  if (document.getElementById('plan-abas')) return;
  const tb  = document.getElementById('tb-plan');
  const tbl = tb && tb.closest('table');
  // .tw é só o wrapper com scroll/borda da tabela, sem padding — inserir ali
  // dentro deixa os botões colados na borda. O card (com padding de 18px) é
  // o pai do .tw; inserimos como irmãos do .tw, dentro do card.
  const tw   = tbl && tbl.closest('.tw');
  const card = tw && tw.parentNode;
  if (!tw || !card) return;
  const bar = document.createElement('div');
  bar.id = 'plan-abas';
  bar.style.cssText = 'display:flex;gap:6px;margin:0 0 12px;flex-wrap:wrap';
  bar.innerHTML =
    '<button id="pab-preventivas" class="btn btn-sm" onclick="setPlanAba(\'preventivas\')"></button>' +
    '<button id="pab-outras" class="btn btn-sm" onclick="setPlanAba(\'outras\')"></button>' +
    '<button id="pab-solicitacoes" class="btn btn-sm" onclick="setPlanAba(\'solicitacoes\')"></button>';
  const panel = document.createElement('div');
  panel.id = 'plan-prev-panel';
  panel.className = 'card'; // mesmo padding/borda dos outros cards da tela (antes era CSS avulso)
  panel.style.cssText = 'display:none;margin:0 0 14px';
  // Aba Solicitações: mesma estrutura das outras (tabela dentro de .tw), sem card aninhado.
  const solPanel = document.createElement('div');
  solPanel.id = 'plan-sol-panel';
  solPanel.style.cssText = 'display:none';
  card.insertBefore(panel, tw);
  card.insertBefore(bar, panel);
  card.insertBefore(solPanel, tw); // fica logo antes da tabela, que é escondida nesta aba
  // Cartão "Concluídas" (embaixo): na aba Solicitações mostra as solicitações concluídas.
  const tbC0  = document.getElementById('tb-plan-concluidas');
  const twC0  = tbC0 && tbC0.closest('.tw');
  if (twC0 && twC0.parentNode) {
    const solConcl = document.createElement('div');
    solConcl.id = 'plan-sol-concl-panel';
    solConcl.style.cssText = 'display:none';
    twC0.parentNode.insertBefore(solConcl, twC0);
  }
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

  const sol = planAba === 'solicitacoes';
  const tb  = document.getElementById('tb-plan');
  const tbl = tb && tb.closest('table');
  if (tbl) tbl.style.display = sol ? 'none' : '';
  const tbC  = document.getElementById('tb-plan-concluidas');
  const twC  = tbC && tbC.closest('.tw');
  if (twC) twC.style.display = sol ? 'none' : '';

  // Filtros do topo mudam de significado na aba Solicitações.
  const stSel = document.getElementById('fp-st');
  const modo  = sol ? 'sol' : 'plan';
  if (stSel && stSel.dataset.modo !== modo) {
    stSel.innerHTML = sol
      ? '<option value="">Todos os Status</option><option>Não Executada</option><option>Concluída</option>'
      : '<option value="">Todos os Status</option><option>Pendente</option><option>Concluída</option><option>Atrasada</option>';
    stSel.value = '';
    stSel.dataset.modo = modo;
  }
  const dI = document.getElementById('fp-dt-ini_disp'), dF = document.getElementById('fp-dt-fim_disp');
  if (dI) dI.title = sol ? 'Abertura inicial' : 'Prazo inicial';
  if (dF) dF.title = sol ? 'Abertura final'   : 'Prazo final';

  renderPrevPanel_();
  renderSolPanel_();
}

// Linha da tabela de Solicitações (mesmo padrão visual das outras abas).
function solRowHtml_(s) {
  // Mesma regra de quem abre O.S. (ROLES.administracao/.manutencao têm 'abertura'
  // em core.js; produção e diretoria não têm).
  const podeExecutar = typeof CU !== 'undefined' && CU &&
    (CU.tipo === 'administracao' || CU.tipo === 'manutencao');
  const osGerada = (db.ordens.find(o => o.origem === 'sol' && o.origemNum === s.numero) || {}).numero;
  const num = String(s.numero).replace(/'/g, "\\'");
  const abertura = dtLocalSol_(s.criadoEm);
  return '<tr>' +
    '<td><span class="osn">' + _escPl(s.numero) + '</span>' +
      (osGerada ? '<div style="text-align:left;font-size:11px;color:var(--txt2);margin-top:1px">(' + _escPl(osGerada) + ')</div>' : '') + '</td>' +
    '<td>' + _escPl(s.sala) + '</td>' +
    '<td>' + _escPl(s.maq) + '<div style="margin-top:2px">' + getCriticidadeBadge(s.maq) + '</div></td>' +
    '<td>' + tipoBadge(s.tipo) + '</td>' +
    '<td>' + prio(s.prioridade) + '</td>' +
    '<td style="font-family:var(--fm);font-size:13px">' + _escPl(abertura ? fd(abertura) : '—') + '</td>' +
    '<td>' + _escPl(s.solicitante || '—') + '</td>' +
    '<td style="min-width:180px;max-width:260px;white-space:normal;font-size:13px;color:var(--txt2)">' + _escPl(s.desc || '—') + '</td>' +
    '<td>' + stBadge(s.status) + '</td>' +
    '<td><div style="display:flex;gap:4px;flex-wrap:nowrap;align-items:center">' +
      (s.status !== 'Concluída' && podeExecutar ? '<button class="btn btn-sm btn-g" onclick="abrirConcluir(\'' + num + '\',\'sol\')">Concluir</button>' : '') +
      (osGerada
        ? '<button class="btn btn-sm btn-gh" onclick="verDet(\'' + String(osGerada).replace(/'/g, "\\'") + '\',\'os\')">Ver</button>'
        : '<button class="btn btn-sm btn-gh" onclick="verDet(\'' + num + '\',\'sol\')">Ver</button>') +
    '</div></td></tr>';
}

function solTabelaHtml_(lista, ordenavel, vazio, st, handler) {
  st = st || solSort; handler = handler || 'sortSol';
  const th = (col, rotulo, estilo) => ordenavel
    ? '<th class="sortable' + (st.col === col ? ' ' + st.dir : '') + '" onclick="' + handler + '(\'' + col + '\')"' + (estilo ? ' style="' + estilo + '"' : '') + '>' + rotulo + '</th>'
    : '<th' + (estilo ? ' style="' + estilo + '"' : '') + '>' + rotulo + '</th>';
  return '<div class="tw"><table><thead><tr>' +
    th('numero', 'SOL #', 'width:100px;min-width:100px') + th('sala', 'Sala') + th('maq', 'Máquina') +
    th('tipo', 'Tipo') + th('prioridade', 'Prioridade') + th('criado', 'Aberta em') +
    th('solicitante', 'Solicitante') + th('desc', 'Descrição') + th('status', 'Status') +
    '<th>Ações</th></tr></thead><tbody>' +
    (lista.length ? lista.map(solRowHtml_).join('')
      : '<tr><td colspan="10" class="empty"><div class="ei">✅</div><p>' + vazio + '</p></td></tr>') +
    '</tbody></table></div>';
}

function renderSolPanel_() {
  const el  = document.getElementById('plan-sol-panel');
  const elC = document.getElementById('plan-sol-concl-panel');
  const ativo = planAba === 'solicitacoes';
  if (el)  el.style.display  = ativo ? 'block' : 'none';
  if (elC) elC.style.display = ativo ? 'block' : 'none';
  if (!ativo) return;
  if (el)  el.innerHTML  = solTabelaHtml_(filtrarSol_(false), true,  'Nenhuma solicitação não concluída.');
  if (elC) elC.innerHTML = solTabelaHtml_(filtrarSol_(true),  false, 'Nenhuma solicitação concluída.');
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

function exportSolCSV_() {
  const data = filtrarSol_(false).concat(filtrarSol_(true));
  if (!data.length) { showToast('Sem dados para exportar com os filtros selecionados.', 'war'); return; }
  const cel = x => '"' + String(x === null || x === undefined ? '' : x).replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
  const h = ['SOL_Numero','Sala','Maquina','Tipo','Prioridade','Aberta_Em','Solicitante','Descricao','Status','Manutentor_Exec','Data_Execucao','Servico_Executado'];
  const rows = data.map(s => [
    s.numero, s.sala, s.maq, s.tipo, s.prioridade || '', dtLocalSol_(s.criadoEm), s.solicitante || '',
    s.desc || '', s.status || '', s.manut || '', s.dtExec || '', s.desc2 || ''
  ].map(cel).join(','));
  const csv = [h.map(cel).join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `SIGMAN_Solicitacoes_${today()}${v('fp-sl')?'_'+v('fp-sl'):''}${v('fp-st')?'_'+v('fp-st'):''}.csv`;
  a.click();
}

function exportPlanCSV() {
  if (planAba === 'solicitacoes') { exportSolCSV_(); return; }
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
