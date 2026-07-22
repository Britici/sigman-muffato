// ============================================================
// SIGMAN v2.0 — pages/usuarios.js
// Gestão de Usuários — acesso EXCLUSIVO ao perfil 'admin'
// ============================================================

import { getDB, saveDB } from '../api.js?v=20260718a';
import { CU, ROLES, hashPassword, isAdmin } from '../auth.js?v=20260718a';
import { showToast, openM, closeM } from '../utils.js?v=20260718a';

let _editId = null; // login do usuário em edição (null = criando novo)
let _sortAtivos   = { col: 'nome', dir: 'asc' }; // ordenação do card "Ativos"
let _sortInativos = { col: 'nome', dir: 'asc' }; // ordenação do card "Desativados"

const COLS = [
  { key: 'nome',   label: 'Nome'   },
  { key: 'cargo',  label: 'Cargo'  },
  { key: 'login',  label: 'Login'  },
  { key: 'perfil', label: 'Perfil' },
];

const LADO_LABEL  = { producao: 'Produção', manutencao: 'Manutenção', ambos: 'Ambos' };
// Rótulo de nível depende do lado — mesmo número, cargo diferente.
// Admin NÃO usa este esquema (comando universal, fora da hierarquia).
const NIVEL_LABEL = {
  producao:   { 1: 'Diretoria/Coordenação', 2: 'Supervisão', 3: 'Produção'    },
  manutencao: { 1: 'Diretoria/Coordenador', 2: 'Supervisor', 3: 'Manutenção'  },
  ambos:      { 1: 'Diretoria',             2: 'Diretoria',  3: 'Diretoria'   },
};
const ESCOPO_LABEL = { 1: 'Local', 2: 'Ambiente', 3: 'Sala' };
function _nivelLabel(u) {
  if (!u.nivel) return '—';
  const lado = u.lado || 'ambos';
  return `${u.nivel} · ${NIVEL_LABEL[lado]?.[u.nivel] || ''}`;
}

export function init() {
  render();
}

export function render() {
  const root = document.getElementById('pg-ul');
  const alertBox = document.getElementById('al-usr');
  if (!root) return;

  // ── Trava de segurança: bloqueia mesmo se alguém navegar via hash direto ──
  if (!isAdmin()) {
    root.innerHTML = `
      <div class="alert er show" style="display:block">
        🔒 Acesso restrito. Apenas o perfil <strong>Administrador</strong>
        pode gerenciar usuários.
      </div>`;
    if (alertBox) alertBox.innerHTML = '';
    return;
  }

  const db = getDB();

  const ativos = db.usuarios
    .filter(u => u.ativo !== false)
    .sort((a, b) => {
      const r = _compareUsuarios(a, b, _sortAtivos.col);
      return _sortAtivos.dir === 'asc' ? r : -r;
    });

  const inativos = db.usuarios
    .filter(u => u.ativo === false)
    .sort((a, b) => {
      const r = _compareUsuarios(a, b, _sortInativos.col);
      return _sortInativos.dir === 'asc' ? r : -r;
    });

  root.innerHTML = `
    <div class="card">
      <div class="card-t">Usuários Ativos (${ativos.length})</div>
      <div class="tw">
        <table>
          <thead><tr>
            ${COLS.map(c => _thHtml(c, 'ativos')).join('')}
            <th>Nível / Escopo</th>
            <th style="min-width:170px">Ações</th>
          </tr></thead>
          <tbody>${ativos.map(_rowUsuario).join('')}</tbody>
        </table>
      </div>
    </div>
    <div class="card" style="margin-top:20px">
      <div class="card-t">Usuários Desativados${inativos.length ? ` (${inativos.length})` : ''}</div>
      <div class="tw">
        <table>
          <thead><tr>
            ${COLS.map(c => _thHtml(c, 'inativos')).join('')}
            <th>Nível / Escopo</th>
            <th style="min-width:170px">Ações</th>
          </tr></thead>
          <tbody>${inativos.map(_rowUsuario).join('')}</tbody>
        </table>
      </div>
    </div>`;

  document.getElementById('btn-usr-novo').onclick = () => _openForm(null);

  _bindSortHeaders();

  [...ativos, ...inativos].forEach(u => {
    document.getElementById(`btn-edit-${u.login}`)?.addEventListener('click', () => _openForm(u.login));
    document.getElementById(`btn-reset-${u.login}`)?.addEventListener('click', () => _resetSenha(u.login));
    document.getElementById(`btn-toggle-${u.login}`)?.addEventListener('click', () => _toggleAtivo(u.login));
  });
}

function _thHtml(c, group) {
  const sort = group === 'ativos' ? _sortAtivos : _sortInativos;
  const active = sort.col === c.key ? sort.dir : '';
  return `<th class="sortable ${active}" data-col="${c.key}" data-group="${group}">${c.label}</th>`;
}

function _bindSortHeaders() {
  document.querySelectorAll('#pg-ul th.sortable').forEach(th => {
    th.addEventListener('click', () => _onSort(th.dataset.col, th.dataset.group));
  });
}

function _onSort(col, group) {
  const sort = group === 'ativos' ? _sortAtivos : _sortInativos;
  sort.dir = (sort.col === col && sort.dir === 'asc') ? 'desc' : 'asc';
  sort.col = col;
  render();
}

function _compareUsuarios(a, b, col) {
  switch (col) {
    case 'nome':
      return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
    case 'cargo':
      return (a.cargo || '').localeCompare(b.cargo || '', 'pt-BR', { sensitivity: 'base' });
    case 'login':
      return a.login.localeCompare(b.login, 'pt-BR', { sensitivity: 'base' });
    case 'perfil': {
      const la = ROLES[a.perfil]?.label || a.perfil;
      const lb = ROLES[b.perfil]?.label || b.perfil;
      return la.localeCompare(lb, 'pt-BR', { sensitivity: 'base' });
    }
    default:
      return 0;
  }
}

function _rowUsuario(u) {
  const isSelf = CU?.login === u.login;
  const roleLabel = ROLES[u.perfil]?.label || u.perfil;
  const escopoTxt = (!u.nivel || u.perfil === 'admin') ? '' : `${(u.escopoIds || []).length} ${ESCOPO_LABEL[u.nivel]}(s)`;

  return `
    <tr>
      <td class="td-cap">${_esc(u.nome)}</td>
      <td class="td-cap">${_esc(u.cargo || '—')}</td>
      <td class="td-cap"><code>${_esc(u.login)}</code></td>
      <td class="td-cap">${_esc(roleLabel)}</td>
      <td style="font-size:12px">${_nivelLabel(u)}${escopoTxt ? `<br><span style="color:var(--txt3)">${escopoTxt}</span>` : ''}</td>
      <td>
        <button class="btn btn-sm btn-gh" id="btn-edit-${u.login}" title="Editar">✏️ Editar</button>
        <button class="btn btn-sm btn-gh" id="btn-reset-${u.login}" title="Resetar senha para o login">🔑 Resetar</button>
        ${isSelf
          ? `<span title="Você não pode desativar sua própria conta" style="opacity:.4;font-size:11px;margin-left:6px">(você)</span>`
          : `<button class="btn btn-sm btn-gh" id="btn-toggle-${u.login}" title="${u.ativo !== false ? 'Desativar' : 'Reativar'}">${u.ativo !== false ? '🚫 Desativar' : '✅ Reativar'}</button>`
        }
      </td>
    </tr>`;
}

// ── Modal de criação/edição ────────────────────────────────────
function _openForm(login) {
  _editId = login;
  const db = getDB();
  const u  = login ? db.usuarios.find(x => x.login === login) : null;

  const me = document.getElementById('me-t');
  const mb = document.getElementById('me-b');
  if (me) me.textContent = u ? `Editar Usuário — ${u.nome}` : 'Novo Usuário';

  const perfilOptions = Object.entries(ROLES)
    .map(([key, r]) => `<option value="${key}" ${u?.perfil === key ? 'selected' : ''}>${r.label}</option>`)
    .join('');

  const lado  = u?.lado  || '';
  const nivel = u?.nivel || '';
  const ladoOptions = Object.entries(LADO_LABEL)
    .map(([key, label]) => `<option value="${key}" ${lado === key ? 'selected' : ''}>${label}</option>`).join('');

  if (mb) {
    mb.innerHTML = `
      <div class="fg">
        <label>Nome completo</label>
        <input type="text" id="me-nome" value="${u ? _escAttr(u.nome) : ''}" placeholder="Ex: João da Silva">
      </div>
      <div class="fg" style="margin-top:10px">
        <label>Cargo</label>
        <input type="text" id="me-cargo" value="${u ? _escAttr(u.cargo || '') : ''}" placeholder="Ex: Técnico de Manutenção">
      </div>
      <div class="fg" style="margin-top:10px">
        <label>Login ${u ? '(não editável)' : '(gerado a partir do nome)'}</label>
        <input type="text" id="me-login" value="${u ? _escAttr(u.login) : ''}" placeholder="ex: joao.silva" ${u ? 'disabled' : ''}>
      </div>
      <div class="fg" style="margin-top:10px">
        <label>Perfil de Acesso</label>
        <select id="me-perfil">${perfilOptions}</select>
      </div>
      ${!u ? `
      <div class="alert inf show" style="display:block;margin-top:10px;font-size:12px">
        ℹ️ A senha provisória será igual ao login. O usuário deve trocá-la
        no primeiro acesso, ou o administrador pode resetá-la depois.
      </div>` : ''}
      <div class="fg-row" id="me-hierarquia-wrap" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--bord)">
        <div class="fg"><label>Hierarquia — Lado</label><select id="me-lado"><option value="">— Sem hierarquia —</option>${ladoOptions}</select></div>
        <div class="fg"><label>Nível</label><select id="me-nivel"></select></div>
      </div>
      <div class="fg" id="me-escopo-wrap" style="margin-top:10px">
        <label id="me-escopo-label">Escopo</label>
        <select id="me-escopo" multiple style="min-height:90px"></select>
        <div style="font-size:11px;color:var(--txt3);margin-top:4px">Ctrl/Cmd+clique pra selecionar mais de um.</div>
      </div>
      <div style="font-size:12px;color:var(--txt3);padding:4px 2px;margin-top:6px">
        Define o que fica pré-preenchido na Abertura de O.S. e quem pode
        aprovar OS — não é mais por checkbox em cada Sala (Ativos).
        Perfil Administrador não usa hierarquia (comando universal).
      </div>`;

    // Auto-gera login a partir do nome (só na criação)
    if (!u) {
      document.getElementById('me-nome').addEventListener('input', (e) => {
        const slug = _slugify(e.target.value);
        document.getElementById('me-login').value = slug;
      });
    }

    document.getElementById('me-lado').addEventListener('change', () => _atualizarNivelEscopo(u));
    document.getElementById('me-nivel').addEventListener('change', () => _populateEscopo(u));
    document.getElementById('me-perfil').addEventListener('change', () => _toggleHierarquiaParaAdmin());
    _atualizarNivelEscopo(u);
    _toggleHierarquiaParaAdmin();
  }

  document.getElementById('btn-edit-save').onclick = _saveForm;
  openM('m-edit');
}

// Nível disponível depende do lado. 'ambos' (diretoria) só existe no
// nível 1 — trava ali. Repopula nível e, em seguida, o escopo.
// Perfil 'admin' não usa hierarquia (comando universal) — bloqueado
// por _toggleHierarquiaParaAdmin, chamado separadamente.
function _atualizarNivelEscopo(u) {
  const ladoSel  = document.getElementById('me-lado');
  const nivelSel = document.getElementById('me-nivel');
  const lado = ladoSel.value;
  if (!lado) {
    nivelSel.innerHTML = '<option value="">—</option>';
    nivelSel.disabled = true;
    _populateEscopo(u);
    return;
  }
  nivelSel.disabled = false;
  const niveisDisponiveis = lado === 'ambos' ? [1] : [1, 2, 3];
  nivelSel.innerHTML = niveisDisponiveis
    .map(n => `<option value="${n}">${n} · ${NIVEL_LABEL[lado][n]}</option>`).join('');
  const nivelAtual = u?.lado === lado ? u?.nivel : null;
  if (nivelAtual && niveisDisponiveis.includes(nivelAtual)) nivelSel.value = nivelAtual;
  _populateEscopo(u);
}

// Perfil admin não tem lado/nível/escopo — trava os campos.
function _toggleHierarquiaParaAdmin() {
  const perfil = document.getElementById('me-perfil')?.value;
  const wrap = document.getElementById('me-hierarquia-wrap');
  if (!wrap) return;
  const ehAdmin = perfil === 'admin';
  wrap.style.display = ehAdmin ? 'none' : '';
  if (ehAdmin) {
    sv_select('me-lado', '');
    document.getElementById('me-nivel').innerHTML = '<option value="">—</option>';
    document.getElementById('me-escopo-wrap').style.display = 'none';
  }
}
function sv_select(id, val) { const el = document.getElementById(id); if (el) el.value = val; }

// Escopo: nível 1 = Locais; nível 2 = Ambientes; nível 3 = Salas
// (direto, sem herança — manutentor/produção escolhe a própria sala).
function _populateEscopo(u) {
  const db = getDB();
  const wrap  = document.getElementById('me-escopo-wrap');
  const label = document.getElementById('me-escopo-label');
  const sel   = document.getElementById('me-escopo');
  const nivel = parseInt(document.getElementById('me-nivel').value) || null;
  if (!nivel) { wrap.style.display = 'none'; sel.innerHTML = ''; return; }
  wrap.style.display = '';
  const cur = u?.nivel === nivel ? (u?.escopoIds || []) : [];
  if (nivel === 1) {
    label.textContent = 'Escopo — Local(is)';
    sel.innerHTML = db.locais.filter(l => l.ativo !== false)
      .map(l => `<option value="${l.id}" ${cur.includes(l.id) ? 'selected' : ''}>${l.nome}</option>`).join('');
  } else if (nivel === 2) {
    label.textContent = 'Escopo — Ambiente(s)';
    sel.innerHTML = db.ambientes.filter(a => a.ativo !== false)
      .map(a => `<option value="${a.id}" ${cur.includes(a.id) ? 'selected' : ''}>${a.nome}</option>`).join('');
  } else {
    label.textContent = 'Escopo — Sala(s)';
    sel.innerHTML = db.salas.filter(s => s.ativo !== false)
      .map(s => `<option value="${s.id}" ${cur.includes(s.id) ? 'selected' : ''}>${s.nome}</option>`).join('');
  }
}

async function _saveForm() {
  const nome   = document.getElementById('me-nome')?.value?.trim();
  const cargo  = document.getElementById('me-cargo')?.value?.trim() || '';
  const login  = document.getElementById('me-login')?.value?.trim().toLowerCase();
  const perfil = document.getElementById('me-perfil')?.value;
  const ehAdmin = perfil === 'admin';
  const lado   = ehAdmin ? '' : (document.getElementById('me-lado')?.value || '');
  const nivel  = ehAdmin ? null : (parseInt(document.getElementById('me-nivel')?.value) || null);
  const escopoIds = (!ehAdmin && lado && nivel)
    ? [...document.getElementById('me-escopo').selectedOptions].map(o => o.value)
    : [];

  if (!nome || !login || !perfil) {
    showToast('Preencha todos os campos.', 'er');
    return;
  }
  if (!ROLES[perfil]) {
    showToast('Perfil inválido.', 'er');
    return;
  }
  if (lado && !nivel) {
    showToast('Selecione o nível da hierarquia.', 'er');
    return;
  }

  const db = getDB();

  if (_editId) {
    // ── Edição: nome, cargo e perfil. Login é imutável. ──
    const u = db.usuarios.find(x => x.login === _editId);
    if (!u) { showToast('Usuário não encontrado.', 'er'); return; }

    // Trava extra: impedir que o admin remova o próprio perfil admin
    // (evita lockout — ninguém mais poderia gerenciar usuários)
    if (u.login === CU.login && u.perfil === 'admin' && perfil !== 'admin') {
      const outrosAdmins = db.usuarios.some(x => x.login !== u.login && x.perfil === 'admin' && x.ativo !== false);
      if (!outrosAdmins) {
        showToast('Não é possível remover o último administrador do sistema.', 'er');
        return;
      }
    }

    u.nome   = nome;
    u.cargo  = cargo;
    u.perfil = perfil;
    u.lado = lado || null; u.nivel = nivel; u.escopoIds = escopoIds;
  } else {
    // ── Criação ──
    if (db.usuarios.some(x => x.login === login)) {
      showToast('Já existe um usuário com esse login.', 'er');
      return;
    }
    const senhaHash = await hashPassword(login); // senha provisória = login
    db.usuarios.push({ login, nome, cargo, perfil, senhaHash, ativo: true, primeiroAcesso: true, lado: lado || null, nivel, escopoIds });
  }

  saveDB();
  closeM('m-edit');
  showToast(_editId ? 'Usuário atualizado.' : 'Usuário criado.', 'ok');
  render();
}

// ── Resetar senha para login ───────────────────────────────────
async function _resetSenha(login) {
  if (!confirm(`Resetar a senha de "${login}" para o valor padrão (igual ao login)?`)) return;

  const db = getDB();
  const u  = db.usuarios.find(x => x.login === login);
  if (!u) return;

  u.senhaHash = await hashPassword(login);
  u.primeiroAcesso = true;
  saveDB();
  showToast(`Senha de ${u.nome} resetada para o padrão.`, 'ok');
}

// ── Ativar/Desativar (soft-delete) ──────────────────────────────
function _toggleAtivo(login) {
  const db = getDB();
  const u  = db.usuarios.find(x => x.login === login);
  if (!u) return;

  if (u.login === CU.login) {
    showToast('Você não pode desativar sua própria conta.', 'er');
    return;
  }

  // Trava extra: impedir desativar o último admin ativo
  if (u.perfil === 'admin' && u.ativo !== false) {
    const outrosAdmins = db.usuarios.some(x => x.login !== u.login && x.perfil === 'admin' && x.ativo !== false);
    if (!outrosAdmins) {
      showToast('Não é possível desativar o último administrador do sistema.', 'er');
      return;
    }
  }

  const novoStatus = u.ativo === false;
  if (!novoStatus && !confirm(`Desativar o acesso de "${u.nome}"? Ele(a) não poderá mais fazer login.`)) return;

  u.ativo = novoStatus;
  saveDB();
  showToast(novoStatus ? `${u.nome} reativado.` : `${u.nome} desativado.`, 'ok');
  render();
}

// ── Helpers locais ───────────────────────────────────────────
function _slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.\-]/g, '');
}

function _esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[c]));
}

function _escAttr(str) {
  return _esc(str).replace(/`/g, '&#96;');
}
