/* ══════════════════════════════════════════════════════════════════
   SIGMAN — ABERTURA DE O.S.
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */

async function salvarOS() {
  const sala = v('ab-sl'), maq = v('ab-mq'), tipo = v('ab-tp'),
        pr   = v('ab-pr'), manut = v('ab-mn').trim(), data = v('ab-dt'),
        ini  = v('ab-in').trim(), fim  = v('ab-fm').trim(),
        prob = v('ab-pb').trim(), acao = v('ab-ac').trim(),
        acaoPrev = v('ab-ap').trim(),
        parada = v('ab-parada');
  if (!sala||!maq||!tipo||!pr||!manut||!data) {
    if (ini && !fim) { showAlert('al-ab','Se informar hora início, informe também fim.','er'); return; }
    if (fim && !ini) { showAlert('al-ab','Se informar hora fim, informe também início.','er'); return; }
    showAlert('al-ab','Preencha: Sala, Máquina, Tipo, Prioridade, Manutentor e Data.','er'); return;
  }
  if (ini && fim) {
    const [h1,m1]=ini.split(':').map(Number), [h2,m2]=fim.split(':').map(Number);
    if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) { showAlert('al-ab','Horas inválidas. Use HH:MM','er'); return; }
  }
  let durMin = 0, paradaMin = parseInt(parada)||0;
  if (ini && fim) {
    const [h1,m1]=ini.split(':').map(Number), [h2,m2]=fim.split(':').map(Number);
        durMin = (h2*60+m2)-(h1*60+m1);
    if (durMin < 0) durMin += 1440; // turno que passa da meia-noite
    durMin = Math.max(0, durMin);
    if (!paradaMin) paradaMin = durMin;
  }
  const numero = genOS(), agora = new Date().toISOString();
  if (db.ordens.find(o => o.numero === numero)) {
    showAlert('al-ab', `Erro: ${numero} já existe. Recarregue a página e tente novamente.`, 'er');
    return;
  }
  const os = { id: crypto.randomUUID(), numero, sala, maq, tipo, prioridade:pr, manut, data, ini, fim,
               durMin, paradaMin, prob, acao, acaoPrev, criadoEm:agora, origem:'direta' };
  db.osC++; db.ordens.push(os); saveDB(); updStats();
  logEdit('Criou OS', numero, sala + ' · ' + maq + ' · ' + tipo);
  showAlert('al-ab', `Registrando ${numero}...`, 'ok');
  // Upload da foto (async, não bloqueia)
  const fotoUrl = await uploadFotoOS(numero);
    apiAppend('ordens', {
    OS_Numero:numero, Data:data, Sala:sala, Maquina:maq, Tipo:tipo, Prioridade:pr,
    Manutentor:manut, Hora_Inicio:ini, Hora_Fim:fim, Duracao_Min:durMin,
    Tempo_Parada_Min:paradaMin, Problema:prob, Acao_Executada:acao,
    Acao_Preventiva:acaoPrev, Foto_URL:fotoUrl||'',
    Tag_Maquina:db.maquinas.find(m => m.nome === maq && m.sala === sala)?.tag || '',
    Origem:'direta', OS_Origem_Ref:'', Criado_Em:agora
  });
  showAlert('al-ab', `Ordem ${numero} registrada!${fotoUrl?' 📷 Foto enviada.':''}`, 'ok');
  clearAb();
  setTimeout(()=>showPage('dashboard'), 1200);
}

function clearAb() {
  ['ab-sl','ab-mq','ab-tp','ab-pr','ab-in','ab-fm','ab-pb','ab-ac','ab-ap','ab-parada'].forEach(id=>sv(id,''));
  sv('ab-dt', today());
  if (CU && CU.tipo !== 'producao') sv('ab-mn', CU.nome);
  _photoFile = null; _photoBase64 = null;
  const inp = document.getElementById('ab-photo-input');
  if (inp) inp.value = '';
  const prev = document.getElementById('ab-photo-preview');
  if (prev) prev.innerHTML = '<span style="color:var(--txt3);font-size:15px">📷 Clique para anexar foto</span>';
}

// ══════════════════════════════════════════════════════════════════════
// PLANEJAMENTO DE O.S.
// ══════════════════════════════════════════════════════════════════════
async function salvarPlan() {
  const sala=v('pl-sl'),maq=v('pl-mq'),tipo=v('pl-tp'),
        pr=v('pl-pr'),prazo=v('pl-pz'),desc=v('pl-ds').trim(),
        horas=parseInt(v('pl-horas'))||8;
  if (!sala||!maq||!tipo||!pr||!prazo) { showAlert('al-pl','Preencha todos os campos obrigatórios.','er'); return; }
  const numero = genPL(), agora = new Date().toISOString();
  if (db.planejadas.find(p => p.numero === numero)) {
    showAlert('al-pl', `Erro: ${numero} já existe. Recarregue e tente novamente.`, 'er');
    return;
  }
  db.planejadas.push({id:crypto.randomUUID(),numero,sala,maq,tipo,prioridade:pr,prazo,horasTurno:horas,desc,
    status:'Pendente',criadoEm:agora,manut:null,desc2:null,ini:null,fim:null,dtExec:null,durMin:0});
  db.plC++; saveDB();
  logEdit('Criou Planejada', numero, sala + ' · ' + maq + ' · Prazo: ' + prazo);
  apiAppend('planejadas',{PL_Numero:numero,Sala:sala,Maquina:maq,Tipo:tipo,Prioridade:pr,
    Prazo_Limite:prazo,Horas_Turno:horas,Descricao_Planejada:desc,Status:'Pendente',
    Manutentor_Exec:'',Data_Execucao:'',Hora_Inicio:'',Hora_Fim:'',Duracao_Min:'',
    Servico_Executado:'',Criado_Em:agora,Concluido_Em:''});
  showAlert('al-pl','O.S. Planejada criada!','ok');
  clearPl();
  setTimeout(()=>showPage('dashboard'),900);
}
function clearPl(){['pl-sl','pl-mq','pl-tp','pl-pr','pl-pz','pl-ds'].forEach(id=>sv(id,''));sv('pl-horas','8');}
  
// ══════════════════════════════════════════════════════════════════════
// SOLICITAÇÕES
// ══════════════════════════════════════════════════════════════════════
  let _solPhotoFile = null, _solPhotoBase64 = null;

function previewSolPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  _solPhotoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const MAX_W = 1920, MAX_H = 1080, MAX_BYTES = 1 * 1024 * 1024;
      let w = img.width, h = img.height;
      if (w > MAX_W || h > MAX_H) {
        const ratio = Math.min(MAX_W / w, MAX_H / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      let quality = 0.92;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length * 0.75 > MAX_BYTES && quality > 0.4) {
        quality -= 0.06;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      _solPhotoBase64 = dataUrl.split(',')[1];
      const byteSize = Math.round(_solPhotoBase64.length * 0.75 / 1024);
      document.getElementById('sol-photo-preview').innerHTML = `
        <img src="${dataUrl}" style="max-height:80px;max-width:120px;border-radius:4px;object-fit:cover" alt="Foto">
        <div style="font-size:13px;color:var(--txt2);margin-top:4px">
          <strong>${file.name}</strong><br>
          <span style="color:var(--txt3)">${byteSize} KB (redimensionado)</span><br>
          <button class="btn btn-sm" onclick="removeSolPhoto(event)" style="margin-top:5px;background:rgba(196,18,48,.12);color:#ff4d65;border:1px solid rgba(196,18,48,.3);padding:3px 8px">🗑 Remover</button>
        </div>`;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeSolPhoto(e) {
  e && e.stopPropagation();
  _solPhotoFile = null; _solPhotoBase64 = null;
  const inp = document.getElementById('sol-photo-input');
  if (inp) inp.value = '';
  const prev = document.getElementById('sol-photo-preview');
  if (prev) prev.innerHTML = '<span style="color:var(--txt3);font-size:15px">📷 Clique para anexar foto</span>';
}
async function salvarSol() {
  const sala=v('sol-sl'),maq=v('sol-mq'),tipo=v('sol-tp'),
        pr=v('sol-pr'),desc=v('sol-ds').trim();
  if (!sala||!maq||!tipo||!pr||!desc){showAlert('al-sol','Preencha todos os campos.','er');return;}
  const numero = genSOL(), agora = new Date().toISOString();
  if (db.solicitacoes.find(s => s.numero === numero)) {
    showAlert('al-sol', `Erro: ${numero} já existe. Recarregue e tente novamente.`, 'er');
    return;
  }
    const solItem = {id:crypto.randomUUID(),numero,sala,maq,tipo,prioridade:pr,desc,
    status:'Não Executada',solicitante:CU.nome,criadoEm:agora,fotoUrl:''};
  db.solicitacoes.push(solItem);
  db.solC++;saveDB();
  let fotoUrl = '';
  if (_solPhotoBase64 && typeof USE_API !== 'undefined' && USE_API) {
    try {
      const ext = (_solPhotoFile.name.split('.').pop() || 'jpg').toLowerCase();
      const resp = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action:'uploadFoto', numero, fileName: numero+'.'+ext,
          mimeType: _solPhotoFile.type||'image/jpeg', base64: _solPhotoBase64 })
      });
      const r = await resp.json();
      if (r.ok) { fotoUrl = r.fileUrl; solItem.fotoUrl = fotoUrl; saveDB(); }
    } catch(e) { console.warn('Foto não enviada:', e); }
  }
  apiAppend('solicitacoes',{SOL_Numero:numero,Sala:sala,Maquina:maq,Tipo:tipo,Prioridade:pr,
    Descricao:desc,Status:'Não Executada',Solicitante:CU.nome,Foto_URL:fotoUrl||'',
    Manutentor_Exec:'',Data_Execucao:'',Servico_Executado:'',Criado_Em:agora,Concluido_Em:''});
  logEdit('Criou Solicitação', numero, sala + ' · ' + maq + ' · ' + tipo);
  showAlert('al-sol','Solicitação enviada!','ok');
  clearSol();renderSol();
  setTimeout(()=>showPage('dashboard'),900);
}
function clearSol() {
  ['sol-sl','sol-mq','sol-tp','sol-pr','sol-ds'].forEach(id=>sv(id,''));
  removeSolPhoto();
}

function renderSol() {
  const sortVal = (document.getElementById('sol-sort') || {}).value || 'numero-desc';
  const [col, dir] = sortVal.split('-');
  const prioMap = { '1':1, 'Alta':2, '2':2, 'Média':3, '3':3, 'Baixa':4, '4':4 };
  const stMap   = { 'Não Executada':1, 'Concluída':2, 'Executada':3 };
  let list = [...db.solicitacoes];
  if (CU && CU.tipo === 'producao') list = list.filter(s => s.solicitante === CU.nome);
  list.sort((a, b) => {
    let va = a[col] || '', vb = b[col] || '';
    if (col === 'prioridade') { va = prioMap[va] || 9; vb = prioMap[vb] || 9; return dir === 'asc' ? va - vb : vb - va; }
    if (col === 'status')     { va = stMap[va]   || 9; vb = stMap[vb]   || 9; return dir === 'asc' ? va - vb : vb - va; }
    const cmp = va.localeCompare(vb, 'pt-BR', { numeric: true });
    return dir === 'asc' ? cmp : -cmp;
  });
  const c = document.getElementById('sol-lista');
  const cC = document.getElementById('sol-lista-concluidas');
  const rowHtml = s => {
    const osGerada = (db.ordens.find(o => o.origem==='sol' && o.origemNum===s.numero)||{}).numero;
    return `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--bord);gap:10px">
      <div>
        <span class="osn">${s.numero}</span>${osGerada?` <span style="font-size:11px;color:var(--txt2)">(${osGerada})</span>`:''}
        <div style="font-size:15px;font-weight:500;margin-top:2px">${s.sala} · ${s.maq}</div>
        <div style="font-size:13px;color:var(--txt3)">${fd((s.criadoEm||'').slice(0,10))} · ${s.solicitante}</div>
        <div style="font-size:14px;color:var(--txt2);margin-top:3px">${s.desc}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
        ${prio(s.prioridade)}${stBadge(s.status)}
        ${CU&&CU.tipo!=='producao'&&s.status==='Não Executada'
          ?`<button class="btn btn-sm btn-g" onclick="abrirConcluir('${s.numero}','sol')">✓ Executar</button>`:''}
        ${osGerada?`<button class="btn btn-sm btn-gh" onclick="verDet('${osGerada}','os')">Ver</button>`:''}
      </div>
    </div>`;
  };

  const naoConcl = list.filter(s => s.status !== 'Concluída');
  const concl    = list.filter(s => s.status === 'Concluída');

  c.innerHTML = naoConcl.length ? naoConcl.map(rowHtml).join('')
    : '<div class="empty"><div class="ei">✅</div><p>Nenhuma solicitação não concluída.</p></div>';
  if (cC) {
    cC.innerHTML = concl.length ? concl.map(rowHtml).join('')
      : '<div class="empty"><div class="ei">✅</div><p>Nenhuma solicitação concluída.</p></div>';
  }
}

// ══════════════════════════════════════════════════════════════════════
// CONCLUIR OS (planejada ou solicitação)
// ══════════════════════════════════════════════════════════════════════
let _cid=null, _ctp=null;

function abrirConcluir(id, tipo) {
  _cid=id; _ctp=tipo;
  const item = tipo==='plan'
    ? db.planejadas.find(x=>x.numero===id)
    : db.solicitacoes.find(x=>x.numero===id);
  if (!item) {
    showToast('Erro: item "'+id+'" não encontrado. Recarregue a página.','er',6000);
    return;
  }
  document.getElementById('mc-inf').innerHTML = `
    <div style="background:var(--surf2);border:1px solid var(--bord);border-radius:var(--rs);padding:12px">
      <div class="osdisp">${item.numero}</div>
      <div style="font-weight:600;margin:4px 0">${item.sala} · ${item.maq}</div>
      <div style="font-size:14px;color:var(--txt3)">${item.tipo} · ${item.prioridade||''}</div>
      ${item.desc?`<div style="font-size:14px;color:var(--txt2);margin-top:8px;padding-top:8px;border-top:1px solid var(--bord)">${item.desc}</div>`:''}
      ${item.fotoUrl?`<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--bord)">
        <div style="font-size:13px;font-weight:700;color:var(--txt3);font-variant:small-caps;margin-bottom:6px">📷 Foto da Solicitação</div>
         <a href="${item.fotoUrl}" target="_blank">
           <img src="${driveThumb(item.fotoUrl)}"px solid var(--bord);cursor:zoom-in" alt="Foto">
        </a>
      </div>`:''}
    </div>`;
  sv('mc-dt',today()); sv('mc-mn',CU?CU.nome:'');
  ['mc-in','mc-fm','mc-ds','mc-parada'].forEach(fid=>sv(fid,''));
  openM('m-con');
}

async function concluir() {
  try {
  const manut=v('mc-mn').trim(), data=v('mc-dt'), ini=v('mc-in'),
        fim=v('mc-fm'), desc=v('mc-ds').trim(), parada=parseInt(v('mc-parada'))||0;
  if (!manut||!desc){showToast('Preencha o manutentor e a descrição do serviço executado.','er');return;}
  const item = _ctp==='plan'
    ? db.planejadas.find(x=>x.numero===_cid)
    : db.solicitacoes.find(x=>x.numero===_cid);
  if (!item) { showToast('Item não encontrado. Recarregue a página e tente novamente.','er'); return; }
  const agora=new Date().toISOString();
  let durMin=0,paradaMin=parada;
    if(ini&&fim){const[h1,m1]=ini.split(':').map(Number),[h2,m2]=fim.split(':').map(Number);durMin=(h2*60+m2)-(h1*60+m1);if(durMin<0)durMin+=1440;durMin=Math.max(0,durMin);if(!paradaMin)paradaMin=durMin;}
  Object.assign(item,{status:'Concluída',concluidoEm:agora,manut,ini,fim,dtExec:data,desc2:desc,durMin});
  const numero=genOS();
  const os={id:crypto.randomUUID(),numero,sala:item.sala,maq:item.maq,tipo:item.tipo,prioridade:item.prioridade,
    manut,data:data||today(),ini,fim,durMin,paradaMin,prob:item.desc||'',acao:desc,
    fotoUrl:item.fotoUrl||'',criadoEm:agora,origem:_ctp,origemNum:item.numero};
  db.osC++;db.ordens.push(os);saveDB();closeM('m-con');
  logEdit('Concluiu', item.numero, item.sala + ' · ' + item.maq);
  if(_ctp==='plan')renderPlan();else renderSol();updStats();
  if(_ctp==='plan'){apiUpdate('planejadas',item.numero,'PL_Numero',{Status:'Concluída',Manutentor_Exec:manut,Data_Execucao:data,Hora_Inicio:ini,Hora_Fim:fim,Duracao_Min:durMin,Servico_Executado:desc,Concluido_Em:agora});}
  else{apiUpdate('solicitacoes',item.numero,'SOL_Numero',{Status:'Concluída',Manutentor_Exec:manut,Data_Execucao:data,Servico_Executado:desc,Concluido_Em:agora});}
  apiAppend('ordens',{OS_Numero:numero,Data:data||today(),Sala:item.sala,Maquina:item.maq,Tipo:item.tipo,
    Prioridade:item.prioridade,Manutentor:manut,Hora_Inicio:ini,Hora_Fim:fim,Duracao_Min:durMin,
    Tempo_Parada_Min:paradaMin,Problema:item.desc||'',Acao_Executada:desc,Origem:_ctp,
    OS_Origem_Ref:item.numero,Criado_Em:agora});
    if (document.getElementById('pg-dashboard').classList.contains('on')) renderDash();
    } catch(e) { showToast('Erro ao concluir: '+e.message,'er',8000); }
  }
