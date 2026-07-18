/* ══════════════════════════════════════════════════════════════════
   SIGMAN — INSPEÇÃO DIÁRIA
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */

function buildInsp() {
  const c = document.getElementById('insp-secs');
  // Sempre reconstrói para resetar estado
  c.dataset.built = '1';
  c.innerHTML = INSP_TMPL.map(sec => `
    <div class="insp-sec open">
      <div class="insp-hd" onclick="this.parentElement.classList.toggle('open')">
        <div class="insp-ht">${sec.sala}</div>
        <span class="insp-chev">▶</span>
      </div>
      <div class="insp-bd">
        ${sec.equips.map(eq => renderEquip(eq)).join('')}
      </div>
    </div>`).join('');
}

function renderEquip(eq) {
  let html = `
    <div class="insp-row" id="row-${eq.id}">
      <div class="insp-eq">${eq.nome}</div>
      <div class="insp-btns">
        <button class="iok"  onclick="setStatus('${eq.id}','ok',this)">OK</button>
        <button class="inok" onclick="setStatus('${eq.id}','nok',this)">NÃO OK</button>
      </div>
      <div class="itime"><input type="time" id="t-${eq.id}"></div>
      <div class="iobs"><input type="text" id="o-${eq.id}" placeholder="Observações..."></div>
    </div>`;
  if (eq.subs && eq.subs.length) {
    html += `<div class="insp-sub-lbl">${eq.nome} — Sub-itens</div><div class="insp-sub">`;
    html += eq.subs.map(s => `
      <div class="insp-row" id="row-${s.id}">
        <div class="insp-eq">${s.nome}</div>
        <div class="insp-btns">
          <button class="iok"  onclick="setStatus('${s.id}','ok',this)">OK</button>
          <button class="inok" onclick="setStatus('${s.id}','nok',this)">NÃO OK</button>
        </div>
        <div class="itime"><input type="time" id="t-${s.id}"></div>
        <div class="iobs"><input type="text" id="o-${s.id}" placeholder="Observações..."></div>
      </div>`).join('');
    html += '</div>';
  }
  return html;
}

function setStatus(id,st,btn) {
  const row = document.getElementById('row-'+id);
  row.querySelectorAll('.iok,.inok').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on'); row.dataset.status = st;
  if (st==='ok') {
    const ti = document.getElementById('t-'+id);
    if (ti&&!ti.value){const now=new Date();ti.value=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');}
  }
}

function setPrevStatus(key, st, btn) {
  const row = btn.closest('.prev-row');
  row.querySelectorAll('.iok,.inok').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  const hid = document.getElementById('pvst-' + key);
  if (hid) hid.value = st;
}
  
function collectInsp() {
  const data=[];
  INSP_TMPL.forEach(sec=>{
    const equips=[];
    sec.equips.forEach(eq=>{
      const row=document.getElementById('row-'+eq.id);if(!row)return;
      const subs=(eq.subs||[]).map(s=>{const sr=document.getElementById('row-'+s.id);if(!sr)return null;return{id:s.id,nome:s.nome,status:sr.dataset.status||'',hora:v('t-'+s.id),obs:v('o-'+s.id)};}).filter(Boolean);
      equips.push({id:eq.id,nome:eq.nome,status:row.dataset.status||'',hora:v('t-'+eq.id),obs:v('o-'+eq.id),subs});
    });
    data.push({sala:sec.sala,equips});
  });
  return data;
}

async function salvarInsp() {
  const data=v('insp-dt'),turno=v('insp-tn'),manut=v('insp-mn').trim(),
        horas=parseInt(v('insp-horas'))||8;
  if(!data||!manut){showAlert('al-insp','Informe data e manutentor.','er');return;}
  const itens=collectInsp();
  const id=crypto.randomUUID(), agora=new Date().toISOString();
  db.inspecoes.push({id,data,turno,horasTurno:horas,manut,itens,criadoEm:agora});
  db.inspC++; saveDB();
  // Monta TODAS as linhas em memória e envia em UMA única chamada POST
  const rows = [];
  itens.forEach(sec => {
    sec.equips.forEach(eq => {
      if (!eq.status) return; // item não avaliado: não grava
      rows.push({
        ID_Inspecao:id, Data:data, Turno:turno, Horas_Turno:horas,
        Manutentor:manut, Sala:sec.sala, Equipamento:eq.nome,
        Sub_Item:'', Status:eq.status, Hora:eq.hora||'',
        Observacoes:eq.obs||'', Criado_Em:agora
      });
      (eq.subs||[]).forEach(s => {
        if (!s.status) return;
        rows.push({
          ID_Inspecao:id, Data:data, Turno:turno, Horas_Turno:horas,
          Manutentor:manut, Sala:sec.sala, Equipamento:eq.nome,
          Sub_Item:s.nome, Status:s.status, Hora:s.hora||'',
          Observacoes:s.obs||'', Criado_Em:agora
        });
      });
    });
  });
  if (rows.length > 0) {
    showAlert('al-insp', `Salvando ${rows.length} itens...`, 'ok');
    const r = await apiPost({ action:'appendBatch', sheet:'inspecoes', rows });
    if (!r || !r.ok) {
      showAlert('al-insp', 'Erro ao salvar no Sheets. Dados gravados localmente.', 'er');
      return;
    }
  }
  showAlert('al-insp', `Inspeção salva! ${rows.length} itens gravados.`, 'ok');
  setTimeout(()=>showPage('dashboard'), 900);
}

function gerarTextoRel(insp) {
  if (!insp) return '';
  let txt = `*INSPEÇÃO DIÁRIA — ${insp.data} — ${insp.turno}*\n*Manutentor: ${insp.manut}*\n\n`;
  if (!insp.itens || !insp.itens.length) return txt + '(sem itens registrados)';

  // Detecta formato: hierárquico (salvo localmente) ou plano (vindo do Sheets)
  const isHierarquico = insp.itens[0] && 'equips' in insp.itens[0];

  if (isHierarquico) {
    // formato local: itens[] → { sala, equips:[{nome, status, hora, obs, subs:[...]}] }
    insp.itens.forEach(sec => {
      txt += `● Sala: ${sec.sala}\n`;
      (sec.equips || []).forEach(eq => {
        if (!eq.status) return;
        txt += `${eq.nome} / ${eq.status === 'ok' ? 'ok' : 'Não vai rodar'}`;
        txt += `${eq.hora ? ' ' + eq.hora + 'h' : ''}${eq.obs ? ' – ' + eq.obs : ''}\n`;
        (eq.subs || []).forEach(s => {
          if (!s.status) return;
          txt += `  ${s.nome} / ${s.status === 'ok' ? 'ok' : 'Não vai rodar'}`;
          txt += `${s.hora ? ' ' + s.hora + 'h' : ''}${s.obs ? ' – ' + s.obs : ''}\n`;
        });
      });
      txt += '\n';
    });
  } else {
    // formato Sheets: itens[] → { sala, equip, sub, status, hora, obs }
    const bySala = {};
    insp.itens.forEach(item => {
      if (!bySala[item.sala]) bySala[item.sala] = [];
      bySala[item.sala].push(item);
    });
    Object.entries(bySala).forEach(([sala, items]) => {
      txt += `● Sala: ${sala}\n`;
      items.forEach(item => {
        if (!item.status) return;
        const nome = item.sub ? `${item.equip} / ${item.sub}` : item.equip;
        txt += `${nome} / ${item.status === 'ok' ? 'ok' : 'Não vai rodar'}`;
        txt += `${item.hora ? ' ' + item.hora + 'h' : ''}${item.obs ? ' – ' + item.obs : ''}\n`;
      });
      txt += '\n';
    });
  }
  return txt;
}

function gerarRel() {
  const pgAtiva=document.getElementById('pg-inspecao').classList.contains('on');
  let txt='';
  if(pgAtiva){const itens=collectInsp();txt=gerarTextoRel({data:v('insp-dt'),turno:v('insp-tn'),manut:v('insp-mn'),itens});}
  else{const last=[...db.inspecoes].sort((a,b)=>(b.data||'').localeCompare(a.data||''))[0];if(last)txt=gerarTextoRel(last);}
  if(!txt){showToast('Nenhuma inspeção.');return;}
  document.getElementById('m-rel-b').textContent=txt;openM('m-rel');
}

// Histórico de inspeções (lista para navegar 1 a 1)
let _inspIdx = 0;
function verRelatorio() {
  const sorted=[...db.inspecoes].sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  if(!sorted.length){showToast('Nenhuma inspeção registrada.');return;}
  _inspIdx=0;
  mostrarInspRel(sorted,_inspIdx);
}
function mostrarInspRel(sorted,idx) {
  const insp=sorted[idx];
  const nav=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <button class="btn btn-sm btn-gh" onclick="navInspRel(${idx-1})" ${idx===0?'disabled':''}>◀ Anterior</button>
    <span style="font-size:14px;color:var(--txt3)">${idx+1} de ${sorted.length}</span>
    <button class="btn btn-sm btn-gh" onclick="navInspRel(${idx+1})" ${idx===sorted.length-1?'disabled':''}>Próxima ▶</button>
  </div>`;
  document.getElementById('m-rel-b').innerHTML='';
  const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;font-family:var(--fm);font-size:13px;color:var(--txt2);line-height:1.9';
  pre.textContent=gerarTextoRel(insp);
  document.getElementById('m-rel-b').innerHTML=nav;
  document.getElementById('m-rel-b').appendChild(pre);
  openM('m-rel');
}
function navInspRel(idx){
  const sorted=[...db.inspecoes].sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  if(idx<0||idx>=sorted.length)return;
  _inspIdx=idx;mostrarInspRel(sorted,idx);
}
  
function copyRel(){
  const pre = document.querySelector('#m-rel-b pre');
  const txt = pre ? pre.textContent : (document.getElementById('m-rel-b').textContent || '');
  navigator.clipboard.writeText(txt).then(()=>showToast('Copiado!'));
}
  
function imprimirInspDiaria() {
  // Detecta qual inspeção está sendo exibida no modal
  const pgAtiva = document.getElementById('pg-inspecao').classList.contains('on');
  let insp;
  if (pgAtiva) {
    insp = {
      data:       v('insp-dt'),
      turno:      v('insp-tn'),
      horasTurno: parseInt(v('insp-horas')) || 10,
      manut:      v('insp-mn'),
      itens:      collectInsp()
    };
  } else {
    const sorted = [...db.inspecoes].sort((a,b) => (b.data||'').localeCompare(a.data||''));
    insp = sorted[_inspIdx] || sorted[0];
  }
  if (!insp) { showToast('Nenhuma inspeção para imprimir.'); return; }

  const isHierarquico = insp.itens && insp.itens[0] && 'equips' in insp.itens[0];

  // Monta linhas da tabela
  let linhas = '';
  if (isHierarquico) {
    insp.itens.forEach(sec => {
      linhas += `<tr><td colspan="4" style="background:#f0f0f0;font-weight:700;font-size:13px;padding:5px 8px;border-left:3px solid #C41230">● ${sec.sala}</td></tr>`;
      (sec.equips || []).forEach(eq => {
        if (!eq.status) return;
        const stOk  = eq.status === 'ok';
        linhas += `<tr>
          <td style="padding-left:14px">${eq.nome}</td>
          <td style="text-align:center">${stOk ? '✔' : ''}</td>
          <td style="text-align:center">${!stOk ? '✘' : ''}</td>
          <td>${eq.hora||''}${eq.obs?' — '+eq.obs:''}</td>
        </tr>`;
        (eq.subs || []).forEach(s => {
          if (!s.status) return;
          const sOk = s.status === 'ok';
          linhas += `<tr style="background:#fafafa">
            <td style="padding-left:28px;font-size:11px;color:#444">↳ ${s.nome}</td>
            <td style="text-align:center">${sOk ? '✔' : ''}</td>
            <td style="text-align:center">${!sOk ? '✘' : ''}</td>
            <td style="font-size:11px">${s.hora||''}${s.obs?' — '+s.obs:''}</td>
          </tr>`;
        });
      });
    });
  } else {
    const bySala = {};
    (insp.itens || []).forEach(item => {
      if (!bySala[item.sala]) bySala[item.sala] = [];
      bySala[item.sala].push(item);
    });
    Object.entries(bySala).forEach(([sala, items]) => {
      linhas += `<tr><td colspan="4" style="background:#f0f0f0;font-weight:700;font-size:13px;padding:5px 8px;border-left:3px solid #C41230">● ${sala}</td></tr>`;
      items.forEach(item => {
        if (!item.status) return;
        const stOk = item.status === 'ok';
        const nome = item.sub ? `${item.equip} / ${item.sub}` : item.equip;
        linhas += `<tr>
          <td style="padding-left:14px">${nome}</td>
          <td style="text-align:center">${stOk ? '✔' : ''}</td>
          <td style="text-align:center">${!stOk ? '✘' : ''}</td>
          <td>${item.hora||''}${item.obs?' — '+item.obs:''}</td>
        </tr>`;
      });
    });
  }

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>INSPEÇÃO DIÁRIA</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:13px;color:#000;padding:15mm}
    .header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #C41230;padding-bottom:8px;margin-bottom:12px}
    .header-left{display:flex;align-items:center;gap:12px}
    .header-left img{height:44px;object-fit:contain}
    h1{font-size:17px;color:#C41230;margin-bottom:2px}
    .info-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
    .info-box{border:1px solid #ccc;border-radius:3px;padding:5px 8px}
    .info-label{font-size:10px;color:#666;text-transform:uppercase}
    .info-val{font-size:14px;font-weight:bold}
    table{width:100%;border-collapse:collapse;margin-bottom:12px}
    th{background:#C41230;color:#fff;padding:6px 8px;text-align:left;font-size:11px}
    td{padding:5px 8px;border:1px solid #ddd;vertical-align:middle}
    tr:nth-child(even) td{background:#fafafa}
    .assinatura{border-top:1px solid #000;width:200px;margin-top:40px;padding-top:4px;font-size:10px}
    @media print{body{padding:10mm}}
  </style></head><body>
  <div class="header">
    <div class="header-left">
      <img src="https://muffatofoods.com.br/assets/images/foods_logo.png" alt="Muffato Foods">
      <div><div style="font-weight:bold;font-size:15px">MUFFATO FOODS</div><div style="font-size:11px;color:#666">Gestão de Manutenção — SIGMAN</div></div>
    </div>
    <div style="text-align:center"><h1>INSPEÇÃO DIÁRIA</h1></div>
    <div style="text-align:right;font-size:10px;color:#666">Doc: SIGMAN-INSP<br>Rev: 01</div>
  </div>
  <div class="info-grid">
    <div class="info-box"><div class="info-label">Data</div><div class="info-val">${fd(insp.data)}</div></div>
    <div class="info-box"><div class="info-label">Turno</div><div class="info-val">${insp.turno||'—'}</div></div>
    <div class="info-box"><div class="info-label">Horas do Turno</div><div class="info-val">${insp.horasTurno||8}h</div></div>
    <div class="info-box"><div class="info-label">Manutentor</div><div class="info-val">${insp.manut||'—'}</div></div>
  </div>
  <table>
    <tr>
      <th style="width:40%">Equipamento / Sub-item</th>
      <th style="width:8%;text-align:center">OK</th>
      <th style="width:8%;text-align:center">NOK</th>
      <th>Hora / Observações</th>
    </tr>
    ${linhas || '<tr><td colspan="4" style="text-align:center;color:#999;padding:20px">Nenhum item registrado</td></tr>'}
  </table>
  <div style="display:flex;justify-content:space-between;margin-top:20px">
    <div><div class="assinatura">Assinatura do Manutentor</div></div>
    <div><div class="assinatura">Visto do Supervisor</div></div>
  </div>
  <script>window.print();<\/script></body></html>`);
  win.document.close();
}
   