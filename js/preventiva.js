/* ══════════════════════════════════════════════════════════════════
   SIGMAN — PREVENTIVA (dinâmico por plano de máquina)
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */

// plano carregado do modelo escolhido: { mecanico: [texto,...], eletrico: [texto,...] }
let PREV_PLANO_ATUAL = { mecanico: [], eletrico: [] };

let PREV_MODELOS_CACHE = null; // lista de nomes de modelos, carregada 1x por sessão
let PREV_MODELO_ATUAL = '';

async function initPreventiva() {
  const selSala = document.getElementById('prev-sala');
  if (!selSala) return;
  selSala.innerHTML = '<option value="">Todas as Salas</option>' +
    [...db.salas].sort().map(s=>`<option value="${s}">${s}</option>`).join('');
  filtrarPrevMaq();

  const selModelo = document.getElementById('prev-modelo');
  if (selModelo) {
    selModelo.innerHTML = '<option value="">Carregando modelos...</option>';
    try {
      if (!PREV_MODELOS_CACHE) PREV_MODELOS_CACHE = await apiGet({ action: 'planos_list' });
      selModelo.innerHTML = '<option value="">Selecione o modelo...</option>' +
        PREV_MODELOS_CACHE.map(nome => `<option value="${nome}">${nome}</option>`).join('');
    } catch (e) {
      selModelo.innerHTML = '<option value="">Erro ao carregar modelos</option>';
    }
  }

  // data/hora ficam em branco por padrão — não preenche mais com today()
  sv('prev-dt','');
  sv('prev-hi','');
  sv('prev-hf','');
  if (CU.tipo !== 'producao') sv('prev-mn', CU.nome);
  document.getElementById('prev-body').innerHTML = '';
  PREV_PLANO_ATUAL = { mecanico: [], eletrico: [] };
  PREV_MODELO_ATUAL = '';
}

function filtrarPrevMaq() {
  const salaFiltro = v('prev-sala');
  const sel = document.getElementById('prev-maq');
  sel.innerHTML = '<option value="">Selecione...</option>';
  [...db.maquinas]
    .filter(m => !salaFiltro || m.sala === salaFiltro)
    .sort((a,b)=>a.nome.localeCompare(b.nome))
    .forEach(m=>{
      sel.innerHTML += `<option value="${m.sala}|${m.nome}|${m.tag}|${m.periodicidade||'Mensal'}|${m.modeloPadrao||''}">${m.nome} (${m.sala})${m.tag?' – '+m.tag:''}</option>`;
    });
  document.getElementById('prev-body').innerHTML = '';
  sv('prev-modelo','');
  PREV_PLANO_ATUAL = { mecanico: [], eletrico: [] };
  PREV_MODELO_ATUAL = '';
}

function selecionarPrevMaquina() {
  const maqVal = v('prev-maq').split('|');
  const modeloPadrao = maqVal[4] || '';
  const selModelo = document.getElementById('prev-modelo');
  if (modeloPadrao && selModelo && [...selModelo.options].some(o=>o.value===modeloPadrao)) {
    selModelo.value = modeloPadrao;
  } else {
    sv('prev-modelo','');
  }
  carregarTarefasPreventiva();
}

async function carregarTarefasPreventiva() {
  const nomeModelo = v('prev-modelo');
  const body = document.getElementById('prev-body');

  if (!nomeModelo) {
    body.innerHTML = '';
    PREV_PLANO_ATUAL = { mecanico: [], eletrico: [] };
    PREV_MODELO_ATUAL = '';
    return;
  }

  body.innerHTML = `<div class="card" style="padding:16px;text-align:center">Carregando modelo...</div>`;

  let plano;
  try {
    plano = await apiGet({ action: 'planos_get', modelo: nomeModelo });
  } catch (e) {
    body.innerHTML = `<div class="card" style="padding:16px;color:#c0392b">Erro ao carregar modelo: ${e.message||e}</div>`;
    PREV_PLANO_ATUAL = { mecanico: [], eletrico: [] };
    return;
  }

  if (!plano || (!plano.mecanico?.length && !plano.eletrico?.length)) {
    body.innerHTML = `<div class="card" style="padding:16px;text-align:center;color:var(--txt-muted,#999)">
      Modelo <b>${nomeModelo}</b> não tem tarefas cadastradas.
    </div>`;
    PREV_PLANO_ATUAL = { mecanico: [], eletrico: [] };
    return;
  }

  PREV_PLANO_ATUAL = plano;
  PREV_MODELO_ATUAL = nomeModelo;

  const grupos = { 'Mecânico': plano.mecanico || [], 'Elétrico': plano.eletrico || [] };

  body.innerHTML = Object.entries(grupos).filter(([,t])=>t.length).map(([grp, tarefas]) => `
    <div class="card" style="margin-bottom:10px">
      <div class="card-t">${grp}</div>
      ${tarefas.map((tarefaTexto, ti) => {
        const key = `${grp}-${ti}`;
        return `
        <div class="prev-row" data-key="${key}" style="display:grid;grid-template-columns:1fr auto 1.5fr;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--bord)">
          <div style="font-size:15px">${tarefaTexto}</div>
          <div style="display:flex;gap:5px">
            <button class="iok" onclick="setPrevStatus('${key}','ok',this)">OK</button>
            <button class="inok" onclick="setPrevStatus('${key}','nok',this)">NOK</button>
            <button class="ina" onclick="setPrevStatus('${key}','na',this)">NA</button>
          </div>
          <div><input type="text" placeholder="Materiais / Observações" style="background:var(--inp);border:1px solid var(--bord);border-radius:4px;color:var(--txt);font-size:14px;padding:4px 8px;width:100%;outline:none" id="pvobs-${key}"></div>
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
  if (!PREV_MODELO_ATUAL) { showToast('Selecione um modelo de manutenção.'); return; }
  if (!PREV_PLANO_ATUAL.mecanico?.length && !PREV_PLANO_ATUAL.eletrico?.length) {
    showToast('Modelo carregado está vazio.'); return;
  }

  const agora = new Date().toISOString();
  const grupos = { 'Mecânico': PREV_PLANO_ATUAL.mecanico || [], 'Elétrico': PREV_PLANO_ATUAL.eletrico || [] };

  let algumPreenchido = false;

  for (const [grp, tarefas] of Object.entries(grupos)) {
    for (let ti = 0; ti < tarefas.length; ti++) {
      const key = `${grp}-${ti}`;
      const st = v('pvst-'+key);
      if (!st) continue;
      algumPreenchido = true;
      await apiAppend('preventiva', {
        ID: agora + '-' + key, Modelo: PREV_MODELO_ATUAL, Data_Execucao: data,
        Maquina: maqVal[1], Tag: maqVal[2], Manutentor: manut, Periodicidade: per,
        Area: grp, Tarefa: tarefas[ti], Status: st, Hora_Inicio: horaIni, Hora_Fim: horaFim,
        Materiais: v('pvobs-'+key), Observacoes: '', Criado_Em: agora
      });
    }
  }

  if (!algumPreenchido) { showToast('Marque OK/NOK/NA em pelo menos uma tarefa.'); return; }
  showToast('Preventiva salva no banco de dados!');
}

function imprimirPreventiva() {
  _imprimirPreventivaBase({
    titulo: 'ORDEM DE MANUTENÇÃO PREVENTIVA',
    doc: 'SIGMAN-PREV',
    colunas: ['OK','NOK','NA'],
    colMateriais: true
  });
}

function imprimirInspecaoEquipamento() {
  _imprimirPreventivaBase({
    titulo: 'ORDEM DE INSPEÇÃO DE EQUIPAMENTO',
    doc: 'SIGMAN-INSP-EQ',
    colunas: ['OK','NOK','NA'],
    colMateriais: true
  });
}

function _imprimirPreventivaBase({ titulo, doc, colunas, colMateriais }) {
  const maqVal = v('prev-maq').split('|');
  const data = v('prev-dt') || '___/___/____', manut = v('prev-mn') || '_______________', per = v('prev-periodo') || 'Mensal';
  const horaIni = v('prev-hi') || '___:___', horaFim = v('prev-hf') || '___:___';

  if (!PREV_PLANO_ATUAL.mecanico?.length && !PREV_PLANO_ATUAL.eletrico?.length) {
    showToast('Carregue um modelo antes de imprimir.'); return;
  }

  const grupos = { 'Mecânico': PREV_PLANO_ATUAL.mecanico || [], 'Elétrico': PREV_PLANO_ATUAL.eletrico || [] };
  const [c1,c2,c3] = colunas;

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>${titulo}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:13px;color:#000;padding:15mm}
h1{font-size:17px;text-align:center;color:#C41230;margin-bottom:4px}
h2{font-size:14px;margin:10px 0 4px;background:#f0f0f0;padding:4px 8px;border-left:3px solid #C41230}
.header{display:flex;justify-content:space-between;border-bottom:2px solid #C41230;padding-bottom:8px;margin-bottom:10px}
.info-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
.info-box{border:1px solid #ccc;border-radius:3px;padding:5px 8px}
.info-label{font-size:10px;color:#666;text-transform:uppercase}
.info-val{font-size:14px;font-weight:bold}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
th{background:#C41230;color:#fff;padding:5px 7px;text-align:left;font-size:11px}
td{padding:5px 7px;border:1px solid #ddd}
.cb{width:14px;height:14px;border:1px solid #999;border-radius:2px;display:inline-block}
.assinatura{border-top:1px solid #000;width:180px;margin-top:30px;padding-top:4px;font-size:10px}
.obs-box{margin-top:14px}
.obs-box .obs-title{font-size:12px;font-weight:bold;background:#f0f0f0;padding:4px 8px;border-left:3px solid #C41230;margin-bottom:0}
.obs-box .obs-linhas{border:1px solid #ccc;border-top:none}
.obs-box .obs-linha{height:22px;border-bottom:1px dotted #999}
.obs-box .obs-linha:last-child{border-bottom:none}
@media print{body{padding:10mm}}
</style></head><body>
<div class="header">
  <div style="display:flex;align-items:center;gap:10px">
    <img src="https://muffatofoods.com.br/assets/images/foods_logo.png" style="height:44px;object-fit:contain" alt="Muffato">
    <div><b>MUFFATO FOODS</b><br>Gestão de Manutenção — PCM</div>
  </div>
  <div><h1>${titulo}</h1></div>
  <div style="text-align:right;font-size:11px">Doc: ${doc}<br>Rev: 02</div>
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
<tr><th style="width:${colMateriais?60:76}%">Tarefa</th><th style="width:8%">${c1}</th><th style="width:8%">${c2}</th><th style="width:8%">${c3}</th>${colMateriais?'<th>Materiais / Observações</th>':''}</tr>
${tarefas.map(tarefaTexto=>`<tr>
  <td>${tarefaTexto}</td>
  <td style="text-align:center"><span class="cb"></span></td>
  <td style="text-align:center"><span class="cb"></span></td>
  <td style="text-align:center"><span class="cb"></span></td>
  ${colMateriais?'<td></td>':''}
</tr>`).join('')}
</table>`).join('')}
<div class="obs-box">
  <div class="obs-title">Observações</div>
  <div class="obs-linhas">${Array(5).fill('<div class="obs-linha"></div>').join('')}</div>
</div>
<div style="display:flex;justify-content:space-between;margin-top:15px">
  <div><div class="assinatura">Assinatura do Manutentor</div></div>
  <div><div class="assinatura">Aprovação do Supervisor</div></div>
  <div><div class="assinatura">Revisão Próxima</div></div>
</div>
<script>window.print();<\/script></body></html>`);
  win.document.close();
}

