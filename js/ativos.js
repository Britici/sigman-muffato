/* ══════════════════════════════════════════════════════════════════
   SIGMAN — ATIVOS
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */
let _editType=null,_editIdx=null;

function toggleAtFold(id) {
  document.getElementById(id).classList.toggle('open');
}

function renderAtivos() {
  populateAtMaqSala();
  popularModeloPadraoSelect();

  // Salas em ordem alfabética
  document.getElementById('at-sl').innerHTML = db.salas.length===0
    ? '<div class="empty"><p>Nenhuma sala.</p></div>'
    : [...db.salas].sort().map((s,i)=>`
      <div class="edit-row">
        <span style="font-size:15px;font-weight:500">${s}</span>
        <div class="edit-acts">
          <button class="btn btn-edit btn-sm" onclick="openEdit('sala',${db.salas.indexOf(s)})">✎</button>
          <button class="btn btn-d" onclick="delSala('${s}')">✕</button>
        </div>
      </div>`).join('');

  // Popula e aplica filtro de sala nas máquinas
  const filSel = document.getElementById('at-ml-fil');
  if (filSel) {
    const curFil = filSel.value;
    filSel.innerHTML = '<option value="">Todas as Salas</option>' + [...db.salas].sort().map(s=>`<option value="${s}">${s}</option>`).join('');
    if (curFil) filSel.value = curFil;
  }
  const filSala = filSel ? filSel.value : '';
  const buscaEl = document.getElementById('at-ml-busca');
  const busca = buscaEl ? buscaEl.value.trim().toUpperCase() : '';

  // Máquinas agrupadas por sala e em ordem alfabética
  const bySala = {};
  [...db.maquinas]
    .filter(m => !filSala || m.sala === filSala)
    .filter(m => !busca || m.nome.toUpperCase().includes(busca) || (m.tag||'').toUpperCase().includes(busca))
    .sort((a,b)=>(a.sala+a.nome).localeCompare(b.sala+b.nome)).forEach(m=>{
      if(!bySala[m.sala])bySala[m.sala]=[];bySala[m.sala].push(m);
    });

  document.getElementById('at-ml').innerHTML = Object.keys(bySala).length===0
    ? '<div class="empty"><p>Nenhuma máquina encontrada.</p></div>'
    : Object.keys(bySala).sort().map(sala=>`
    <div style="margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:1px;padding:6px 0;border-bottom:1px solid var(--bord);margin-bottom:4px;display:flex;justify-content:space-between">
        <span>${sala}</span><span style="color:var(--txt3);font-weight:400">${bySala[sala].length}</span>
      </div>
      ${bySala[sala].map((m,_i)=>{
        const gi=db.maquinas.indexOf(m);
        const critColor={'1':'#ff2244','2':'var(--red)','3':'var(--org)','4':'var(--grn)','Alta':'var(--red)','Média':'var(--org)','Baixa':'var(--grn)'}[m.criticidade]||'var(--txt3)';
        return `<div class="edit-row">
          <div>
            <div style="font-size:15px;font-weight:500">${m.nome}${m.tag?` <span style="font-size:11px;color:var(--txt3)">${m.tag}</span>`:''}</div>
            <div style="font-size:13px;color:var(--txt3)">
              Criticidade: <span style="color:${critColor};font-weight:600">${m.criticidade||'—'}</span> |
              Preventiva: ${m.periodicidade||'—'}${m.modeloPadrao?` | Modelo: <span style="color:var(--txt2)">${m.modeloPadrao}</span>`:''}
            </div>
          </div>
          <div class="edit-acts">
            <button class="btn btn-edit btn-sm" onclick="openEdit('maq',${gi})">✎</button>
            <button class="btn btn-d" onclick="delMaq(${gi})">✕</button>
          </div>
        </div>`;
      }).join('')}
    </div>`).join('');

  // Gráfico de criticidade
  renderCritChart();
}

async function popularModeloPadraoSelect() {
  const sel = document.getElementById('at-mmp');
  if (!sel) return;
  const cur = sel.value;
  try {
    if (!PREV_MODELOS_CACHE) PREV_MODELOS_CACHE = await apiGet({ action: 'planos_list' });
    sel.innerHTML = '<option value="">Nenhum (seleciona manual na OS)</option>' +
      PREV_MODELOS_CACHE.map(n=>`<option value="${n}">${n}</option>`).join('');
    if (cur) sel.value = cur;
  } catch(e) { /* silencioso — não bloqueia a página de Ativos por causa do modelo */ }
}

function renderCritChart() {
  const cont = document.getElementById('at-crit-chart');
  if (!cont) return;
  const counts = {'1':0,'2':0,'3':0,'4':0};
  db.maquinas.forEach(m => {
    const k = {Alta:'2',Média:'3',Baixa:'4'}[m.criticidade] || m.criticidade;
    if (counts[k] !== undefined) counts[k]++;
  });
  const total = db.maquinas.length;
  if (!total) {
    cont.innerHTML = '<div style="text-align:center;color:var(--txt3);padding:20px;font-size:14px">Nenhuma máquina cadastrada</div>';
    return;
  }
  const colors = {'1':'#ff2244','2':'#f59e0b','3':'#4096ff','4':'#1fd988'};
  const labels = {'1':'1 – Crítico','2':'2 – Alta','3':'3 – Média','4':'4 – Baixa'};

  const sz = 108, r = 36, cx = 54, cy = 54, sw = 15;
  const circ = 2 * Math.PI * r;
  let offset = 0, arcs = '';
  const entries = Object.entries(counts).filter(([,n]) => n > 0);
  entries.forEach(([k, n]) => {
    const dash = (n / total) * circ;
    arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${colors[k]}" stroke-width="${sw}"
      stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})">
      <title>${labels[k]}: ${n} (${Math.round(n/total*100)}%)</title></circle>`;
    offset += dash;
  });

  const legendaHtml = entries.map(([k, n]) => `
    <div style="display:flex;align-items:center;gap:6px;white-space:nowrap">
      <span style="width:10px;height:10px;border-radius:2px;background:${colors[k]};flex-shrink:0"></span>
      <span style="font-size:13px;font-weight:700;color:var(--txt2)">${k}</span>
      <span style="font-size:13px;color:var(--txt3)">${Math.round(n/total*100)}%</span>
    </div>`).join('');

  const allBars = [...Object.entries(counts), ['T', total]];
  const barCols = {'1':'#ff2244','2':'#f59e0b','3':'#4096ff','4':'#1fd988','T':'#999999'};
  const barLbls = {'1':'1','2':'2','3':'3','4':'4','T':'Total'};
  const maxVal = Math.max(...allBars.map(([,n]) => n), 1);
  const chartH = 90, barW = 26, gap = 10, startX = 10, topPad = 16;
  const svgW = startX * 2 + allBars.length * (barW + gap);
  let barsSvg = '';
  allBars.forEach(([k, n], i) => {
    const x = startX + i * (barW + gap);
    const bh = Math.max(6, Math.round((n / maxVal) * chartH));
    const y = chartH - bh + topPad;
    barsSvg += `
      <rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="3"
        fill="${barCols[k]}" opacity="0.88"/>
      <text x="${x + barW/2}" y="${y - 4}" text-anchor="middle"
        font-size="11" font-weight="800" fill="var(--txt)" font-family="var(--fw)">${n}</text>
      <text x="${x + barW/2}" y="${chartH + topPad + 13}" text-anchor="middle"
        font-size="9" fill="var(--txt3)" font-family="var(--fw)" font-weight="700">${barLbls[k]}</text>`;
  });

  cont.innerHTML = `
    <div style="display:flex;gap:20px;align-items:center;flex-wrap:nowrap;overflow-x:auto">
      <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
        <div style="text-align:center">
          <div style="font-size:11px;font-weight:700;color:var(--txt3);font-variant:small-caps;letter-spacing:.8px;margin-bottom:4px">Visão Geral</div>
          <svg width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surf3)" stroke-width="${sw}"/>
            ${arcs}
            <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
              font-size="16" font-weight="800" fill="var(--txt)" font-family="var(--fw)">${total}</text>
          </svg>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0">
          ${legendaHtml}
        </div>
      </div>
      <div style="flex:1;min-width:160px">
        <div style="font-size:11px;font-weight:700;color:var(--txt3);font-variant:small-caps;letter-spacing:.8px;margin-bottom:6px">Quantidade da Distribuição</div>
        <svg width="100%" height="${chartH + topPad + 18}" viewBox="0 0 ${svgW} ${chartH + topPad + 18}" preserveAspectRatio="xMidYMid meet">
          ${barsSvg}
        </svg>
      </div>
    </div>`;
}

function addSala() {
  const nome = v('at-sn').trim().toUpperCase();
  if (!nome) { showToast('Informe o nome da sala.'); return; }
  if (db.salas.includes(nome)) { showToast('Sala já existe.'); return; }
  db.salas.push(nome);
  db.salas.sort();
  saveDB();
  sv('at-sn', '');
  populateAll();
  renderAtivos();
  apiAppend('salas', { Nome: nome, Ativo: 'sim', Criado_Em: new Date().toISOString() });
}

function addMaq() {
  const sala=v('at-ms'), nome=v('at-mn').trim().toUpperCase(),
  tag=v('at-mt').trim().toUpperCase(), crit=v('at-mc')||'Média', per=v('at-mp')||'Mensal',
  modeloPadrao=v('at-mmp')||'';
  if(!sala||!nome){showToast('Selecione sala e informe o nome.');return;}
  const id=(sala+'_'+nome).replace(/\s+/g,'_');
  db.maquinas.push({id,nome,sala,tag,criticidade:crit,periodicidade:per,modeloPadrao});
  db.maquinas.sort((a,b)=>(a.sala+a.nome).localeCompare(b.sala+b.nome));
  saveDB(); sv('at-mn',''); sv('at-mt',''); populateAll(); renderAtivos();
  apiAppend('maquinas',{ID_Maquina:id,Sala:sala,Nome:nome,Tag:tag,
  Criticidade:crit,Periodicidade_Preventiva:per,ModeloPadrao:modeloPadrao,Descricao:'',Ativo:'sim',Criado_Em:new Date().toISOString()});
}

function delSala(nome) {
  if(!confirm(`Remover sala "${nome}" e suas máquinas?`))return;
  db.salas=db.salas.filter(s=>s!==nome);
  db.maquinas=db.maquinas.filter(m=>m.sala!==nome);
  saveDB();populateAll();renderAtivos();
  apiDelete('salas',nome,'Nome');
}

function delMaq(i) {
  if(!confirm('Remover máquina?'))return;
  const m=db.maquinas[i];
  db.maquinas.splice(i,1);saveDB();populateAll();renderAtivos();
  if(m)apiDelete('maquinas',m.id,'ID_Maquina');
}

// Editar sala/máquina
function openEdit(type,idx) {
  _editType=type;_editIdx=idx;
  if(type==='sala'){
    document.getElementById('me-t').textContent='Editar Sala';
    document.getElementById('me-b').innerHTML=`<div class="fg"><label>Nome da Sala</label><input type="text" id="me-v" value="${db.salas[idx]}"></div>`;
  } else if(type==='maq') {
    const m=db.maquinas[idx];
    document.getElementById('me-t').textContent='Editar Máquina';
    document.getElementById('me-b').innerHTML=`
      <div class="fg"><label>Sala</label>
        <select id="me-sl">${db.salas.sort().map(s=>`<option${s===m.sala?' selected':''}>${s}</option>`).join('')}</select>
      </div>
      <div class="fg"><label>Nome</label><input type="text" id="me-nm" value="${m.nome}"></div>
      <div class="fg"><label>Tag</label><input type="text" id="me-tg" value="${m.tag||''}"></div>
      <div class="fg"><label>Criticidade</label>
        <select id="me-crit">
          <option value="1"${m.criticidade==='1'?' selected':''}>1 – Crítico</option>
          <option value="2"${(m.criticidade==='2'||m.criticidade==='Alta')?' selected':''}>2 – Alta</option>
          <option value="3"${(m.criticidade==='3'||m.criticidade==='Média')?' selected':''}>3 – Média</option>
          <option value="4"${(m.criticidade==='4'||m.criticidade==='Baixa')?' selected':''}>4 – Baixa</option>
        </select>
      </div>
      <div class="fg"><label>Periodicidade Preventiva</label>
        <select id="me-per">
          <option${m.periodicidade==='Diária'?' selected':''}>Diária</option>
          <option${m.periodicidade==='Semanal'?' selected':''}>Semanal</option>
          <option${m.periodicidade==='Mensal'?' selected':''}>Mensal</option>
          <option${m.periodicidade==='Trimestral'?' selected':''}>Trimestral</option>
          <option${m.periodicidade==='Semestral'?' selected':''}>Semestral</option>
          <option${m.periodicidade==='Anual'?' selected':''}>Anual</option>
        </select>
      </div>
      <div class="fg"><label>Modelo de Manutenção Padrão</label>
        <select id="me-mp">${['<option value="">Nenhum</option>'].concat((PREV_MODELOS_CACHE||[]).map(n=>`<option value="${n}"${n===m.modeloPadrao?' selected':''}>${n}</option>`)).join('')}</select>
      </div>`;
  } else if(type==='plan') {
    // editarPlan já preenche me-b antes de abrir
  }
  openM('m-edit');
}

function salvarEdit() {
  if(_editType==='sala'){
    const nv=v('me-v').trim().toUpperCase();if(!nv)return;
    const old=db.salas[_editIdx];
    db.salas[_editIdx]=nv;db.maquinas.forEach(m=>{if(m.sala===old)m.sala=nv;});
    saveDB();populateAll();renderAtivos();closeM('m-edit');
    apiUpdate('salas',old,'Nome',{Nome:nv});
  } else if(_editType==='maq') {
    const old=db.maquinas[_editIdx];
    const nv={id:old.id,nome:v('me-nm').trim().toUpperCase(),sala:v('me-sl'),tag:v('me-tg').trim().toUpperCase(),
    criticidade:v('me-crit'),periodicidade:v('me-per'),modeloPadrao:v('me-mp')||''};
    db.maquinas[_editIdx]=nv;
    db.maquinas.sort((a,b)=>(a.sala+a.nome).localeCompare(b.sala+b.nome));
    saveDB();populateAll();renderAtivos();closeM('m-edit');
    apiUpdate('maquinas',old.id,'ID_Maquina',{Sala:nv.sala,Nome:nv.nome,Tag:nv.tag,
    Criticidade:nv.criticidade,Periodicidade_Preventiva:nv.periodicidade,ModeloPadrao:nv.modeloPadrao});
  } else if(_editType==='plan') {
    const p = db.planejadas.find(x => x.numero === _editIdx);
    if (!p) return;
    p.sala = v('ep-sala') || p.sala;
    p.maq = v('ep-maq') || p.maq;
    p.tipo = v('ep-tipo') || p.tipo;
    p.prioridade = v('ep-prio') || p.prioridade;
    p.prazo = v('ep-prazo') || p.prazo;
    p.horasTurno = parseInt(v('ep-horas')) || p.horasTurno;
    p.status = v('ep-status') || p.status;
    p.desc = v('ep-desc');
    logEdit('Editou Planejada', p.numero,
      `${p.sala} · ${p.maq} · Status: ${p.status} · Prazo: ${p.prazo}`);
    saveDB(); renderPlan(); closeM('m-edit');
    apiUpdate('planejadas', p.numero, 'PL_Numero', {
      Sala: p.sala,
      Maquina: p.maq,
      Tipo: p.tipo,
      Prioridade: p.prioridade,
      Prazo_Limite: p.prazo,
      Horas_Turno: p.horasTurno,
      Status: p.status,
      Descricao_Planejada:p.desc
    });
  }
}
