/* ══════════════════════════════════════════════════════════════════
   SIGMAN — USUÁRIOS (aba dedicada, só admin)
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */

var usrSort = { col: 'nome', dir: 'asc' };

function sortUsr(col) {
  if (usrSort.col === col) {
    usrSort.dir = usrSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    usrSort.col = col;
    usrSort.dir = 'asc';
  }
  renderUsuarios();
}

function _usrRoleLabel(t) {
  return (ROLES[t] && ROLES[t].label) || t || '';
}

function _usrRowHtml(u) {
  const podeMexer = CU && CU.tipo === 'administracao';
  const acoes = podeMexer ? `
      <div style="display:flex;gap:6px;flex-wrap:wrap">
       <button class="btn btn-sm btn-gh" onclick="abrirEditarUsuario('${u.login}')">✏️ Editar</button>
       <button class="btn btn-sm btn-gh" onclick="resetarSenhaUsuario('${u.login}')">🔑 Resetar</button>
       ${u.ativo
         ? `<button class="btn btn-sm btn-gh" onclick="toggleAtivoUsuario('${u.login}', false)">🚫 Desativar</button>`
         : `<button class="btn btn-sm btn-p"  onclick="toggleAtivoUsuario('${u.login}', true)">✅ Reativar</button>`}
      </div>` : '—';

  return `
    <tr>
     <td>${u.nome || ''}</td>
     <td>${u.cargo || '–'}</td>
     <td>${u.login}</td>
     <td>${roleBadge(u.tipo)}</td>
     <td>${acoes}</td>
    </tr>`;
}

function renderUsuarios() {
  const tbA = document.getElementById('tb-usr-ativos');
  const tbI = document.getElementById('tb-usr-inativos');
  if (!tbA || !tbI) return;

  const { col, dir } = usrSort;
  const withPerfil = u => ({ ...u, perfil: _usrRoleLabel(u.tipo) });
  const norm = col === 'perfil' ? withPerfil : (u => u);
  const cmp = (a, b) => {
    const va = (a[col] || '').toString().toLowerCase();
    const vb = (b[col] || '').toString().toLowerCase();
    const r = va.localeCompare(vb);
    return dir === 'asc' ? r : -r;
  };

  ['nome', 'cargo', 'login', 'perfil'].forEach(c => {
    const el = document.getElementById('uh-' + c);
    if (!el) return;
    el.classList.remove('asc', 'desc');
    if (c === col) el.classList.add(dir);
  });

  const ativos   = db.usuarios.filter(u => u.ativo !== false).map(norm).sort(cmp);
  const inativos = db.usuarios.filter(u => u.ativo === false).map(norm).sort(cmp);

  document.getElementById('usr-tit-ativos').textContent   = `Usuários Ativos (${ativos.length})`;
  document.getElementById('usr-tit-inativos').textContent = `Usuários Desativados (${inativos.length})`;

  tbA.innerHTML = ativos.length
    ? ativos.map(_usrRowHtml).join('')
    : '<tr><td colspan="5" class="empty" style="padding:20px 0">Nenhum usuário ativo.</td></tr>';

  tbI.innerHTML = inativos.length
    ? inativos.map(_usrRowHtml).join('')
    : '<tr><td colspan="5" class="empty" style="padding:20px 0">Nenhum usuário desativado.</td></tr>';
}

// ══════════════════════════════════════════════════════════════════════
// MODAL: NOVO / EDITAR
// ══════════════════════════════════════════════════════════════════════
function _usrPopulatePerfil() {
  const sel = document.getElementById('usr-perfil');
  sel.innerHTML = Object.keys(ROLES).map(k => `<option value="${k}">${ROLES[k].label}</option>`).join('');
}

function abrirNovoUsuario() {
  _usrPopulatePerfil();
  document.getElementById('usr-m-t').textContent = 'Novo Usuário';
  document.getElementById('usr-login-orig').value = '';
  document.getElementById('usr-nome').value = '';
  document.getElementById('usr-cargo').value = '';
  document.getElementById('usr-login').value = '';
  document.getElementById('usr-login').disabled = false;
  document.getElementById('usr-perfil').value = 'manutencao';
  document.getElementById('usr-senha-info').style.display = 'block';
  openM('m-usr');
}

function abrirEditarUsuario(login) {
  const u = db.usuarios.find(x => x.login === login);
  if (!u) return;
  _usrPopulatePerfil();
  document.getElementById('usr-m-t').textContent = 'Editar Usuário';
  document.getElementById('usr-login-orig').value = u.login;
  document.getElementById('usr-nome').value = u.nome || '';
  document.getElementById('usr-cargo').value = u.cargo || '';
  document.getElementById('usr-login').value = u.login;
  document.getElementById('usr-login').disabled = true; // login é a chave — não muda por aqui
  document.getElementById('usr-perfil').value = u.tipo;
  document.getElementById('usr-senha-info').style.display = 'none';
  openM('m-usr');
}

async function salvarUsuario() {
  const origLogin = v('usr-login-orig');
  const nome   = v('usr-nome').trim();
  const cargo  = v('usr-cargo').trim();
  const login  = v('usr-login').trim().toLowerCase();
  const perfil = v('usr-perfil');
  const isNovo = !origLogin;

  if (!nome || !login) { showAlert('al-usr', 'Nome e Login são obrigatórios.', 'err'); return; }

  if (isNovo) {
    const existe = db.usuarios.some(u => u.login.toLowerCase() === login);
    if (existe) { showAlert('al-usr', 'Já existe um usuário com esse login.', 'err'); return; }

    const res = await apiAppend('usuarios', {
      Login: login, Nome: nome, Cargo: cargo, Tipo_Acesso: perfil,
      Senha_Hash: 'mudar123', Ativo: 'sim', Criado_Em: new Date().toISOString()
    });
    if (!res || !res.ok) { showAlert('al-usr', 'Erro ao criar usuário: ' + (res && res.error || 'sem conexão'), 'err'); return; }
    db.usuarios.push({ login, nome, cargo, tipo: perfil, senha: 'mudar123', ativo: true });
    showAlert('al-usr', 'Usuário criado. Senha inicial: mudar123', 'ok');
  } else {
    const res = await apiUpdate('usuarios', origLogin, 'Login', { Nome: nome, Cargo: cargo, Tipo_Acesso: perfil });
    if (!res || !res.ok) { showAlert('al-usr', 'Erro ao salvar: ' + (res && res.error || 'sem conexão'), 'err'); return; }
    const u = db.usuarios.find(x => x.login === origLogin);
    if (u) { u.nome = nome; u.cargo = cargo; u.tipo = perfil; }
    showAlert('al-usr', 'Usuário atualizado.', 'ok');
  }

  closeM('m-usr');
  renderUsuarios();
}

// ══════════════════════════════════════════════════════════════════════
// RESETAR SENHA / ATIVAR / DESATIVAR
// ══════════════════════════════════════════════════════════════════════
async function resetarSenhaUsuario(login) {
  if (!confirm(`Resetar a senha de "${login}" para mudar123?`)) return;
  const res = await apiUpdate('usuarios', login, 'Login', { Senha_Hash: 'mudar123' });
  if (!res || !res.ok) { showAlert('al-usr', 'Erro ao resetar senha: ' + (res && res.error || 'sem conexão'), 'err'); return; }
  const u = db.usuarios.find(x => x.login === login);
  if (u) u.senha = 'mudar123';
  showAlert('al-usr', `Senha de ${login} resetada para mudar123.`, 'ok');
  renderUsuarios();
}

async function toggleAtivoUsuario(login, ativar) {
  if (!ativar && CU && CU.login === login) {
    showAlert('al-usr', 'Você não pode desativar o próprio usuário.', 'err');
    return;
  }
  const msg = ativar
    ? `Reativar o acesso de "${login}"?`
    : `Desativar o acesso de "${login}"? O usuário não poderá mais entrar no sistema (o cadastro não é excluído).`;
  if (!confirm(msg)) return;

  const res = await apiUpdate('usuarios', login, 'Login', { Ativo: ativar ? 'sim' : 'nao' });
  if (!res || !res.ok) { showAlert('al-usr', 'Erro ao atualizar status: ' + (res && res.error || 'sem conexão'), 'err'); return; }
  const u = db.usuarios.find(x => x.login === login);
  if (u) u.ativo = ativar;
  showAlert('al-usr', ativar ? 'Usuário reativado.' : 'Usuário desativado.', 'ok');
  renderUsuarios();
}
