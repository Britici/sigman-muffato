/* ══════════════════════════════════════════════════════════════════
   SIGMAN — USUÁRIOS (aba dedicada, só admin)
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */

function renderUsuarios() {
  const ul = document.getElementById('pg-ul');
  if (!ul) return;
  ul.innerHTML = db.usuarios.length === 0
    ? '<div class="empty"><div class="ei">👥</div><p>Nenhum usuário.</p></div>'
    : db.usuarios.map(u => `
        <div class="edit-row">
          <div>
            <div style="font-size:13px;font-weight:500">${u.nome}</div>
            <div style="font-size:11px;color:var(--txt3)">@${u.login}</div>
          </div>
          ${roleBadge(u.tipo)}
        </div>`).join('');
}