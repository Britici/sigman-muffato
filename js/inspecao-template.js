/* ══════════════════════════════════════════════════════════════════
   SIGMAN — TEMPLATES DE INSPEÇÃO (admin)
   Muffato Foods
   Inspeção de Rota foi descontinuada (16/07/2026) — só Mecânica/Elétrica.
   ══════════════════════════════════════════════════════════════════ */

const INSP_MAQ_ITEMS = [
  {sistema:'Mecânico',    itens:['Fixação e alinhamento geral','Correntes / correias / polias','Rolamentos (temperatura, vibração, ruído)','Vedações e gaxetas','Folgas e desgastes','Lubrificação (nível e estado)']},
  {sistema:'Elétrico',    itens:['Motor (temperatura, vibração, ruído)','Cabos e conexões elétricas','Inversor de frequência','Sensores e fim-de-curso','Resistências e aquecedores']},
  {sistema:'Pneumático',  itens:['Pressão de trabalho','Vazamentos na linha','Cilindros pneumáticos','Válvulas solenoides']},
  {sistema:'Estrutural',  itens:['Estrutura e parafusos','Proteções e guardas','Limpeza geral','Identificação e etiquetas']},
  {sistema:'Instrumentação',itens:['Sensores de temperatura','Sensores de pressão','Manômetros e vacuômetros','IHM e painel (display)']}
];

function initInspTmpl() {
  populateSalaFilter('insp-tmpl-sala');
  sv('insp-tmpl-dt', today());
  if(CU.tipo!=='producao') sv('insp-tmpl-mn', CU.nome);
  renderInspTmpl();
}

function renderInspTmpl() {
  const sala = v('insp-tmpl-sala');
  const items = INSP_MAQ_ITEMS;

  const maqsFiltradas = sala ? db.maquinas.filter(m=>m.sala===sala) : db.maquinas;
  const maqSelect = `<div class="card" style="margin-bottom:10px">
    <div class="card-t">Máquina Inspecionada</div>
    <div class="fg"><label>Selecione a Máquina</label>
      <select id="insp-tmpl-maq">
        <option value="">Selecione...</option>
        ${maqsFiltradas.sort((a,b)=>a.nome.localeCompare(b.nome)).map(m=>`<option value="${m.sala}|${m.nome}|${m.tag}">${m.nome} (${m.sala})${m.tag?' – '+m.tag:''}</option>`).join('')}
      </select>
    </div>
  </div>`;

  const body = `${maqSelect}${items.map((grp,gi)=>`
    <div class="card" style="margin-bottom:10px">
      <div class="card-t">${grp.sistema}</div>
      ${grp.itens.map((item,ii)=>`
        <div class="insp-tmpl-row" data-id="${gi}-${ii}" style="display:grid;grid-template-columns:1fr auto auto 1.5fr;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--bord)">
          <div style="font-size:13px">${item}</div>
          <div style="display:flex;gap:5px">
            <button class="iok"  onclick="setItmStatus('it-${gi}-${ii}','ok',this)">OK</button>
            <button class="inok" onclick="setItmStatus('it-${gi}-${ii}','nok',this)">NOK</button>
          </div>
          <div><input type="text" id="itval-${gi}-${ii}" placeholder="Valor/Medição" style="background:var(--inp);border:1px solid var(--bord);border-radius:4px;color:var(--txt);font-size:12px;padding:4px 8px;width:90px;outline:none"></div>
          <div><input type="text" id="itobs-${gi}-${ii}" placeholder="Observações / Ação necessária" style="background:var(--inp);border:1px solid var(--bord);border-radius:4px;color:var(--txt);font-size:12px;padding:4px 8px;width:100%;outline:none"></div>
          <input type="hidden" id="itst-${gi}-${ii}" value="">
        </div>`).join('')}
    </div>`).join('')}`;

  document.getElementById('insp-tmpl-body').innerHTML = body;
}

function setItmStatus(id, st, btn) {
  const row = btn.closest('.insp-tmpl-row');
  row.querySelectorAll('.iok,.inok').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  const hid = document.getElementById('itst-' + id.replace('it-', ''));
  if (hid) hid.value = st;
}

async function salvarInspTmpl() {
  const data=v('insp-tmpl-dt'),manut=v('insp-tmpl-mn').trim();
  if(!data||!manut){showToast('Informe data e manutentor.');return;}
  const items=INSP_MAQ_ITEMS;
  const agora=new Date().toISOString();
  const mv=v('insp-tmpl-maq').split('|');
  const maqInfo={sala:mv[0]||'',nome:mv[1]||'',tag:mv[2]||''};
  items.forEach((grp,gi)=>{
    grp.itens.forEach((item,ii)=>{
      const hid=document.getElementById('itst-'+gi+'-'+ii);
      const st=hid?hid.value:'';
      const val=v('itval-'+gi+'-'+ii);
      const obs=v('itobs-'+gi+'-'+ii);
      apiAppend('insp_maquina',{ID:agora,Data:data,Maquina:maqInfo.nome,Tag:maqInfo.tag,
        Manutentor:manut,Sistema:grp.sistema,Item_Verificado:item,Status:st,
        Valor_Medido:val,Unidade:'',Observacoes:obs,Acao_Necessaria:'',Criado_Em:agora});
    });
  });
  showToast('Inspeção salva no banco de dados!');
}

function imprimirInspecao() {
  const data=v('insp-tmpl-dt')||today(), manut=v('insp-tmpl-mn')||'_______________';
  const sala=v('insp-tmpl-sala')||'Todas as Salas';
  const titulo = 'INSPEÇÃO MECÂNICA E ELÉTRICA';
  const items  = INSP_MAQ_ITEMS;

  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>${titulo}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#000;padding:15mm}
    h1{font-size:16px;text-align:center;margin-bottom:4px;color:#C41230}
    h2{font-size:13px;margin:12px 0 4px}
    .header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #C41230;padding-bottom:8px;margin-bottom:12px}
    .empresa{font-size:14px;font-weight:bold}
    .info-row{display:flex;gap:20px;margin-bottom:8px;flex-wrap:wrap}
    .info-box{border:1px solid #ccc;border-radius:4px;padding:6px 10px;min-width:150px}
    .info-label{font-size:9px;color:#666;text-transform:uppercase}
    .info-val{font-size:12px;font-weight:bold}
    table{width:100%;border-collapse:collapse;margin-bottom:12px}
    th{background:#C41230;color:#fff;padding:6px 8px;text-align:left;font-size:10px}
    td{padding:6px 8px;border:1px solid #ddd;vertical-align:middle}
    .st-box{width:16px;height:16px;border:1px solid #999;border-radius:3px;display:inline-block}
    .assinatura{border-top:1px solid #000;width:200px;margin-top:40px;padding-top:4px;font-size:10px}
    @media print{body{padding:10mm}}
  </style></head><body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:10px">
      <img src="https://muffatofoods.com.br/assets/images/foods_logo.png" style="height:44px;object-fit:contain" alt="Muffato">
      <div><div class="empresa">MUFFATO FOODS</div><div>Gestão de Manutenção — PCM</div></div>
    </div>
    <div><h1>${titulo}</h1></div>
    <div style="text-align:right;font-size:10px">Doc: SIGMAN<br>Rev: 01</div>
  </div>
  <div class="info-row">
    <div class="info-box"><div class="info-label">Data</div><div class="info-val">${fd(data)}</div></div>
    <div class="info-box"><div class="info-label">Manutentor</div><div class="info-val">${manut}</div></div>
    <div class="info-box"><div class="info-label">Sala / Área</div><div class="info-val">${sala}</div></div>
    <div class="info-box"><div class="info-label">Máquina</div><div class="info-val">${v('insp-tmpl-maq').split('|')[1]||'_______________'}</div></div>
  </div>
  ${items.map(grp=>`
  <h2>● ${grp.sistema}</h2>
  <table>
    <tr><th style="width:40%">Item Verificado</th><th style="width:8%">OK</th><th style="width:8%">NOK</th><th style="width:20%">Valor / Medição</th><th>Observações / Ação</th></tr>
    ${grp.itens.map(it=>`<tr>
      <td>${it}</td>
      <td style="text-align:center"><span class="st-box"></span></td>
      <td style="text-align:center"><span class="st-box"></span></td>
      <td></td><td></td>
    </tr>`).join('')}
  </table>`).join('')}
  <div style="display:flex;justify-content:space-between;margin-top:20px">
    <div><div class="assinatura">Assinatura do Manutentor</div></div>
    <div><div class="assinatura">Visto do Supervisor</div></div>
  </div>
  <script>window.print();<\/script></body></html>`);
  win.document.close();
}
