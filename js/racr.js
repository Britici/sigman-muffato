/* ══════════════════════════════════════════════════════════════════
   SIGMAN — RACR - RELATÓRIO DE ANÁLISE DE CAUSA RAÍZ
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */
  
// ── Abre modal RACR em branco (botão "+ Novo RACR" na página) ──────
function abrirNovoRACR() {
  _racrOsRef = null;
  // Popula select de salas
  const salaSel = document.getElementById('racr-sala');
  if (salaSel) {
    salaSel.innerHTML = '<option value="">Selecione...</option>' +
      db.salas.map(s => `<option value="${s}">${s}</option>`).join('');
    salaSel.removeAttribute('disabled');
  }
  // Popula select de equipamentos (todos)
  racrFiltrarMaq();
  const equipSel = document.getElementById('racr-equip');
  if (equipSel) equipSel.removeAttribute('disabled');
  // Limpa campos de texto
  ['racr-falha','racr-causa','racr-p1','racr-p2','racr-p3','racr-p4','racr-p5',
   'racr-imediata','racr-preventiva','racr-resp-prod','racr-resp-manu','racr-exec']
  .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  // Data e hora atuais
  const dtEl = document.getElementById('racr-data');
  const dtDispEl = document.getElementById('racr-data_disp');
  const hrEl = document.getElementById('racr-hora');
  if (dtEl) { dtEl.value = today(); dtEl.removeAttribute('readonly'); }
  if (dtDispEl) { dtDispEl.value = fd(today()); dtDispEl.removeAttribute('readonly'); }
  if (hrEl) { hrEl.value = new Date().toTimeString().slice(0,5); hrEl.removeAttribute('readonly'); }
  _racrFotosNovas = []; _racrFotosSalvas = []; _racrRenderFotos();
  openM('mb-racr');
}
 
// ── Fecha o modal RACR ────────────────────────────────────────────
function fecharRACR() {
  closeM('mb-racr');
  _racrOsRef = null;
}
 
// ── Salva rascunho localmente (sem enviar ao Sheets) ──────────────
function salvarRACRRascunho() {
  const dados = _coletarDadosRACR();
  if (!dados) return;
  if (!db.racs) db.racs = [];
  // Verifica se já existe rascunho para essa OS
  const idx = _racrOsRef
    ? db.racs.findIndex(r => r.osNumero === _racrOsRef && r.status === 'Rascunho')
    : -1;
  const agora = new Date().toISOString();
  const id    = idx >= 0 ? db.racs[idx].id : 'RACR-' + agora.replace(/\D/g,'').slice(0,14);
  if (!dados.maquina && _racrOsRef) {
  const osRef = db.ordens.find(x => x.numero === _racrOsRef);
  if (osRef) { dados.maquina = osRef.maq; dados.sala = osRef.sala; }
  }
  const racr = { ...dados, id, status: 'Rascunho', dataAbertura: agora.slice(0,10), criadoEm: agora };
  if (idx >= 0) db.racs[idx] = racr; else db.racs.push(racr);
  saveDB();
  fecharRACR();
  showToast('Rascunho salvo localmente.', 'ok');
  renderRACR();
}
 
// ── Salva RACR definitivo + envia ao Sheets ───────────────────────
async function salvarRACR() {
  const dados = _coletarDadosRACR();
  if (!dados) return;
  if (!db.racs) db.racs = [];
  const agora = new Date().toISOString();
  const id    = 'RACR-' + agora.replace(/\D/g,'').slice(0,14);
  const racr  = { ...dados, id, status: 'Aberto', dataAbertura: agora.slice(0,10), criadoEm: agora };
  // Remove rascunho anterior se existir
  if (_racrOsRef) {
    const idxR = db.racs.findIndex(r => r.osNumero === _racrOsRef && r.status === 'Rascunho');
    if (idxR >= 0) db.racs.splice(idxR, 1);
  }
  // Upload das fotos novas pro Drive (mantém as já salvas, se houver)
  const urlsFotos = [..._racrFotosSalvas];
  for (const f of _racrFotosNovas) {
    try {
      const r = await apiPost({ action: 'uploadFoto', numero: id, fileName: f.name, mimeType: f.mime, base64: f.b64 });
      if (r?.ok && r.fileUrl) urlsFotos.push(r.fileUrl);
    } catch (e) { console.warn('Foto RACR não enviada:', e); }
  }
  racr.fotos = urlsFotos;
  db.racs.push(racr);
  saveDB();
  // Envia ao Sheets (action salvarRACR no AppScript)
  apiPost({
    action: 'salvarRACR',
    racr: {
      data:          racr.dataAbertura,
      osNumero:      racr.osNumero,
      equipamento:   racr.maquina,
      sala:          racr.sala,
      criticidade:   racr.criticidade,
      tempoParada:   racr.tempoParada,
      limiteMin:     racr.limiteMin,
      falha:         racr.falha,
      causa:         racr.causaRaiz,
      why1:          racr.why1,
      why2:          racr.why2,
      why3:          racr.why3,
      why4:          racr.why4,
      why5:          racr.why5,
      acaoImediata:  racr.acaoImediata,
      acaoPreventiva:racr.acaoPreventiva,
      respProd:      racr.respProd,
      respManu:      racr.respManu,
      executantes:   racr.executantes,
      fotos:         urlsFotos,
      usuario:       CU?.nome || 'Sistema'
    }
  }).then(res => {
    if (res?.ok) {
      showToast('RACR salvo no Sheets.', 'ok');
      apiLoadRacs().then(renderRACR);
    } else {
      showToast('Salvo localmente — Sheets indisponível.', 'war');
      renderRACR();
    }
  });
  fecharRACR();
  showToast('RACR criado com sucesso.', 'ok');
}
 
// ── Encerra/fecha um RACR ─────────────────────────────────────────
function encerrarRACR(id) {
  if (!confirm('Confirmar encerramento deste RACR?')) return;
  const idx = (db.racs||[]).findIndex(r => r.id === id);
  if (idx < 0) return;
  const agora = new Date().toISOString();
  db.racs[idx].status      = 'Fechado';
  db.racs[idx].dataBaixa   = agora.slice(0,10);
  db.racs[idx].fechadoPor  = CU?.nome || '';
  saveDB();
  renderRACR();
  showToast('RACR encerrado.', 'ok');
  apiPost({ action: 'encerrarRACR', id, usuario: CU?.nome || '' });
}
 
// ── Imprime o RACR em nova janela ─────────────────────────────────
function imprimirRACR() {
  const dados = _coletarDadosRACR(false); // false = não valida obrigatórios
  const win   = window.open('', '_blank');
  const data  = document.getElementById('racr-data')?.value  || today();
  const hora  = document.getElementById('racr-hora')?.value  || '';
  const fotos = [..._racrFotosSalvas, ..._racrFotosNovas.map(f => `data:${f.mime};base64,${f.b64}`)].slice(0, RACR_MAX_FOTOS);
  const fotosHtml = Array.from({ length: RACR_MAX_FOTOS }, (_, i) => fotos[i]
    ? `<div class="foto-box"><img src="${fotos[i]}" alt="Foto ${i+1}"></div>`
    : `<div class="foto-box foto-vazia">FOTO ${i+1}</div>`
  ).join('');
  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
  <title>RACR — ${dados?.maquina || ''}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:12px;color:#000;padding:10mm 12mm}
    h1{font-size:20px;font-weight:800}
    .logo-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
    .sub{font-size:11px;color:#555}
    .cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .bar{background:linear-gradient(90deg,#d99a1f,#B8972A);color:#fff;font-weight:700;font-size:12px;
      padding:5px 10px;margin:8px 0 6px;text-transform:uppercase;letter-spacing:.5px;border-radius:2px}
    .field{margin-bottom:6px}
    .field label{font-size:9px;font-weight:700;color:#888;text-transform:uppercase;display:block}
    .field p{border-bottom:1px solid #ccc;min-height:16px;padding:2px 0;font-size:12px}
    .why-item{display:flex;gap:6px;margin-bottom:8px;align-items:flex-start}
    .why-num{background:#C41230;color:#fff;font-weight:700;font-size:10px;border-radius:50%;
      width:16px;height:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .why-line{flex:1;border-bottom:1px solid #ccc;min-height:14px;padding:1px 0}
    .foto-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:6px}
    .foto-box{background:#f2f2f2;border:1px solid #ddd;border-radius:4px;height:120px;
      display:flex;align-items:center;justify-content:center;overflow:hidden}
    .foto-box img{width:100%;height:100%;object-fit:cover}
    .foto-vazia{color:#999;font-size:11px;font-weight:700}
    .assinaturas{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:16px}
    .ass{border-top:1px solid #000;padding-top:4px;font-size:11px;text-align:center}
    @media print{body{padding:6mm 8mm}}
  </style>
  </head><body>
  <div class="logo-row">
    <div>
      <h1>RELATÓRIO ANÁLISE CAUSA RAIZ</h1>
      <div class="sub">Muffato Foods · PCM · ${data} ${hora ? '· ' + hora : ''}</div>
    </div>
    <img src="https://muffatofoods.com.br/assets/images/foods_logo.png" style="height:36px">
  </div>

  <div class="cols">
    <div>
      <div class="bar">1 - Identificação do Problema</div>
      <div class="field"><label>Tag/Equip</label><p>${dados?.maquina||''}</p></div>
      <div class="field"><label>Data</label><p>${data}</p></div>
      <div class="field"><label>Hora da Parada</label><p>${hora}</p></div>

      <div class="bar">2 - Falha / Efeito</div>
      <div class="field"><label>Falha identificada</label><p style="min-height:30px">${dados?.falha||''}</p></div>

      <div class="bar">3 - Causa</div>
      <div class="field"><label>Detalhamento</label><p style="min-height:30px">${dados?.causaRaiz||''}</p></div>

      <div class="bar">4 - Análise dos 5 Porquês</div>
      ${[dados?.why1,dados?.why2,dados?.why3,dados?.why4,dados?.why5].map((w,i)=>`
      <div class="why-item"><div class="why-num">${i+1}</div><div class="why-line">${w||''}</div></div>`).join('')}
    </div>

    <div>
      <div class="bar">Evidências da Falha</div>
      <div class="foto-grid">${fotosHtml}</div>

      <div class="bar">5 - Ação Imediata</div>
      <div class="field"><p style="min-height:26px">${dados?.acaoImediata||''}</p></div>

      <div class="bar">6 - Ação Preventiva</div>
      <div class="field"><p style="min-height:26px">${dados?.acaoPreventiva||''}</p></div>

      <div class="bar">7 - Equipe Responsável</div>
      <div class="field"><label>Resp. Produção</label><p>${dados?.respProd||''}</p></div>
      <div class="field"><label>Resp. Manutenção</label><p>${dados?.respManu||''}</p></div>
      <div class="field"><label>Executantes</label><p>${dados?.executantes||''}</p></div>
    </div>
  </div>

  <div class="assinaturas">
    <div class="ass">Responsável Produção</div>
    <div class="ass">Responsável Manutenção</div>
    <div class="ass">Coordenador / Supervisor</div>
  </div>
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}
 
// ── Renderiza tabelas de RACRs na página pg-analise-causa-raiz ────
function renderRACR() {
  const tbAbertos   = document.getElementById('tb-racr-abertos');
  const tbFechados  = document.getElementById('tb-racr-fechados');
  if (!tbAbertos || !tbFechados) return;
  const todosSheets = db.racs || [];
  const rascunhosLocais = JSON.parse(localStorage.getItem('sigman_v4') || '{}').racs || [];
  const idsSheets = new Set(todosSheets.map(r => r.id));
  const extras = rascunhosLocais.filter(r => r.status === 'Rascunho' && !idsSheets.has(r.id));
  const todos = [...todosSheets, ...extras];
  const abertos = todos.filter(r => r.status !== 'Fechado');
  const fechados = todos.filter(r => r.status === 'Fechado');
 
  tbAbertos.innerHTML = abertos.length ? abertos.map(r => `
    <tr>
      <td class="osn">${r.id}</td>
      <td>${fd(r.dataAbertura)}</td>
      <td>${r.maquina||'—'}</td>
      <td style="max-width:200px;white-space:normal">${r.falha||'—'}</td>
      <td style="max-width:200px;white-space:normal">${r.causaRaiz||'—'}</td>
      <td><span class="badge ${r.status==='Rascunho'?'b-pen':'b-cor'}">${r.status}</span></td>
      <td style="display:flex;gap:5px;flex-wrap:wrap">
        <button class="btn btn-edit btn-sm" onclick="verRACR('${r.id}')">👁 Ver</button>
        ${r.status!=='Fechado'?`<button class="btn btn-g btn-sm" onclick="encerrarRACR('${r.id}')">✅ Encerrar</button>`:''}
      </td>
    </tr>`).join('')
    : `<tr><td colspan="7" class="empty"><div class="ei">✅</div><p>Nenhum RAC em Aberto</p></td></tr>`;
 
  tbFechados.innerHTML = fechados.length ? fechados.map(r => `
    <tr>
      <td class="osn">${r.id}</td>
      <td>${fd(r.dataAbertura)}</td>
      <td>${r.maquina||'—'}</td>
      <td>${fd(r.dataBaixa)}</td>
      <td><button class="btn btn-edit btn-sm" onclick="verRACR('${r.id}')">👁 Ver</button></td>
    </tr>`).join('')
    : `<tr><td colspan="7" class="empty"><div class="ei">✅</div><p>Nenhum RAC Concluído</p></td></tr>`;
}
 
// ── Abre modal de visualização de um RACR existente ───────────────
function verRACR(id) {
  const r = (db.racs||[]).find(x => x.id === id);
  if (!r) return;
  // Preenche o modal com os dados do RACR
  _racrOsRef = r.osNumero || null;
  const setVal = (elId, val) => { const el = document.getElementById(elId); if (el) el.value = val||''; };
  setVal('racr-equip',    r.maquina);
  setVal('racr-sala',     r.sala);
  setVal('racr-data',     r.dataAbertura);
  setVal('racr-data_disp', fd(r.dataAbertura) === '—' ? '' : fd(r.dataAbertura));
  setVal('racr-hora',     '');
  setVal('racr-falha',    r.falha);
  setVal('racr-causa',    r.causaRaiz);
  setVal('racr-p1',       r.why1);
  setVal('racr-p2',       r.why2);
  setVal('racr-p3',       r.why3);
  setVal('racr-p4',       r.why4);
  setVal('racr-p5',       r.why5);
  setVal('racr-imediata',   r.acaoImediata);
  setVal('racr-preventiva', r.acaoPreventiva);
  setVal('racr-resp-prod',  r.respProd);
  setVal('racr-resp-manu',  r.respManu);
  setVal('racr-exec',       r.executantes);
  _racrFotosNovas = []; _racrFotosSalvas = Array.isArray(r.fotos) ? [...r.fotos] : []; _racrRenderFotos();
  openM('mb-racr');
}
 
// ── Coleta dados do formulário modal RACR ────────────────────────
function _coletarDadosRACR(validar = true) {
  const g = id => document.getElementById(id)?.value?.trim() || '';
  const falha = g('racr-falha');
  if (validar && !falha) { showToast('Informe a falha identificada.', 'er'); return null; }
  const maquina = g('racr-equip') || (_racrOsRef ? (db.ordens.find(x=>x.numero===_racrOsRef)?.maq||'') : '');
  const crit    = getCriticidadeMaq(maquina);
  return {
    osNumero:      _racrOsRef || '',
    maquina,
    sala:          g('racr-sala'),
    criticidade:   crit,
    tempoParada:   0,
    limiteMin:     limiteRAC(crit),
    falha,
    causaRaiz:     g('racr-causa'),
    why1:          g('racr-p1'),
    why2:          g('racr-p2'),
    why3:          g('racr-p3'),
    why4:          g('racr-p4'),
    why5:          g('racr-p5'),
    acaoImediata:  g('racr-imediata'),
    acaoPreventiva:g('racr-preventiva'),
    respProd:      g('racr-resp-prod'),
    respManu:      g('racr-resp-manu'),
    executantes:   g('racr-exec')
  };
}
 
// Variável de estado: OS que originou o RACR atual
let _racrOsRef = null;
// Estado de fotos do RACR atual: novas (ainda não enviadas) e já salvas (URLs do Drive)
let _racrFotosNovas = [];   // [{name, mime, b64}]
let _racrFotosSalvas = [];  // [url, ...]
const RACR_MAX_FOTOS = 4;

function _racrTotalFotos() { return _racrFotosNovas.length + _racrFotosSalvas.length; }

function racrAddFotos(fileList) {
  const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
  const vagas = RACR_MAX_FOTOS - _racrTotalFotos();
  if (vagas <= 0) { showToast('Máximo de ' + RACR_MAX_FOTOS + ' fotos.', 'war'); return; }
  files.slice(0, vagas).forEach(f => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const MAX_W = 1280, MAX_H = 1280, MAX_BYTES = 350 * 1024;
        let w = img.width, h = img.height;
        if (w > MAX_W || h > MAX_H) {
          const ratio = Math.min(MAX_W / w, MAX_H / h);
          w = Math.round(w * ratio); h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        let quality = 0.85;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length * 0.75 > MAX_BYTES && quality > 0.35) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        _racrFotosNovas.push({ name: f.name, mime: 'image/jpeg', b64: dataUrl.split(',')[1] });
        _racrRenderFotos();
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(f);
  });
}

function racrRemoveFotoNova(i) { _racrFotosNovas.splice(i, 1); _racrRenderFotos(); }
function racrRemoveFotoSalva(i) { _racrFotosSalvas.splice(i, 1); _racrRenderFotos(); }

function _racrRenderFotos() {
  const c = document.getElementById('racr-foto-preview');
  if (!c) return;
  c.innerHTML =
    _racrFotosSalvas.map((url, i) => `
      <div class="racr-thumb">
        <img src="${url}" alt="Foto salva">
        <button type="button" class="racr-thumb-del" onclick="racrRemoveFotoSalva(${i})" title="Remover">✕</button>
        <span class="racr-thumb-tag">salva</span>
      </div>`).join('') +
    _racrFotosNovas.map((f, i) => `
      <div class="racr-thumb">
        <img src="data:${f.mime};base64,${f.b64}" alt="${f.name}">
        <button type="button" class="racr-thumb-del" onclick="racrRemoveFotoNova(${i})" title="Remover">✕</button>
      </div>`).join('');
}
 
// Hook na função showPg para renderizar RACRs ao entrar na página
const _origShowPg = typeof showPg === 'function' ? showPg : null;
// (renderRACR é chamado manualmente ao navegar — ver instrução abaixo)
   
