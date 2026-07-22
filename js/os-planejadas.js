/* ══════════════════════════════════════════════════════════════════
   SIGMAN — O.S. PLANEJADAS
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */

var planSort = { col: 'numero', dir: 'desc' };

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

  const tx  = (v('fp-tx') || '').toLowerCase();
  const tp  = v('fp-tp');
  const sl  = v('fp-sl');
  const st  = v('fp-st');
  const dtI = v('fp-dt-ini');
  const dtF = v('fp-dt-fim');

  let data = [...db.planejadas];
  if (tx)  data = data.filter(p => [p.numero, p.sala, p.maq, p.tipo].some(x => x && x.toLowerCase().includes(tx)));
  if (tp)  data = data.filter(p => p.tipo === tp);
  if (sl)  data = data.filter(p => p.sala === sl);
  if (st)  data = data.filter(p => p.status === st);
  if (dtI) data = data.filter(p => p.prazo >= dtI);
  if (dtF) data = data.filter(p => p.prazo <= dtF);

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
      <button class="btn btn-sm btn-gh" onclick="editarPlan('${p.numero}')">✎ Editar</button>
      <button class="btn btn-sm btn-gh" onclick="verDet('${p.numero}','pl')">Ver</button>
      <button class="btn btn-d" onclick="delPlan('${p.numero}')">✕</button>
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
  const tx  = (v('fp-tx') || '').toLowerCase();
  const tp  = v('fp-tp');
  const sl  = v('fp-sl');
  const st  = v('fp-st');
  const dtI = v('fp-dt-ini');
  const dtF = v('fp-dt-fim');
  let data = [...db.planejadas];
  if (tx)  data = data.filter(p => [p.numero, p.sala, p.maq, p.tipo].some(x => x && x.toLowerCase().includes(tx)));
  if (tp)  data = data.filter(p => p.tipo === tp);
  if (sl)  data = data.filter(p => p.sala === sl);
  if (st)  data = data.filter(p => p.status === st);
  if (dtI) data = data.filter(p => p.prazo >= dtI);
  if (dtF) data = data.filter(p => p.prazo <= dtF);
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
  a.download = `SIGMAN_Planejadas_${today()}${tp?'_'+tp:''}${sl?'_'+sl:''}${st?'_'+st:''}.csv`;
  a.click();
}

function editarPlan(id) {
  const p = db.planejadas.find(x => x.numero === id);
  if (!p) return;
  document.getElementById('me-t').textContent = 'Editar O.S. Planejada — ' + p.numero;

  const salasOpts = db.salas.sort().map(s =>
    `<option value="${s}"${s===p.sala?' selected':''}>${s}</option>`
  ).join('');

  const maqsFiltradas = db.maquinas.filter(m => m.sala === p.sala);
  const maqsOpts = maqsFiltradas.sort((a,b)=>a.nome.localeCompare(b.nome)).map(m =>
    `<option value="${m.nome}"${m.nome===p.maq?' selected':''}>${m.nome}${m.tag?' ('+m.tag+')':''}</option>`
  ).join('');

  document.getElementById('me-b').innerHTML = `
    <div class="fg"><label>Sala / Local</label>
      <select id="ep-sala" onchange="epFiltrarMaq()">
        <option value="">Selecione...</option>
        ${salasOpts}
        <option value="__outros__"${p.sala==='__outros__'?' selected':''}>Outros</option>
      </select>
    </div>
    <div class="fg"><label>Máquina / Ativo</label>
      <select id="ep-maq">
        <option value="">Selecione...</option>
        ${maqsOpts}
        <option value="__outros__"${p.maq==='__outros__'?' selected':''}>Outros</option>
      </select>
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
  
function delPlan(id) {
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
