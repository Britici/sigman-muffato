/* ══════════════════════════════════════════════════════════════════
   SIGMAN — INICIALIZAÇÃO - MODO OFFLINE
   Muffato Foods
   ══════════════════════════════════════════════════════════════════ */

// ── TOAST ──
function showToast(msg, type='ok', dur=3500) {
  let cont = document.getElementById('toast-cont');
  if (!cont) { cont = document.createElement('div'); cont.id='toast-cont'; document.body.appendChild(cont); }
  const icons = {ok:'✅', er:'❌', inf:'ℹ️', war:'⚠️'};
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  cont.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(), 300); }, dur);
}

// ── MODO OFFLINE ──
function setOffline(on) {
  const b = document.getElementById('offline-banner');
  if (b) b.classList.toggle('on', on);
}

async function init() {
  loadTheme();
  loadDB();

  // v14: sessão aberta antes da autenticação no servidor (sem token) não vale mais.
  if (localStorage.getItem('sigman_sess') && !getToken()) localStorage.removeItem('sigman_sess');
  const sess = localStorage.getItem('sigman_sess');
  if (sess) {
    try {
      const s = JSON.parse(sess);
      let u = s.user || db.usuarios.find(x => x.login === s.login);

      if (!u && USE_API) {
        try { await apiLoadAll(); } catch(e) {}
        u = db.usuarios.find(x => x.login === s.login);
      }

      if (u) {
        CU = u;
        enterApp();
        document.getElementById('loading-screen').style.display = 'none';
        if (USE_API) {
          apiLoadAll(false, true).then(() => { // não silencioso: loga "✅ Dados carregados do Sheets"
            setOffline(false);
            revalidarSessao();
            if (!CU) return;
            updStats(); updateNavDots();
            const pgAtual = document.querySelector('.pg.on');
            const curPid  = pgAtual ? pgAtual.id.replace('pg-','') : '';
            if (curPid === 'dashboard')   renderDash();
            if (curPid === 'planejadas')  renderPlan();
            if (curPid === 'executadas')  renderExec();
            if (curPid === 'solicitacao') renderSol();
          }).catch(() => setOffline(true));
        }
        return;
      }
    } catch(e) {}
    localStorage.removeItem('sigman_sess');
  }

  // v14: sem token não há readAll na tela de login (os dados carregam após o login,
  // em posLoginCarregar). O ping de syncServerTime já acorda o Apps Script.

  sv('ab-dt',today()); sv('mc-dt',today()); sv('insp-dt',today());
  document.getElementById('loading-screen').style.display='none';
  document.getElementById('login-screen').style.display='flex';
}