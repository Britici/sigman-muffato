/* ═══════════════════════════════════════════════════════════════════════
   SIGMAN — Módulo: Solicitação de Compras
   Muffato Foods | PCM · Compras
   Integração: ComprasSolicitacao.render(el, { cache, user, gsUrl })
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  /* ── CSS ──────────────────────────────────────────────────────────── */
  const CSS_ID = 'css-sigman-compras-sol';
  if (!document.getElementById(CSS_ID)) {
    const s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = `
/* SIGMAN Compras – Solicitação | usa variáveis globais do sigman.css */
.csl-wrap{padding:20px;font-family:inherit}

/* Seções — mesmo padrão de abertura-os */
.csl-section{
  background:var(--surf2);
  border:1px solid var(--bord);
  border-radius:var(--rs);
  padding:18px 20px;
  margin-bottom:14px
}
.csl-section-title{
  display:flex;align-items:center;gap:8px;
  font-size:.72rem;font-variant:small-caps;font-weight:700;
  letter-spacing:.1em;text-transform:uppercase;
  font-variant:small-caps;
  color:var(--txt2);margin-bottom:16px
}
.csl-section-dot{width:3px;height:16px;background:#C41230;border-radius:2px;flex-shrink:0}

/* Grid */
.csl-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:600px){.csl-grid2{grid-template-columns:1fr}}

/* Campos — mesma tipografia e cores do abertura-os */
.csl-field{display:flex;flex-direction:column;gap:5px;margin-bottom:2px}
.csl-field label{
  font-size:.75rem;font-variant:small-caps;font-weight:700;
  color:var(--txt2);
  font-variant:small-caps;
  text-transform:uppercase;letter-spacing:.07em
}
.csl-field .req{color:#C41230}
.csl-field .opt{color:var(--txt3);font-weight:400;text-transform:none;letter-spacing:0}

.csl-field select,
.csl-field input[type=text],
.csl-field input[type=number],
.csl-field textarea{
  background:var(--bg);
  border:1px solid var(--bord);
  color:var(--txt1);
  border-radius:7px;
  padding:9px 12px;
  font-size:.88rem;
  outline:none;
  transition:border-color .2s;
  font-family:inherit;
  resize:vertical
}
.csl-field select:focus,
.csl-field input:focus,
.csl-field textarea:focus{border-color:#C41230;box-shadow:0 0 0 2px rgba(196,18,48,.12)}
.csl-field select:disabled,
.csl-field input[readonly]{color:var(--txt3);cursor:default}
.csl-field select option{background:var(--surf2)}

/* Prioridade */
.pri-1{color:#ef4444!important}
.pri-2{color:#eab308!important}
.pri-3{color:#3b82f6!important}
.pri-4{color:#22c55e!important}

/* Drop zone de fotos */
.csl-foto-drop{
  border:2px dashed var(--bord);
  border-radius:8px;padding:26px;text-align:center;
  color:var(--txt3);cursor:pointer;
  transition:border-color .2s,background .2s;
  font-size:.88rem
}
.csl-foto-drop:hover,.csl-foto-drop.drag-over{
  border-color:#C41230;
  background:rgba(196,18,48,.06);
  color:var(--txt1)
}
.csl-foto-drop svg{display:block;margin:0 auto 8px;opacity:.4}

.csl-foto-preview{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}
.csl-thumb{position:relative;width:88px;height:88px;border-radius:6px;overflow:hidden;
  border:1px solid var(--bord);flex-shrink:0}
.csl-thumb img{width:100%;height:100%;object-fit:cover}
.csl-thumb-del{
  position:absolute;top:3px;right:3px;
  background:rgba(0,0,0,.75);border:none;
  color:#fff;border-radius:50%;width:20px;height:20px;
  font-size:.65rem;cursor:pointer;
  display:flex;align-items:center;justify-content:center
}
.csl-thumb-del:hover{background:#C41230}
.csl-thumb-name{
  position:absolute;bottom:0;left:0;right:0;
  background:rgba(0,0,0,.65);color:var(--txt1);
  font-size:.6rem;padding:2px 4px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis
}

/* Botões — mesma família do abertura-os */
.csl-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:20px;padding-top:16px;border-top:1px solid var(--bord)}
.btn-csl-secondary{
  padding:9px 22px;border-radius:7px;
  border:1px solid var(--bord);
  background:transparent;color:var(--txt2);
  font-size:.88rem;cursor:pointer;transition:background .2s,color .2s
}
.btn-csl-secondary:hover{background:var(--surf2);color:var(--txt1)}
.btn-csl-primary{
  padding:9px 28px;border-radius:7px;border:none;
  background:#C41230;color:#fff;
  font-size:.88rem;font-weight:700;cursor:pointer;
  transition:background .2s,opacity .2s;min-width:180px
}
.btn-csl-primary:hover{background:#a01028}
.btn-csl-primary:disabled{opacity:.5;cursor:not-allowed}

/* Toast */
.csl-toast{
  position:fixed;bottom:24px;right:24px;z-index:9999;
  padding:12px 20px;border-radius:8px;
  font-size:.88rem;font-weight:500;
  opacity:0;pointer-events:none;
  transform:translateY(10px);transition:all .3s;max-width:360px
}
.csl-toast.show{opacity:1;transform:translateY(0)}
.csl-toast.ok  {background:#14532d;color:#86efac;border:1px solid #22c55e}
.csl-toast.warn{background:#713f12;color:#fde68a;border:1px solid #eab308}
.csl-toast.err {background:#7f1d1d;color:#fca5a5;border:1px solid #ef4444}

/* Spinner */
.csl-spinner{
  display:inline-block;width:14px;height:14px;
  border:2px solid rgba(255,255,255,.25);
  border-top-color:#fff;border-radius:50%;
  animation:csl-spin .7s linear infinite;
  vertical-align:middle;margin-right:6px
}
@keyframes csl-spin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(s);
  }

  /* ── CONSTANTS ────────────────────────────────────────────────────── */
  const PRIORIDADES = [
    { val: 1, label: 'Emergencial', desc: 'Processo parado – compra imediata' },
    { val: 2, label: 'Urgente',     desc: 'Risco de parada em até 15 dias'    },
    { val: 3, label: 'Médio',       desc: 'Entrega em até 45 dias'            },
    { val: 4, label: 'Baixo',       desc: 'Entrega em até 90 dias'            }
  ];
  const TIPOS_ACAO = ['Corretiva','Preventiva','Melhoria','Instalação','Reforma','Outros'];

  /* ── STATE ────────────────────────────────────────────────────────── */
  let _fotos = [];

  /* ── PUBLIC ───────────────────────────────────────────────────────── */
  function render(el, opts) {
     _fotos = [];
     const { cache = {}, user = {}, gsUrl } = opts;
     const body = el.querySelector('#pg-compras-solicitacao-body') || el;
     body.innerHTML = _buildHTML(cache, user);
     _bindEvents(body, opts);
   }

  /* ── HTML ─────────────────────────────────────────────────────────── */
  function _buildHTML(cache, user) {
    const salas = (cache.salas || []).filter(s => s.Ativo === 'sim');
    const nomeSolicitante = user.Nome || user.Login || '';

    const opsSalas = salas.map(s =>
      `<option value="${_esc(s.Nome)}">${_esc(s.Nome)}</option>`
    ).join('');

    const opsTipos = TIPOS_ACAO.map(t =>
      `<option value="${t}">${t}</option>`
    ).join('');

    const opsPrioridade = PRIORIDADES.map(p =>
      `<option value="${p.val}" class="pri-${p.val}">${p.val} – ${p.label} · ${p.desc}</option>`
    ).join('');

    return `
<div class="csl-wrap">
  <form id="form-csl" novalidate autocomplete="off">

    <!-- IDENTIFICAÇÃO -->
    <div class="csl-section">
      <div class="csl-section-title">
        <span class="csl-section-dot"></span>Identificação
      </div>
      <div class="csl-grid2">
        <div class="csl-field">
          <label>Sala / Local <span class="req">*</span></label>
          <select id="csl-sala" required>
            <option value="">Selecione...</option>
            ${opsSalas}
          </select>
        </div>
        <div class="csl-field">
          <label>Máquina / Ativo <span class="req">*</span></label>
          <select id="csl-maquina" disabled required>
            <option value="">Selecione a sala</option>
          </select>
        </div>
        <div class="csl-field">
          <label>Tipo de Ação <span class="req">*</span></label>
          <select id="csl-tipo" required>
            <option value="">Selecione...</option>
            ${opsTipos}
          </select>
        </div>
        <div class="csl-field">
          <label>Prioridade <span class="req">*</span></label>
          <select id="csl-prioridade" required>
            <option value="">Selecione...</option>
            ${opsPrioridade}
          </select>
        </div>
      </div>
      <div class="csl-field" style="max-width:340px;margin-top:10px">
        <label>Manutentor Responsável</label>
        <input type="text" id="csl-manutentor" value="${_esc(nomeSolicitante)}" readonly>
      </div>
    </div>

    <!-- ITEM DE COMPRA -->
    <div class="csl-section">
      <div class="csl-section-title">
        <span class="csl-section-dot"></span>Item de Compra
      </div>
      <div class="csl-field">
        <label>Descrição do Item <span class="req">*</span></label>
        <textarea id="csl-descricao" rows="3" required
          placeholder="Descreva o item a ser adquirido (especificações, modelo, referência...)"></textarea>
      </div>
      <div class="csl-grid2" style="margin-top:12px">
        <div class="csl-field">
          <label>Quantidade <span class="req">*</span></label>
          <input type="number" id="csl-qtd" min="0.01" step="any" required placeholder="0">
        </div>
        <div class="csl-field">
          <label>Fornecedor Sugerido <span class="opt">(opcional)</span></label>
          <input type="text" id="csl-fornecedor" placeholder="Nome do fornecedor preferencial...">
        </div>
      </div>
    </div>

    <!-- AÇÃO PREVENTIVA -->
    <div class="csl-section">
      <div class="csl-section-title">
        <span class="csl-section-dot"></span>Ação Preventiva Identificada
        <span class="opt" style="margin-left:6px">(opcional)</span>
      </div>
      <div class="csl-field">
        <textarea id="csl-preventiva" rows="2"
          placeholder="Ação para evitar recorrência desta falha..."></textarea>
      </div>
    </div>

    <!-- FOTOS -->
    <div class="csl-section">
      <div class="csl-section-title">
        <span class="csl-section-dot"></span>Fotos
        <span class="opt" style="margin-left:6px">(opcional)</span>
      </div>
      <div id="csl-drop" class="csl-foto-drop">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        📷 Clique para anexar fotos ou arraste aqui
        <input type="file" id="csl-foto-input" accept="image/*" multiple style="display:none">
      </div>
      <div id="csl-preview" class="csl-foto-preview"></div>
    </div>

    <!-- AÇÕES -->
    <div class="csl-actions">
      <button type="button" id="csl-btn-limpar" class="btn-csl-secondary">Limpar</button>
      <button type="submit" id="csl-btn-submit" class="btn-csl-primary">
        🛒 Enviar Solicitação
      </button>
    </div>

  </form>
  <div id="csl-toast" class="csl-toast"></div>
</div>`;
  }

  /* ── EVENTS ───────────────────────────────────────────────────────── */
  function _bindEvents(el, opts) {
    const { cache = {}, gsUrl } = opts;
    const q = id => el.querySelector(id);

    /* Sala → Máquina cascade */
    q('#csl-sala').addEventListener('change', function () {
      const sel = q('#csl-maquina');
      const maq = (cache.maquinas || []).filter(m => m.Sala === this.value && m.Ativo === 'sim');
      sel.innerHTML = maq.length
        ? `<option value="">Selecione...</option>` +
          maq.map(m => `<option value="${_esc(m.Nome)}">${_esc(m.Nome)}${m.Tag ? ' · ' + m.Tag : ''}</option>`).join('')
        : `<option value="">Nenhum ativo cadastrado</option>`;
      sel.disabled = !maq.length;
    });

    /* Drop zone fotos */
    const drop = q('#csl-drop');
    const finp = q('#csl-foto-input');
    drop.addEventListener('click', () => finp.click());
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('drag-over');
      _addFotos(Array.from(e.dataTransfer.files), el);
    });
    finp.addEventListener('change', () => { _addFotos(Array.from(finp.files), el); finp.value = ''; });

    /* Limpar */
    q('#csl-btn-limpar').addEventListener('click', () => _limpar(el));

    /* Submit */
    q('#form-csl').addEventListener('submit', e => { e.preventDefault(); _submit(el, opts); });
  }

  function _addFotos(files, el) {
    files.forEach(f => {
      if (!f.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = ev => {
        _fotos.push({ name: f.name, mime: f.type, b64: ev.target.result.split(',')[1] });
        _renderPreview(el);
      };
      reader.readAsDataURL(f);
    });
  }

  function _renderPreview(el) {
    const c = el.querySelector('#csl-preview');
    c.innerHTML = _fotos.map((f, i) => `
      <div class="csl-thumb">
        <img src="data:${f.mime};base64,${f.b64}" alt="${_esc(f.name)}">
        <button type="button" class="csl-thumb-del" data-i="${i}" title="Remover">✕</button>
        <span class="csl-thumb-name">${_esc(f.name)}</span>
      </div>`).join('');
    c.querySelectorAll('.csl-thumb-del').forEach(btn =>
      btn.addEventListener('click', () => { _fotos.splice(+btn.dataset.i, 1); _renderPreview(el); })
    );
  }

  function _limpar(el) {
    el.querySelector('#form-csl').reset();
    const sel = el.querySelector('#csl-maquina');
    sel.innerHTML = '<option value="">Selecione a sala</option>';
    sel.disabled = true;
    _fotos = [];
    el.querySelector('#csl-preview').innerHTML = '';
  }

  /* ── SUBMIT ───────────────────────────────────────────────────────── */
  async function _submit(el, opts) {
    const { user = {}, gsUrl } = opts;
    const q   = id => el.querySelector(id);
    const btn = q('#csl-btn-submit');

    const sala       = q('#csl-sala').value;
    const maquina    = q('#csl-maquina').value;
    const tipo       = q('#csl-tipo').value;
    const prioridade = q('#csl-prioridade').value;
    const descricao  = q('#csl-descricao').value.trim();
    const qtd        = q('#csl-qtd').value;

    if (!sala || !maquina || !tipo || !prioridade || !descricao || !qtd) {
      _toast(el, '⚠️ Preencha todos os campos obrigatórios.', 'warn');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<span class="csl-spinner"></span>Enviando...`;

    try {
      /* 1 — Upload fotos */
      const urlsFotos = [];
      const idTemp = 'OC_' + Date.now();
      for (const f of _fotos) {
        const r = await _post(gsUrl, {
          action:   'uploadFoto',
          numero:   idTemp,
          fileName: f.name,
          mimeType: f.mime,
          base64:   f.b64
        });
        if (r.ok && r.fileUrl) urlsFotos.push(r.fileUrl);
      }

      /* 2 — Criar ordem */
      const r = await _post(gsUrl, {
        action: 'addOrdemCompra',
        dados: {
          solicitante:    user.Nome || user.Login || '',
          sala,
          maquina,
          tipoAcao:       tipo,
          prioridade:     Number(prioridade),
          descricao,
          quantidade:     qtd,
          fornecedor:     q('#csl-fornecedor').value.trim(),
          acaoPreventiva: q('#csl-preventiva').value.trim(),
          fotos:          urlsFotos
        }
      });

      if (!r.ok) throw new Error(r.error || 'Erro no servidor');

      _toast(el, `✅ Solicitação criada com sucesso! ID: ${r.id}`, 'ok');
      setTimeout(() => _limpar(el), 2000);

    } catch (err) {
      _toast(el, '❌ ' + err.message, 'err');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '🛒 Enviar Solicitação';
    }
  }

  /* ── UTILS ────────────────────────────────────────────────────────── */
  async function _post(url, payload) {
    const r = await fetch(url, { method: 'POST', body: JSON.stringify(payload) });
    return r.json();
  }

  function _toast(el, msg, type) {
    const t = el.querySelector('#csl-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `csl-toast ${type} show`;
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove('show'), 5000);
  }

  function _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── EXPORT ───────────────────────────────────────────────────────── */
  global.ComprasSolicitacao = { render };

})(window);
