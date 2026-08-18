/* ---------- Supabase Auth (E-Mail + Passwort, inkl. Self-Signup) ---------- */
const Auth = {
  _key: "raumplan-auth",
  session() { try { return JSON.parse(localStorage.getItem(this._key)); } catch { return null; } },
  _store(s) { localStorage.setItem(this._key, JSON.stringify(s)); },
  logout() { localStorage.removeItem(this._key); },
  async signup(email, password) {
    const r = await fetch(`${CONFIG.supabase.url}/auth/v1/signup`, {
      method: "POST", headers: { apikey: CONFIG.supabase.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || j.msg || tr("authSignupFailed"));
    if (j.access_token) { this._store({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at }); return true; }
    return false; // Bestätigungsmail nötig (falls "Confirm email" doch aktiv ist)
  },
  async login(email, password) {
    const r = await fetch(`${CONFIG.supabase.url}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: CONFIG.supabase.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || j.msg || tr("authLoginFailed"));
    this._store({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at });
  },
  async refresh() {
    const s = this.session();
    if (!s) throw new Error(tr("noSession"));
    const r = await fetch(`${CONFIG.supabase.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST", headers: { apikey: CONFIG.supabase.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    });
    if (!r.ok) { this.logout(); throw new Error(tr("sessionExpired")); }
    const j = await r.json();
    this._store({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at });
  },
  async accessToken() {
    const s = this.session();
    if (!s) return null;
    if (s.expires_at * 1000 < Date.now() + 60000) await this.refresh().catch(() => {});
    return this.session()?.access_token || null;
  },
  // E-Mail steht nicht in der lokal gespeicherten Session — sie steckt aber
  // schon im Supabase-JWT selbst (email-Claim), kein Extra-Feld/-Request nötig.
  email() {
    const s = this.session();
    if (!s?.access_token) return null;
    try {
      const base64 = s.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(atob(base64).split("").map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""));
      return JSON.parse(json).email || null;
    } catch { return null; }
  },
};

/* ---------- Geteiltes Login/Registrierungs-Dialog (von beiden Seiten genutzt) ---------- */
function mountAuthUI({ buttonId, onChange }) {
  if (!document.getElementById("authDlg")) {
    const div = document.createElement("div");
    div.innerHTML = `
      <dialog id="authDlg" aria-labelledby="authDlgH">
        <h2 id="authDlgH" data-i18n="loginRegisterTitle">${esc(tr("loginRegisterTitle"))}</h2>
        <div class="slot-tabs" style="margin-bottom:var(--sp-3)">
          <button type="button" id="tabLogin" aria-pressed="true" data-i18n="login">${esc(tr("login"))}</button>
          <button type="button" id="tabSignup" aria-pressed="false" data-i18n="register">${esc(tr("register"))}</button>
        </div>
        <p class="hint" id="authHint" data-i18n="authHint">${esc(tr("authHint"))}</p>
        <form method="dialog" id="authForm">
          <div class="frow"><label for="authEmail" data-i18n="email">${esc(tr("email"))}</label><input type="email" id="authEmail" autocomplete="username" required></div>
          <div class="frow"><label for="authPw" data-i18n="password">${esc(tr("password"))}</label><input type="password" id="authPw" autocomplete="current-password" required minlength="6"></div>
          <p class="msg err" id="authErr" role="alert"></p>
          <p class="msg ok" id="authOk" role="status"></p>
          <div class="dactions">
            <button type="button" onclick="this.closest('dialog').close()" data-i18n="cancel">${esc(tr("cancel"))}</button>
            <button type="submit" class="primary" id="authSubmit">${esc(tr("loggingIn"))}</button>
          </div>
        </form>
      </dialog>`;
    document.body.appendChild(div.firstElementChild);
  }
  const authDlg = document.getElementById("authDlg");
  let authMode = "login";
  function setAuthMode(mode) {
    authMode = mode;
    document.getElementById("tabLogin").setAttribute("aria-pressed", String(mode === "login"));
    document.getElementById("tabSignup").setAttribute("aria-pressed", String(mode === "signup"));
    document.getElementById("authSubmit").textContent = mode === "login" ? tr("loggingIn") : tr("register");
    document.getElementById("authEmail").autocomplete = mode === "login" ? "username" : "email";
    document.getElementById("authPw").autocomplete = mode === "login" ? "current-password" : "new-password";
    document.getElementById("authErr").textContent = "";
    document.getElementById("authOk").textContent = "";
  }
  document.getElementById("tabLogin").addEventListener("click", () => setAuthMode("login"));
  document.getElementById("tabSignup").addEventListener("click", () => setAuthMode("signup"));

  const btn = document.getElementById(buttonId);
  let accountMenu = document.getElementById("authAccountMenu");
  if (!accountMenu) {
    accountMenu = document.createElement("div");
    accountMenu.id = "authAccountMenu";
    accountMenu.className = "auth-account-menu";
    accountMenu.setAttribute("role", "menu");
    accountMenu.hidden = true;
    accountMenu.innerHTML = `
      <span class="auth-menu-kicker"></span>
      <strong class="auth-menu-email"></strong>
      <button type="button" class="auth-menu-logout" role="menuitem"></button>`;
    btn.insertAdjacentElement("afterend", accountMenu);
  }
  const logoutBtn = accountMenu.querySelector(".auth-menu-logout");
  const closeAccountMenu = () => {
    accountMenu.hidden = true;
    btn.setAttribute("aria-expanded", "false");
  };
  function initialsOf(email) {
    if (!email) return "?";
    const name = email.split("@")[0];
    const parts = name.split(/[._-]+/).filter(Boolean);
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
  }
  function refresh() {
    const session = Auth.session();
    btn.classList.toggle("has-avatar", !!session);
    btn.classList.toggle("is-signed-out", !session);
    accountMenu.querySelector(".auth-menu-kicker").textContent = tr("signedInAs");
    accountMenu.querySelector(".auth-menu-email").textContent = Auth.email() || "";
    logoutBtn.textContent = tr("logout");
    if (session) {
      btn.innerHTML = `<span class="auth-avatar" aria-hidden="true">${esc(initialsOf(Auth.email()))}<span class="auth-online-dot"></span></span>`;
      btn.title = tr("account");
      btn.setAttribute("aria-label", tr("account"));
      btn.setAttribute("aria-haspopup", "menu");
      btn.setAttribute("aria-expanded", String(!accountMenu.hidden));
    } else {
      closeAccountMenu();
      btn.innerHTML = `<svg class="auth-login-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"></circle><path d="M5.5 19c.8-3.5 3-5.3 6.5-5.3s5.7 1.8 6.5 5.3"></path></svg><span class="auth-login-label">${esc(tr("signInHeader"))}</span>`;
      btn.title = tr("loginRegister");
      btn.setAttribute("aria-label", tr("loginRegister"));
      btn.removeAttribute("aria-haspopup");
      btn.removeAttribute("aria-expanded");
    }
  }
  btn.addEventListener("click", () => {
    if (Auth.session()) {
      accountMenu.hidden = !accountMenu.hidden;
      btn.setAttribute("aria-expanded", String(!accountMenu.hidden));
      return;
    }
    setAuthMode("login");
    document.getElementById("authErr").textContent = "";
    document.getElementById("authOk").textContent = "";
    authDlg.showModal();
  });
  logoutBtn.addEventListener("click", () => {
    Auth.logout();
    closeAccountMenu();
    refresh();
    onChange?.();
  });
  document.addEventListener("click", event => {
    if (!accountMenu.hidden && event.target !== btn && !btn.contains(event.target) && !accountMenu.contains(event.target)) closeAccountMenu();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !accountMenu.hidden) {
      closeAccountMenu();
      btn.focus();
    }
  });
  document.getElementById("authForm").addEventListener("submit", async e => {
    e.preventDefault();
    const email = document.getElementById("authEmail").value.trim();
    const pw = document.getElementById("authPw").value;
    const errEl = document.getElementById("authErr"), okEl = document.getElementById("authOk");
    errEl.textContent = ""; okEl.textContent = "";
    try {
      if (authMode === "login") { await Auth.login(email, pw); authDlg.close(); }
      else {
        const loggedIn = await Auth.signup(email, pw);
        if (loggedIn) authDlg.close();
        else { okEl.textContent = tr("authSignupPending"); return; }
      }
      refresh();
      onChange?.();
    } catch (err) { errEl.textContent = err.message; }
  });
  refresh();
  // Registrierung fürs Sprach-Umschalten: applyLang() ruft alle registrierten
  // Refresh-Funktionen auf, damit Modus-abhängiger Text (Login/Registrieren-
  // Button) nach einem Sprachwechsel korrekt bleibt.
  window.__authUIRefreshers = window.__authUIRefreshers || [];
  window.__authUIRefreshers.push(() => { setAuthMode(authMode); refresh(); });
  return { refresh, requireLogin: () => { setAuthMode("login"); authDlg.showModal(); } };
}

/* ---------- Rollen & Einladungen ---------- */
function roleBadgeHtml(role, status) {
  if (status === "pending") return `<span class="role-badge pending">${esc(tr("invitePending"))}</span>`;
  return `<span class="role-badge ${role}">${esc(role === "admin" ? tr("roleAdmin") : tr("roleEditor"))}</span>`;
}

async function inviteMember(conId, email, role) {
  const token = await Auth.accessToken();
  return supaRpc("invite_member_to_con", { target_con: conId, invite_email: email, invite_role: role }, token);
}
async function acceptInvite(conId) { return supaRpc("accept_invite", { target_con: conId }, await Auth.accessToken()); }
async function declineInvite(conId) { return supaRpc("decline_invite", { target_con: conId }, await Auth.accessToken()); }
async function listMyInvites() {
  const token = await Auth.accessToken();
  if (!token) return [];
  return supaRpc("list_my_invites", {}, token).catch(() => []);
}

// Geteilte "Du hast offene Einladungen"-Anzeige — auf jeder Seite nach Login-Status-
// Änderungen aufrufbar. Rendert nichts, wenn keine offenen Einladungen vorliegen.
async function renderPendingInvites(container, onChange) {
  const invites = await listMyInvites();
  if (!invites.length) { container.innerHTML = ""; container.hidden = true; return; }
  container.hidden = false;
  container.innerHTML = invites.map(inv => `
    <div class="invite-banner" role="status">
      <span>${tr("inviteBanner", { role: `<strong>${esc(inv.role === "admin" ? tr("roleAdmin") : tr("roleEditor"))}</strong>`, con: `<strong>${esc(inv.con_name)}</strong>` })}</span>
      <button type="button" class="primary small acceptInviteBtn" data-con="${esc(inv.con_id)}">${esc(tr("accept"))}</button>
      <button type="button" class="small declineInviteBtn" data-con="${esc(inv.con_id)}">${esc(tr("decline"))}</button>
    </div>`).join("");
  container.querySelectorAll(".acceptInviteBtn").forEach(btn => btn.addEventListener("click", async () => {
    try { await acceptInvite(btn.dataset.con); await renderPendingInvites(container, onChange); onChange?.(); }
    catch (err) { alert(tr("acceptFailed", { err: err.message })); }
  }));
  container.querySelectorAll(".declineInviteBtn").forEach(btn => btn.addEventListener("click", async () => {
    try { await declineInvite(btn.dataset.con); await renderPendingInvites(container, onChange); onChange?.(); }
    catch (err) { alert(tr("declineFailed", { err: err.message })); }
  }));
}
