/* ══════════════════════════════════════════════════════════════════
   SIGMAN — VER DETALHE (modal)
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */
function verDet(id,tipo) {
  const item=tipo==='os'
    ?db.ordens.find(o=>o.numero===id)
    :db.planejadas.find(p=>p.numero===id);
  if(!item)return;
  document.getElementById('md-n').textContent=item.numero;
  document.getElementById('md-t').textContent=`${item.sala} · ${item.maq}`;
  let rows=`
    <div class="dr"><span class="dl">Sala</span><span class="dv">${item.sala}</span></div>
    <div class="dr"><span class="dl">Máquina</span><span class="dv">${item.maq}</span></div>
    <div class="dr"><span class="dl">Tipo</span><span class="dv">${tipoBadge(item.tipo)}</span></div>
    <div class="dr"><span class="dl">Prioridade</span><span class="dv">${prio(item.prioridade)}</span></div>`;
  const waEl=document.getElementById('md-wa'),waBtn=document.getElementById('md-wa-btn');
  if(tipo==='os'){
    rows+=`
      <div class="dr"><span class="dl">Manutentor</span><span class="dv">${item.manut}</span></div>
      <div class="dr"><span class="dl">Data</span><span class="dv">${fd(item.data)}</span></div>
      <div class="dr"><span class="dl">Horário</span><span class="dv">${item.ini||'—'} – ${item.fim||'—'}${item.durMin?' ('+item.durMin+'min)':''}</span></div>
      ${item.paradaMin?`<div class="dr"><span class="dl">Tempo de Parada</span><span class="dv">${item.paradaMin}min</span></div>`:''}
      <div class="dr"><span class="dl">Problema</span><span class="dv">${item.prob||'—'}</span></div>
      <div class="dr"><span class="dl">Ação Executada</span><span class="dv">${item.acao||'—'}</span></div>
      ${item.acaoPrev?`<div class="dr"><span class="dl">Ação Preventiva</span><span class="dv">${item.acaoPrev}</span></div>`:''}
      ${item.fotoUrl?`<div class="dr" style="flex-direction:column;gap:8px"><span class="dl">📷 Foto</span><span class="dv"><div class="foto-wrap"><img src="${driveThumb(item.fotoUrl)}" style="max-width:100%;max-height:220px;border-radius:var(--rs);object-fit:contain;border:1px solid var(--bord);cursor:zoom-in" alt="Foto OS" onclick="abrirFotoImprimir('${item.fotoUrl}')"><button class="foto-print-btn" title="Imprimir / Salvar como PDF" onclick="abrirFotoImprimir('${item.fotoUrl}')">🖨️</button></div></span></div>`:''} ${item.origem!=='direta'?`<div class="dr"><span class="dl">OS Origem</span><span class="dv" style="color:var(--red)">${item.origemNum}</span></div>`:''}`;
    const wa=`*${item.numero} — Ordem de Serviço*\n\n*Sala:* ${item.sala}\n*Máquina:* ${item.maq}\n*Problema:* ${item.prob||'—'}\n*Ação:* ${item.tipo}\n*Prioridade:* ${item.prioridade}\n*Tempo:* ${item.ini||'?'} - ${item.fim||'?'} (${item.durMin||'?'}min)\n*Parada:* ${item.paradaMin||'?'}min\n\n${item.acao||''}\n\n_Manutentor: ${item.manut}_`;
    waEl.textContent=wa;waEl.style.display='block';waBtn.style.display='inline-block';
  } else {
    rows+=`
      <div class="dr"><span class="dl">Prazo</span><span class="dv">${fd(item.prazo)}</span></div>
      <div class="dr"><span class="dl">Status</span><span class="dv">${stBadge(item.status)}</span></div>
      <div class="dr"><span class="dl">Serviço Planejado</span><span class="dv">${item.desc||'—'}</span></div>
      ${item.manut?`<div class="dr"><span class="dl">Manutentor</span><span class="dv">${item.manut}</span></div>`:''}
      ${item.desc2?`<div class="dr"><span class="dl">Serviço Executado</span><span class="dv">${item.desc2}</span></div>`:''}`;
    waEl.style.display='none';waBtn.style.display='none';
  }
  document.getElementById('md-b').innerHTML=rows;
  _curDet={item,tipo};
  document.getElementById('md-print-btn').style.display='inline-block';
  // Mostrar botão GERAR RCA apenas se precisaRAC()
  const racBtn = document.getElementById('md-rac-btn');
  if (tipo === 'os' && precisaRAC(item)) {
    racBtn.style.display = 'inline-block';
  } else {
    racBtn.style.display = 'none';
  }
  openM('m-det');
}

function copyWA(){navigator.clipboard.writeText(document.getElementById('md-wa').textContent||'').then(()=>showToast('Copiado!'));}

function imprimirDetOS() {
  if (!_curDet) return;
  const {item, tipo} = _curDet;
  const titulo = tipo==='os' ? 'ORDEM DE SERVIÇO EXECUTADA' : 'ORDEM DE SERVIÇO PLANEJADA';
  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>${titulo}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:13px;color:#000;padding:15mm}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #C41230;padding-bottom:8px;margin-bottom:12px}
.header-left{display:flex;align-items:center;gap:12px}
.header-left img{height:48px;object-fit:contain}
h1{font-size:17px;color:#C41230;margin-bottom:2px}
.info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.info-box{border:1px solid #ccc;border-radius:3px;padding:6px 10px}
.info-label{font-size:10px;color:#666;text-transform:uppercase}
.info-val{font-size:14px;font-weight:bold}
.section{margin-bottom:10px}
.section-title{font-size:13px;font-weight:bold;background:#f0f0f0;padding:5px 8px;border-left:3px solid #C41230;margin-bottom:6px}
.section-content{border:1px solid #ddd;border-radius:3px;padding:8px 10px;font-size:14px;min-height:40px;line-height:1.6}
.assinatura{border-top:1px solid #000;width:200px;margin-top:40px;padding-top:4px;font-size:10px}
@media print{body{padding:10mm}}
</style></head><body>
<div class="header">
  <div class="header-left">
    <img src="https://muffatofoods.com.br/assets/images/foods_logo.png" alt="Muffato Foods">
    <div><div style="font-weight:bold;font-size:15px">MUFFATO FOODS</div><div style="font-size:11px;color:#666">Gestão de Manutenção — SIGMAN</div></div>
  </div>
  <div style="text-align:center"><h1>${titulo}</h1><div style="font-size:13px;font-weight:bold;color:#C41230">${item.numero}</div></div>
  <div style="text-align:right;font-size:10px;color:#666">Doc: SIGMAN<br>Rev: 01</div>
</div>
<div class="info-grid">
  <div class="info-box"><div class="info-label">Sala / Local</div><div class="info-val">${item.sala}</div></div>
  <div class="info-box"><div class="info-label">Máquina / Ativo</div><div class="info-val">${item.maq}</div></div>
  <div class="info-box"><div class="info-label">Tipo</div><div class="info-val">${item.tipo}</div></div>
  <div class="info-box"><div class="info-label">Prioridade</div><div class="info-val">${item.prioridade||'—'}</div></div>
  ${tipo==='os'?`
  <div class="info-box"><div class="info-label">Manutentor</div><div class="info-val">${item.manut||'—'}</div></div>
  <div class="info-box"><div class="info-label">Data</div><div class="info-val">${fd(item.data)}</div></div>
  <div class="info-box"><div class="info-label">Hora Início</div><div class="info-val">${item.ini||'—'}</div></div>
  <div class="info-box"><div class="info-label">Hora Fim</div><div class="info-val">${item.fim||'—'}</div></div>
  <div class="info-box"><div class="info-label">Duração (min)</div><div class="info-val">${item.durMin||'—'}</div></div>
  <div class="info-box"><div class="info-label">Parada (min)</div><div class="info-val">${item.paradaMin||'—'}</div></div>
  `:`
  <div class="info-box"><div class="info-label">Prazo Limite</div><div class="info-val">${fd(item.prazo)}</div></div>
  <div class="info-box"><div class="info-label">Status</div><div class="info-val">${item.status||'—'}</div></div>
  `}
</div>
${tipo==='os'?`
<div class="section"><div class="section-title">Problema / Ocorrência</div><div class="section-content">${item.prob||'—'}</div></div>
<div class="section"><div class="section-title">Ação / Serviço Executado</div><div class="section-content">${item.acao||'—'}</div></div>
${item.acaoPrev?`<div class="section"><div class="section-title">Ação Preventiva Identificada</div><div class="section-content">${item.acaoPrev}</div></div>`:''}
`:`
<div class="section"><div class="section-title">Serviço Planejado</div><div class="section-content">${item.desc||'—'}</div></div>
${item.desc2?`<div class="section"><div class="section-title">Serviço Executado</div><div class="section-content">${item.desc2}</div></div>`:''}
`}
<div style="display:flex;justify-content:space-between;margin-top:20px">
  <div><div class="assinatura">Assinatura do Manutentor</div></div>
  <div><div class="assinatura">Visto do Supervisor</div></div>
</div>
<script>window.print();<\/script></body></html>`);
  win.document.close();
}

// ══════════════════════════════════════════════════════════════════════
// MODAIS
// ══════════════════════════════════════════════════════════════════════
function openM(id){document.getElementById(id).classList.add('on');}
function closeM(id){document.getElementById(id).classList.remove('on');}
document.addEventListener('click', e => {
  if (e.target.classList && e.target.classList.contains('mb')) e.target.classList.remove('on');
});
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&document.getElementById('login-screen').style.display!=='none'){
    if(document.getElementById('lf-login').style.display!=='none')doLogin();
  }
});

// ══════════════════════════════════════════════════════════════════════
// EXPORTAR DADOS DO HTML PARA O SHEETS (migração inicial)
// ══════════════════════════════════════════════════════════════════════
window.exportarParaSheets = async function() {
  console.log('📤 Exportando dados do HTML para o Google Sheets...');
  const r = await apiPost({
    action: 'importarTodos',
    payload: {
      salas: db.salas,
      maquinas: db.maquinas,
      usuarios: db.usuarios
    }
  });
  if (r && r.ok) {
    console.log('✅ Exportação concluída:', r.log.join(', '));
    alert('✅ Dados exportados!\n' + r.log.join('\n'));
  } else {
    console.error('❌ Erro na exportação:', r);
  }
};
