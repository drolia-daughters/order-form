// ═══════════════════════════════════════════════════════════════
//  SENTIRE LOGIN GATE — included at the top of every page (after the Supabase library).
//  Nobody logged in on this device → sends the person to login.html.
//  Logins live in Supabase (supabase_setup.sql); see LOGIN_SETUP.txt.
// ═══════════════════════════════════════════════════════════════
(function () {
  var URL_ = (window.SENTIRE_SUPABASE_URL || '').trim(), KEY = (window.SENTIRE_SUPABASE_KEY || '').trim();
  var MK = 'sentire_user';                       // remembers who is logged in, so pages open without a wait
  var page = (location.pathname.split('/').pop() || 'index.html');
  var isLogin = page === 'login.html';
  // Unattended rule: a login not used for 4 hours is logged out and the person must log in again.
  // "Used" = a click, key press, touch or scroll on any Command Center page on this device (shared by all its tabs).
  var IDLE_MS = 4 * 60 * 60 * 1000, AK = 'sentire_last_active', lastWrite = 0;
  function lastActive() { try { return +localStorage.getItem(AK) || 0; } catch (e) { return 0; } }
  function idleTooLong() { var t = lastActive(); return !!t && Date.now() - t >= IDLE_MS; }
  function markActive() { lastWrite = Date.now(); try { localStorage.setItem(AK, String(lastWrite)); } catch (e) {} }

  function cached() { try { var u = JSON.parse(localStorage.getItem(MK) || 'null'); return u && u.login_id ? u : null; } catch (e) { return null; } }
  function remember(u) { localStorage.setItem(MK, JSON.stringify(u)); }
  function forget() {                             // also wipes Smart Finance data (Admin / Sub Admin only) from this browser; it comes back from the database at their next login
    localStorage.removeItem(MK);
    try { for (var i = localStorage.length - 1; i >= 0; i--) { var k = localStorage.key(i); if (/^(sfin_|lc_batches$)/.test(k)) localStorage.removeItem(k); } } catch (e) {}
  }
  function hide() { document.documentElement.style.visibility = 'hidden'; }
  function show() { document.documentElement.style.visibility = ''; }
  function toLogin() {
    var next = page + location.search + location.hash, top_ = window;
    try { if (window.top !== window && window.top.location.origin === location.origin) { top_ = window.top; next = ''; } } catch (e) {}
    top_.location.replace('login.html' + (next && page !== 'index.html' ? '?next=' + encodeURIComponent(next) : ''));
  }

  // ─── No "Save password?" pop-up: every password / PIN box becomes a text box that shows dots. ───
  // The browser only offers to save what it sees in a real password box, so it has nothing to offer.
  // (Browsers that cannot show dots in a text box keep the normal password box.)
  var DOTS = !!(window.CSS && CSS.supports && CSS.supports('-webkit-text-security', 'disc'));
  function noSave(root) {
    if (!DOTS || !root || !root.querySelectorAll) return;
    var list = root.matches && root.matches('input[type=password]') ? [root] : root.querySelectorAll('input[type=password]');
    [].forEach.call(list, function (i) {
      i.type = 'text'; i.classList.add('st-pw'); i.setAttribute('autocomplete', 'off');
      i.setAttribute('spellcheck', 'false'); i.setAttribute('autocapitalize', 'off'); i.setAttribute('autocorrect', 'off'); i.setAttribute('data-lpignore', 'true');
    });
  }
  if (DOTS) {
    var pwCss = document.createElement('style');
    pwCss.textContent = 'input.st-pw{-webkit-text-security:disc;text-security:disc;}input.st-pw.st-pw-show{-webkit-text-security:none;text-security:none;}';
    (document.head || document.documentElement).appendChild(pwCss);
    new MutationObserver(function (ms) { ms.forEach(function (m) { [].forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) noSave(n); }); }); })
      .observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', function () { noSave(document); });
  }

  var A = window.SentireAuth = {
    enabled: !!(URL_ && KEY), user: null, client: null, ready: Promise.resolve(null),
    // Call a database function; gives its result, or throws an Error with a plain message.
    rpc: function (fn, args) {
      if (!A.client) return Promise.reject(new Error('Could not reach the login service. Check the internet and try again.'));
      return A.client.rpc(fn, args || {}).then(function (r) {
        if (r.error) { var e = new Error(r.error.message || 'Something went wrong.'); e.code = r.error.code; throw e; }
        return r.data;
      });
    },
    // Call a server function (login lock-out lives there). Gives {status, json}.
    callFn: function (name, body) {
      return fetch(URL_ + '/functions/v1/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY }, body: JSON.stringify(body || {}) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; }); });
    },
    remember: function (u) { remember(u); A.user = u; },
    // The login page calls this at the moment of a fresh login: the 4-hour unattended clock starts now.
    active: markActive,
    // This device was left unattended for 4 hours: log it out and say why on the login page.
    idleOut: function () {
      if (A._kicked) return; A._kicked = true;
      try { localStorage.setItem('sentire_kicked', 'idle'); } catch (e) {}
      hide(); A.logout();
    },
    // Rights: may this person open this app page? The Admin, and a user with no list, may open everything.
    can: function (file) {
      var u = A.user;
      if (!A.enabled || !u || u.role === 'Admin' || !Array.isArray(u.apps)) return true;
      return u.apps.indexOf(file) >= 0;
    },
    // Who may delete / approve. The Admin always may; others only when the Admin ticked it for them (Users page).
    canDelete: function () { var u = A.user; return !A.enabled || !u || u.role === 'Admin' || u.can_delete === true; },
    // Accounts (ACS): may see order rates and bill details. The Admin always may.
    canBill: function () { var u = A.user; return !A.enabled || !u || u.role === 'Admin' || u.can_bill === true; },
    canApprove: function () { var u = A.user; return !A.enabled || !u || u.role === 'Admin' || u.can_approve === true; },
    // Admin or Sub Admin (a user with both the delete and the approve right): may open the Security page and log people out.
    isSecurityAdmin: function (u) { u = u || A.user; return !!u && (u.role === 'Admin' || (u.can_delete === true && u.can_approve === true)); },
    // Main Page: drop the apps this person may not open from its app list.
    filterApps: function (list) { for (var i = list.length - 1; i >= 0; i--) if (!A.can(list[i].file)) list.splice(i, 1); return list; },
    // Check an Admin's login ID + password WITHOUT changing who is logged in here (used for override approvals).
    verifyAdmin: function (loginId, password) {
      if (!A.enabled) return Promise.reject(new Error('Could not reach the login service.'));
      return A.callFn('secure-login', { login_id: String(loginId || '').trim(), password: password, mode: 'verify' }).then(function (r) {
        if (r.status === 429) throw new Error(r.json.message || 'Too many wrong tries. Wait 15 minutes.');
        if (!r.json.ok) throw new Error(r.json.error || 'Wrong Admin login ID or password.');
        return r.json.name || 'Admin';
      });
    },
    // Log out on THIS device only (other devices of the same person stay logged in).
    logout: function () {
      var done = function () { forget(); toLogin(); };
      if (A.client) A.client.auth.signOut({ scope: 'local' }).then(done, done); else done();
    },
    // Someone (Admin / Sub Admin) logged this device out: tell the person once, then go to the login page.
    kicked: function () {
      if (A._kicked) return; A._kicked = true;
      try { localStorage.setItem('sentire_kicked', '1'); } catch (e) {}
      A.logout();
    }
  };
  if (!A.enabled) return;                         // login is switched off (auth_config.js is empty)
  if (window.supabase && window.supabase.createClient) A.client = window.supabase.createClient(URL_, KEY);
  if (isLogin) return;                            // the login page does its own work

  if (idleTooLong()) { hide(); A.idleOut(); return; }   // opened again after 4+ hours unattended (e.g. computer was shut or asleep)
  if (!lastActive()) markActive();

  var u = cached();
  if (u) A.user = u; else hide();

  // The Admin section (Smart Finance, Loadcell Calculator, Cohort, Security) is for the Admin and Sub Admin only.
  // Anyone else who opens one of these pages is sent to the Main Page without seeing anything.
  var ADMIN_ONLY = { 'smart_finance.html': 1, 'loadcell_calculator.html': 1, 'cohort.html': 1, 'security.html': 1, 'migration.html': 1 }, adminPage = !!ADMIN_ONLY[page];
  function goHome() { hide(); var t = window; try { if (window.top !== window && window.top.location.origin === location.origin) t = window.top; } catch (e) {} t.location.replace('index.html'); }
  function wipeAdminData() { try { for (var i = localStorage.length - 1; i >= 0; i--) { var k = localStorage.key(i); if (/^(sfin_|lc_batches$)/.test(k)) localStorage.removeItem(k); } } catch (e) {} }
  if (u && !A.isSecurityAdmin(u)) wipeAdminData();
  if (adminPage && u && !A.isSecurityAdmin(u)) { goHome(); return; }

  // An app page this person has no right to open is covered with a notice.
  var OPEN_TO_ALL = { 'index.html': 1, 'users.html': 1, 'security.html': 1, 'smart_finance.html': 1, 'migration.html': 1, 'loadcell_calculator.html': 1, 'cohort.html': 1, 'backup.html': 1, 'hub.html': 1, '': 1 }, blocked = false;
  function checkRight() {
    if (blocked || OPEN_TO_ALL[page] || A.can(page)) return;
    blocked = true;
    var put = function () {
      var d = document.createElement('div');
      d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0c0f14;color:#e8ecf4;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;';
      d.innerHTML = '<div style="font-size:18px;font-weight:600">You do not have access to this app</div><div style="font-size:13px;color:#7a8599">Ask the Admin if you need it.</div>' +
        (window.top === window ? '<a href="index.html" style="color:#3b82f6;font-size:14px">← Main Page</a>' : '');
      document.body.innerHTML = ''; document.body.appendChild(d);
    };
    if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
  }
  if (u) checkRight();

  if (!A.client) {                                // the Supabase library did not load (no internet)
    if (!u) toLogin();
    A.ready = Promise.resolve(u);
  } else {
    A.ready = A.client.auth.getSession().then(function (r) {
      if (!(r.data && r.data.session)) { forget(); toLogin(); return null; }
      return A.rpc('my_profile').then(function (p) {
        if (!p) { A.kicked(); return null; }       // logged out from the Security page, or login removed by the Admin
        A.remember(p);
        if (!A.isSecurityAdmin(p)) wipeAdminData();
        if (adminPage && !A.isSecurityAdmin(p)) { goHome(); return null; }
        checkRight(); show(); return p;
      });
    }).catch(function () {                        // no internet: carry on if this device was logged in
      if (u) { show(); return u; }
      toLogin(); return null;
    });
  }

  // ─── Every minute: is this login still allowed? The Admin / Sub Admin can log people out from the Security page. ───
  A.ready.then(function (me) {
    if (!me) return;
    // Unattended for 4 hours → log out. Checked every half minute, and before any new activity is counted.
    var idleCheck = function () { if (A._kicked) return true; if (idleTooLong()) { A.idleOut(); return true; } return false; };
    var used = function () { if (Date.now() - lastWrite < 15000) return; if (!idleCheck()) markActive(); };
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove', 'scroll'].forEach(function (ev) { window.addEventListener(ev, used, { capture: true, passive: true }); });
    setInterval(idleCheck, 30000);
    var ping = function () {
      if (idleCheck()) return;
      if (document.hidden) return;              // checked again when the page is looked at
      A.rpc('session_ping').then(function (s) { if (s === 'ended') A.kicked(); }).catch(function () {});
    };
    setInterval(ping, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) ping(); });
    A.client.auth.onAuthStateChange(function (ev) { if (ev === 'SIGNED_OUT' && !A._kicked) { forget(); toLogin(); } });
  });

  // ─── Security alert: the Admin sees a red bar on every page while there are unseen warning events ───
  var ALERT_KINDS = { IP_NOT_ALLOWED: 1, IP_BLOCKED: 1, SUSPICIOUS_DATA: 1, login_fail: 1, LOCKED_OUT: 1, ROLE_CHANGED: 1, login_id_changed: 1, password_changed: 1, rights_changed: 1, user_added: 1, user_removed: 1, DATA_RESTORED: 1 };
  A.ready.then(function (me) {
    if (!me || me.role !== 'Admin' || page === 'security.html') return;
    var go = function () {
      A.client.from('security_log').select('id,at,kind,login_id,ip,detail,country').eq('seen', false).order('at', { ascending: false }).limit(300).then(function (r) {
        if (r.error || !r.data) return;
        var mine = ' by ' + me.login_id, bad = r.data.filter(function (e) {
          if (/login_ok$/.test(e.kind) && e.country && e.country !== 'India' && e.login_id !== me.login_id) return true;   // login from outside India
          if (!ALERT_KINDS[e.kind]) return false;
          if (/^(rights_changed|user_added|user_removed|login_id_changed|password_changed)$/.test(e.kind) && String(e.detail || '').slice(-mine.length) === mine) return false;   // your own changes
          return true;
        });
        if (!bad.length) return;
        var worst = bad.filter(function (e) { return e.kind === 'LOCKED_OUT' || e.kind === 'ROLE_CHANGED'; }).length;
        var fails = bad.filter(function (e) { return e.kind === 'login_fail'; }).length;
        var abroad = bad.filter(function (e) { return /login_ok$/.test(e.kind); }).length;
        var err2 = bad.filter(function (e) { return /^IP_(NOT_ALLOWED|BLOCKED)$/.test(e.kind); }).length;
        var bar = document.createElement('div');
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483000;background:#b91c1c;color:#fff;font:600 13px/1.4 system-ui,sans-serif;padding:8px 14px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.4);cursor:pointer;';
        bar.textContent = '🚨 SECURITY ALERT — ' + bad.length + ' warning' + (bad.length > 1 ? 's' : '') + ': ' + (fails ? fails + ' wrong login attempt' + (fails > 1 ? 's' : '') + '. ' : '') + (abroad ? abroad + ' login' + (abroad > 1 ? 's' : '') + ' from outside India. ' : '') + (err2 ? err2 + ' Error 2 (login refused from an address that is not allowed). ' : '') + (worst ? worst + ' serious (lock-out / role change). ' : '') + 'Click to open the Security page.';
        bar.onclick = function () { location.href = 'security.html'; };
        // 1.16.2: '✓ Mark as seen' right on the alert bar at the top
        var sb = document.createElement('button'); sb.type = 'button'; sb.textContent = '✓ Mark as seen';
        sb.style.cssText = 'margin-left:12px;padding:3px 10px;border:1px solid #fff;border-radius:6px;background:#fff;color:#b91c1c;font:700 12px system-ui,sans-serif;cursor:pointer;';
        sb.onclick = function (ev) { ev.stopPropagation(); sb.disabled = true; A.rpc('admin_security_seen').then(function () { bar.remove(); document.title = document.title.replace(/^🚨 /, ''); }).catch(function (e) { sb.disabled = false; alert(e.message); }); };
        bar.appendChild(sb);
        document.body.appendChild(bar); document.title = '🚨 ' + document.title;
      });
    };
    if (document.readyState !== 'loading') go(); else document.addEventListener('DOMContentLoaded', go);
  });

  // Main Page: show who is logged in, with Users (Admin only) and Log out.
  if (page === 'index.html') {
    var dom = new Promise(function (res) { if (document.readyState !== 'loading') res(); else document.addEventListener('DOMContentLoaded', res); });
    Promise.all([A.ready, dom]).then(function (v) {
      var me = v[0], bar = document.querySelector('.topbar'); if (!me || !bar) return;
      function btn(text, fn) { var b = document.createElement('button'); b.className = 'tb-btn show'; b.textContent = text; b.onclick = fn; bar.appendChild(b); }
      var who = document.createElement('span');
      who.style.cssText = 'font-size:12px;color:var(--text-dim);margin-left:6px;white-space:nowrap;';
      who.textContent = '👤 ' + me.name + (me.role === 'Admin' ? ' (Admin)' : me.can_bill ? ' (Accounts)' : me.can_delete && me.can_approve ? ' (Sub Admin)' : me.can_approve ? ' (Approver)' : '');
      bar.appendChild(who);
      if (me.role === 'Admin') btn('Users', function () { location.href = 'users.html'; });
      if (A.isSecurityAdmin(me)) btn('🛡 Security', function () { location.href = 'security.html'; });
      if (me.role === 'Admin') btn('💾 Backup', function () { location.href = 'backup.html'; });
      btn('Log out', A.logout);
    });
  }
})();
