/* ══════════════════════════════════════════════════════════════════
   SIGMAN — PREVENTIVA (dinâmico por plano de máquina)
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */

// cache do plano carregado pra máquina atual: [{area, ordem, tarefa}, ...]
let PREV_PLANO_ATUAL = [];

function initPreventiva() {
  const sel = document.getElementById('prev-maq');
  if (!sel) return;
  sel.innerHTML = '<option value="">Selecione...</option>';
  [...db.maquinas].sort((a,b)=>a.nome.localeCompare(b.nome)).forEach(m=>{
    sel.innerHTML += `<option value="${m.sala}|${m.nome}|${m.tag}|${m.periodicidade||'Mensal'}|${m.id_plano||''}">${m.nome} (${m.sala})${m.tag?' – '+m.tag:''}</option>`;
  });
  // data/hora ficam em branco por padrão — não preenche mais com today()
  sv('prev-dt','');
  sv('prev-hi','');
  sv('prev-hf','');
  if (CU.tipo !== 'producao') sv('prev-mn', CU.nome);
  carregarTarefasPreventiva();
}

async function carregarTarefasPreventiva() {
  const maqVal = v('prev-maq').split('|');
  const per = maqVal[3] || v('prev-periodo') || 'Mensal';
  const idPlano = maqVal[4] || '';
  if (maqVal[3]) sv('prev-periodo', per);

  const body = document.getElementById('prev-body');

  if (!maqVal[1]) {
    body.innerHTML = '';
    PREV_PLANO_ATUAL = [];
    return;
  }

  if (!idPlano) {
    body.innerHTML = `<div class="card" style="padding:16px;text-align:center;color:var(--txt-muted,#999)">
      Máquina sem plano de manutenção cadastrado. Cadastre o <b>id_plano</b> dessa máquina na aba de máquinas
      e as tarefas correspondentes em <b>planos_preventiva</b>.
    </div>`;
    PREV_PLANO_ATUAL = [];
    return;
  }

  body.innerHTML = `<div class="card" style="padding:16px;text-align:center">Carregando plano...</div>`;

  let itens;
  try {
    itens = await apiGet('planos_preventiva', { id_plano: idPlano });
  } catch (e) {
    body.innerHTML = `<div class="card" style="padding:16px;color:#c0392b">Erro ao carregar plano: ${e.message||e}</div>`;
    PREV_PLANO_ATUAL = [];
    return;
  }

  if (!itens || !itens.length) {
    body.innerHTML = `<div class="card" style="padding:16px;text-align:center;color:var(--txt-muted,#999)">
      Plano <b>${idPlano}</b> não tem tarefas cadastradas em <b>planos_preventiva</b>.
    </div>`;
    PREV_PLANO_ATUAL = [];
    return;
  }

  // ordena por area (Mecânico antes de Elétrico) e depois por ordem
  const AREA_ORDEM = { 'Mecânico': 0, 'Elétrico': 1 };
  itens.sort((a,b) => (AREA_ORDEM[a.area]??9) - (AREA_ORDEM[b.area]??9) || (a.ordem-b.ordem));
  PREV_PLANO_ATUAL = itens;

  // agrupa por area mantendo só Mecânico / Elétrico
  const grupos = {};
  itens.forEach(it => {
    const area = it.area === 'Elétrico' ? 'Elétrico' : 'Mecânico';
    (grupos[area] = grupos[area] || []).push(it);
  });

  body.innerHTML = Object.entries(grupos).map(([grp, tarefas]) => `
    <div class="card" style="margin-bottom:10px">
      <div class="card-t">${grp}</div>
      ${tarefas.map((it, ti) => {
        const key = `${grp}-${ti}`;
        return `
        <div class="prev-row" data-key="${key}" style="display:grid;grid-template-columns:1fr auto 1.5fr;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--bord)">
          <div style="font-size:13px">${it.tarefa}</div>
          <div style="display:flex;gap:5px">
            <button class="iok" onclick="setPrevStatus('${key}','ok',this)">OK</button>
            <button class="inok" onclick="setPrevStatus('${key}','nok',this)">NOK</button>
            <button class="ina" onclick="setPrevStatus('${key}','na',this)">NA</button>
          </div>
          <div><input type="text" placeholder="Materiais / Observações" style="background:var(--inp);border:1px solid var(--bord);border-radius:4px;color:var(--txt);font-size:12px;padding:4px 8px;width:100%;outline:none" id="pvobs-${key}"></div>
          <input type="hidden" value="" id="pvst-${key}">
        </div>`;
      }).join('')}
    </div>`).join('');
}

function setPrevStatus(key, status, btn) {
  sv('pvst-'+key, status);
  const row = btn.closest('.prev-row');
  row.querySelectorAll('.iok,.inok,.ina').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function salvarPreventiva() {
  const maqVal = v('prev-maq').split('|');
  const data = v('prev-dt'), manut = v('prev-mn').trim(), per = v('prev-periodo');
  const horaIni = v('prev-hi'), horaFim = v('prev-hf');

  if (!maqVal[1] || !data || !manut) { showToast('Selecione máquina, data e manutentor.'); return; }
  if (!PREV_PLANO_ATUAL.length) { showToast('Plano de manutenção não carregado ou vazio.'); return; }

  const agora = new Date().toISOString();
  const grupos = {};
  PREV_PLANO_ATUAL.forEach(it => {
    const area = it.area === 'Elétrico' ? 'Elétrico' : 'Mecânico';
    (grupos[area] = grupos[area] || []).push(it);
  });

  let algumPreenchido = false;

  for (const [grp, tarefas] of Object.entries(grupos)) {
    for (let ti = 0; ti < tarefas.length; ti++) {
      const key = `${grp}-${ti}`;
      const st = v('pvst-'+key);
      if (!st) continue;
      algumPreenchido = true;
      await apiAppend('preventiva', {
        ID: agora + '-' + key, Data_Execucao: data, Maquina: maqVal[1], Tag: maqVal[2],
        Manutentor: manut, Periodicidade: per, Area: grp, Tarefa: tarefas[ti].tarefa,
        Status: st, Hora_Inicio: horaIni, Hora_Fim: horaFim,
        Materiais: v('pvobs-'+key), Observacoes: '', Criado_Em: agora
      });
    }
  }

  if (!algumPreenchido) { showToast('Marque OK/NOK/NA em pelo menos uma tarefa.'); return; }
  showToast('Preventiva salva no banco de dados!');
}

function imprimirPreventiva() {
  const maqVal = v('prev-maq').split('|');
  const data = v('prev-dt') || '___/___/____', manut = v('prev-mn') || '_______________', per = v('prev-periodo') || 'Mensal';
  const horaIni = v('prev-hi') || '___:___', horaFim = v('prev-hf') || '___:___';

  if (!PREV_PLANO_ATUAL.length) { showToast('Carregue um plano antes de imprimir.'); return; }

  const grupos = {};
  PREV_PLANO_ATUAL.forEach(it => {
    const area = it.area === 'Elétrico' ? 'Elétrico' : 'Mecânico';
    (grupos[area] = grupos[area] || []).push(it);
  });

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>ORDEM DE MANUTENÇÃO PREVENTIVA</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#000;padding:15mm}
h1{font-size:15px;text-align:center;color:#C41230;margin-bottom:4px}
h2{font-size:12px;margin:10px 0 4px;background:#f0f0f0;padding:4px 8px;border-left:3px solid #C41230}
.header{display:flex;justify-content:space-between;border-bottom:2px solid #C41230;padding-bottom:8px;margin-bottom:10px}
.info-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
.info-box{border:1px solid #ccc;border-radius:3px;padding:5px 8px}
.info-label{font-size:9px;color:#666;text-transform:uppercase}
.info-val{font-size:12px;font-weight:bold}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
th{background:#C41230;color:#fff;padding:5px 7px;text-align:left;font-size:10px}
td{padding:5px 7px;border:1px solid #ddd}
.cb{width:14px;height:14px;border:1px solid #999;border-radius:2px;display:inline-block}
.assinatura{border-top:1px solid #000;width:180px;margin-top:30px;padding-top:4px;font-size:9px}
@media print{body{padding:10mm}}
</style></head><body>
<div class="header">
  <div style="display:flex;align-items:center;gap:10px">
    <img src="https://muffatofoods.com.br/assets/images/foods_logo.png" style="height:44px;object-fit:contain" alt="Muffato">
    <div><b>MUFFATO FOODS</b><br>Gestão de Manutenção — PCM</div>
  </div>
  <div><h1>ORDEM DE MANUTENÇÃO PREVENTIVA</h1></div>
  <div style="text-align:right;font-size:10px">Doc: SIGMAN-PREV<br>Rev: 02</div>
</div>
<div class="info-grid">
  <div class="info-box"><div class="info-label">Máquina</div><div class="info-val">${maqVal[1]||'___'}</div></div>
  <div class="info-box"><div class="info-label">Tag</div><div class="info-val">${maqVal[2]||'___'}</div></div>
  <div class="info-box"><div class="info-label">Data</div><div class="info-val">${data==='___/___/____'?data:fd(data)}</div></div>
  <div class="info-box"><div class="info-label">Periodicidade</div><div class="info-val">${per}</div></div>
  <div class="info-box" style="grid-column:span 2"><div class="info-label">Manutentor</div><div class="info-val">${manut}</div></div>
  <div class="info-box"><div class="info-label">Hora Início</div><div class="info-val">${horaIni}</div></div>
  <div class="info-box"><div class="info-label">Hora Fim</div><div class="info-val">${horaFim}</div></div>
</div>
${Object.entries(grupos).map(([grp,tarefas])=>`
<h2>${grp}</h2>
<table>
<tr><th style="width:60%">Tarefa</th><th style="width:8%">OK</th><th style="width:8%">NOK</th><th style="width:8%">NA</th><th>Materiais / Observações</th></tr>
${tarefas.map(it=>`<tr>
  <td>${it.tarefa}</td>
  <td style="text-align:center"><span class="cb"></span></td>
  <td style="text-align:center"><span class="cb"></span></td>
  <td style="text-align:center"><span class="cb"></span></td>
  <td></td>
</tr>`).join('')}
</table>`).join('')}
<div style="display:flex;justify-content:space-between;margin-top:15px">
  <div><div class="assinatura">Assinatura do Manutentor</div></div>
  <div><div class="assinatura">Aprovação do Supervisor</div></div>
  <div><div class="assinatura">Revisão Próxima</div></div>
</div>
<script>window.print();<\/script></body></html>`);
  win.document.close();
}
