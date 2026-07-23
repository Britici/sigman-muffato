/* ══════════════════════════════════════════════════════════════════
   SIGMAN — MANUAIS E SENHAS
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */

let _msCredAtual = [];   // credenciais em edição: [{tipo,usuario,senha}]
let _msRegistroAtual = null; // registro existente (db.manuaisSenhas) da máquina selecionada, ou null

function initManuaisSenhas() {
  const souAdmin = CU.tipo === 'administracao';

  // Manutenção só enxerga o card de máquinas cadastradas (consulta).
  const colAdmin = document.getElementById('ms-col-admin');
  if (colAdmin) colAdmin.style.display = souAdmin ? '' : 'none';

  const selSala = document.getElementById('ms-sala');
  if (selSala) {
    selSala.innerHTML = '<option value="">Selecione...</option>' +
      [...db.salas].sort().map(s => `<option value="${s}">${s}</option>`).join('');
  }
  const selMaq = document.getElementById('ms-maq');
  if (selMaq) selMaq.innerHTML = '<option value="">Selecione a sala primeiro...</option>';
  const cardEd = document.getElementById('ms-card-edicao');
  if (cardEd) cardEd.style.display = 'none';

  // Filtro de sala do card "Máquinas Cadastradas" — sempre visível, pra ambos os perfis.
  const selListaSala = document.getElementById('ms-lista-sala');
  if (selListaSala) {
    selListaSala.innerHTML = '<option value="">Todas as salas</option>' +
      [...db.salas].sort().map(s => `<option value="${s}">${s}</option>`).join('');
  }
}

function filtrarMSMaq() {
  const sala = v('ms-sala');
  const sel = document.getElementById('ms-maq');
  sel.innerHTML = '<option value="">Selecione...</option>' +
    [...db.maquinas]
      .filter(m => !sala || m.sala === sala)
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map(m => `<option value="${m.sala}|${m.nome}">${m.nome}${m.tag ? ' – ' + m.tag : ''}</option>`)
      .join('');
  document.getElementById('ms-card-edicao').style.display = 'none';
}

function selecionarMSMaquina() {
  if (CU.tipo !== 'administracao') return; // manutenção não edita
  const val = v('ms-maq');
  if (!val) { document.getElementById('ms-card-edicao').style.display = 'none'; return; }
  const [sala, maquina] = val.split('|');

  _msRegistroAtual = db.manuaisSenhas.find(r => r.sala === sala && r.maquina === maquina) || null;
  _msCredAtual = _msRegistroAtual ? JSON.parse(JSON.stringify(_msRegistroAtual.credenciais || [])) : [];

  sv('ms-manual-url', _msRegistroAtual ? _msRegistroAtual.manualUrl : '');
  document.getElementById('ms-manual-url').removeAttribute('readonly');
  _renderMSCred();

  document.getElementById('ms-card-edicao').style.display = 'block';
}

function addMSCredencial() {
  _msCredAtual.push({ tipo: '', usuario: '', senha: '' });
  _renderMSCred();
}

function removeMSCredencial(i) {
  _msCredAtual.splice(i, 1);
  _renderMSCred();
}

function toggleMSSenha(i) {
  const el = document.getElementById('ms-cred-senha-' + i);
  if (!el) return;
  el.type = el.type === 'password' ? 'text' : 'password';
}

function _msAtualizaCampo(i, campo, valor) {
  if (_msCredAtual[i]) _msCredAtual[i][campo] = valor;
}

function _renderMSCred() {
  const box = document.getElementById('ms-cred-list');
  if (!_msCredAtual.length) {
    box.innerHTML = '<div style="opacity:.6;font-size:13px;padding:4px 0">Nenhuma credencial cadastrada.</div>';
    return;
  }
  box.innerHTML = _msCredAtual.map((c, i) => `
    <div class="fg-row fg-3" style="align-items:end;margin-bottom:6px">
      <div class="fg"><label>Tipo</label>
        <input type="text" value="${c.tipo || ''}" placeholder="Ex: CLP, IHM"
          oninput="_msAtualizaCampo(${i},'tipo',this.value)">
      </div>
      <div class="fg"><label>Usuário</label>
        <input type="text" value="${c.usuario || ''}" placeholder="Usuário"
          oninput="_msAtualizaCampo(${i},'usuario',this.value)">
      </div>
      <div class="fg"><label>Senha</label>
        <div style="display:flex;gap:4px">
          <input type="password" id="ms-cred-senha-${i}" value="${c.senha || ''}" placeholder="Senha"
            oninput="_msAtualizaCampo(${i},'senha',this.value)">
          <button type="button" class="btn btn-gh btn-sm" onclick="toggleMSSenha(${i})">👁</button>
          <button type="button" class="btn btn-gh btn-sm" onclick="removeMSCredencial(${i})">🗑</button>
        </div>
      </div>
    </div>`).join('');
}

async function salvarMS() {
  if (CU.tipo !== 'administracao') return;
  const val = v('ms-maq');
  if (!val) { showToast('Selecione a máquina.', 'er'); return; }
  const [sala, maquina] = val.split('|');
  const manualUrl = v('ms-manual-url').trim();
  const credenciais = _msCredAtual.filter(c => c.tipo || c.usuario || c.senha);

  const row = {
    id: _msRegistroAtual ? _msRegistroAtual.id : null,
    sala,
    equipamento: maquina,
    manualUrl,
    credenciais
  };

  const res = await apiPost({ action: 'salvarManualSenha', dados: row, usuario: CU.nome });
  if (!res || !res.ok) { showToast('Falha ao salvar (verifique conexão).', 'er'); return; }

  showToast('Salvo com sucesso.', 'ok');
  await apiLoadManuaisSenhas();
  selecionarMSMaquina();
  renderMSLista();
}

// ── Lista "Máquinas Cadastradas" — filtro por sala + busca + ações ────────
function renderMSLista() {
  const box = document.getElementById('ms-lista');
  if (!box) return;
  const busca = (v('ms-busca') || '').toLowerCase();
  const salaFiltro = v('ms-lista-sala') || '';

  const itens = db.manuaisSenhas
    .filter(r => !salaFiltro || r.sala === salaFiltro)
    .filter(r => !busca || r.maquina.toLowerCase().includes(busca) || r.sala.toLowerCase().includes(busca))
    .sort((a, b) => a.maquina.localeCompare(b.maquina));

  if (!itens.length) {
    box.innerHTML = '<div class="empty"><p>Nenhum registro cadastrado.</p></div>';
    return;
  }

  box.innerHTML = itens.map(r => {
    const temManual = !!r.manualUrl;
    const temCred = r.credenciais && r.credenciais.length;
    return `
    <div class="edit-row">
      <div style="cursor:${CU.tipo === 'administracao' ? 'pointer' : 'default'}"
           ${CU.tipo === 'administracao' ? `onclick="_msIrPara('${r.sala}','${r.maquina}')"` : ''}>
        <b>${r.maquina}</b> <span style="opacity:.6">(${r.sala})</span>
      </div>
      <div class="edit-acts" style="gap:6px">
        <button class="btn btn-gh btn-sm" ${temManual ? '' : 'disabled style="opacity:.4"'}
          onclick="event.stopPropagation();_msAbrirManual('${r.id}')">🔗 Abrir</button>
        <button class="btn btn-gh btn-sm" ${temCred ? '' : 'disabled style="opacity:.4"'}
          onclick="event.stopPropagation();_msVerCredenciais('${r.id}')">🔑 Senha</button>
      </div>
    </div>`;
  }).join('');
}

function _msIrPara(sala, maquina) {
  sv('ms-sala', sala);
  filtrarMSMaq();
  sv('ms-maq', sala + '|' + maquina);
  selecionarMSMaquina();
}

function _msAbrirManual(id) {
  const r = db.manuaisSenhas.find(x => x.id === id);
  if (!r || !r.manualUrl) return;
  window.open(r.manualUrl, '_blank', 'noopener');
}

function _msVerCredenciais(id) {
  const r = db.manuaisSenhas.find(x => x.id === id);
  const body = document.getElementById('ms-cred-modal-body');
  if (!r || !r.credenciais || !r.credenciais.length) {
    body.innerHTML = '<div style="opacity:.6;font-size:13px">Nenhuma credencial cadastrada.</div>';
  } else {
    body.innerHTML = `<div style="font-size:13px;opacity:.75;margin-bottom:8px">${r.maquina} — ${r.sala}</div>` +
      r.credenciais.map((c) => `
      <div class="edit-row" style="margin-bottom:6px">
        <div>
          <div style="font-size:12px;opacity:.7">${c.tipo || 'Acesso'}</div>
          <div><b>Usuário:</b> ${c.usuario || '—'}</div>
          <div><b>Senha:</b> ${c.senha || '—'}</div>
        </div>
      </div>`).join('');
  }
  openM('m-ms-cred');
}
