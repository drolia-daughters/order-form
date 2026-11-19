// Copy of the live Supabase Edge Function "secure-login" (deployed with verify_jwt = false).
// Login with lock-out: 5 wrong passwords per login or 20 per address in 15 minutes -> blocked.
// Every login (Admin and users), wrong password and lock-out is written to public.security_log,
// with the internet address (IP) and its city / region / country.
// Each login also gets a row in public.login_sessions (place, device, last activity) so the
// Admin / Sub Admin can see who is logged in and log them out (supabase_update_7_sessions.sql).
// The internal e-mail of a login is looked up here and never sent to the browser.
//
// Modes:  login (default) · verify (check an Admin password, no login is kept) ·
//         locate (Security page: fill in the place for addresses that have none yet) ·
//         whoami (Security page: the address and place of the computer asking)
// Login rules (supabase_update_8_ip_rules.sql): a blocked address, or a new address while Inter mode
// is on, gets "Error 2"; nobody may be logged in on more than security_settings.max_devices (2) devices.
import { createClient } from "npm:@supabase/supabase-js@2";
const URL_ = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const WINDOW_MIN = 15, MAX_PER_LOGIN = 5, MAX_PER_IP = 20;
const ERR2 = "Error 2: You are not allowed to log in from this place. Contact your Admin.";
type Place = { city: string | null; region: string | null; country: string | null };
const NOWHERE: Place = { city: null, region: null, country: null };

// City / region / country of an internet address. Two free services; never waits more than ~3 s.
async function place(ip: string): Promise<Place> {
  if (!ip || /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd)/i.test(ip)) return NOWHERE;
  const get = async (url: string) => { const r = await fetch(url, { signal: AbortSignal.timeout(2500) }); return r.ok ? await r.json() : null; };
  try { const j = await get(`https://ipwho.is/${encodeURIComponent(ip)}`); if (j && j.success !== false && j.country) return { city: j.city || null, region: j.region || null, country: j.country }; } catch (_) {}
  try { const j = await get(`https://ipapi.co/${encodeURIComponent(ip)}/json/`); if (j && !j.error && j.country_name) return { city: j.city || null, region: j.region || null, country: j.country_name }; } catch (_) {}
  return NOWHERE;
}
async function log(kind: string, login_id: string | null, ip: string, detail: string, p: Place = NOWHERE) {
  try { await admin.from("security_log").insert({ kind, login_id, ip, detail, ...p }); } catch (_) {}
}
// Short description of the browser and computer, e.g. "Chrome on Windows".
function device(ua: string) {
  const b = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const o = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android phone" : /iPhone|iPad/.test(ua) ? "iPhone / iPad" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "unknown computer";
  return `${b} on ${o}`;
}
function sessionIdOf(token: string): string | null {
  try { const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); return p.session_id || null; } catch (_) { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 64);
  const ua = (req.headers.get("user-agent") || "").slice(0, 300);
  let body: any = {}; try { body = await req.json(); } catch (_) { return json({ error: "Bad request." }, 400); }

  if (body.mode === "whoami") return json({ ip, ...(await place(ip)) });

  // ── Security page: look up the place of addresses that have none yet (Admin / Sub Admin only) ──
  if (body.mode === "locate") {
    const { data: who } = await admin.auth.getUser(String(body.token || ""));
    if (!who?.user) return json({ error: "Log in again." }, 401);
    const { data: me } = await admin.from("profiles").select("role, can_delete, can_approve").eq("user_id", who.user.id).maybeSingle();
    if (!me || !(me.role === "Admin" || (me.can_delete && me.can_approve))) return json({ error: "Only the Admin or Sub Admin can do this." }, 403);
    const { data: rows } = await admin.from("security_log").select("ip").is("country", null).not("ip", "is", null).neq("ip", "").order("at", { ascending: false }).limit(500);
    const ips = [...new Set((rows || []).map((r: any) => r.ip))].slice(0, 15);
    let found = 0;
    for (const a of ips) {
      const p = await place(a as string);
      if (!p.country) continue;
      found++;
      await admin.from("security_log").update(p).eq("ip", a).is("country", null);
      await admin.from("login_sessions").update(p).eq("ip", a).is("country", null);
    }
    return json({ ok: true, looked: ips.length, found });
  }

  const id = String(body.login_id ?? "").trim().toLowerCase().slice(0, 40), password = String(body.password ?? "").slice(0, 200);
  const mode = body.mode === "verify" ? "verify" : "login";
  if (!id || !password) return json({ error: "Wrong login ID or password." }, 401);
  const where = place(ip);                       // start the look-up now; it runs while the password is checked
  // Saved / blocked addresses and Inter mode (only for a real login, not for the Admin password check)
  let maxDevices = 2;
  if (mode === "login") {
    const [{ data: set }, { data: rule }] = await Promise.all([
      admin.from("security_settings").select("inter_mode, max_devices").eq("id", 1).maybeSingle(),
      ip ? admin.from("ip_rules").select("status, label").eq("ip", ip).maybeSingle() : Promise.resolve({ data: null as any }),
    ]);
    if (set?.max_devices) maxDevices = set.max_devices;
    const blocked = rule?.status === "blocked", notSaved = !!set?.inter_mode && rule?.status !== "allowed";
    if (blocked || notSaved) {
      await log(blocked ? "IP_BLOCKED" : "IP_NOT_ALLOWED", id, ip,
        blocked ? `Error 2 — login refused: this address is blocked${rule?.label ? " (" + rule.label + ")" : ""}` : "Error 2 — login refused: new address, Inter mode is on", await where);
      return json({ error: "ip", code: 2, message: ERR2 }, 403);
    }
  }
  const since = new Date(Date.now() - WINDOW_MIN * 60000).toISOString();
  const [a, b] = await Promise.all([
    admin.from("security_log").select("id", { count: "exact", head: true }).eq("kind", "login_fail").eq("login_id", id).gt("at", since),
    ip ? admin.from("security_log").select("id", { count: "exact", head: true }).eq("kind", "login_fail").eq("ip", ip).gt("at", since) : Promise.resolve({ count: 0 }),
  ]);
  if ((a.count ?? 0) >= MAX_PER_LOGIN || (b.count ?? 0) >= MAX_PER_IP) {
    const recent = await admin.from("security_log").select("id", { count: "exact", head: true }).eq("kind", "LOCKED_OUT").eq("login_id", id).gt("at", new Date(Date.now() - 60000).toISOString());
    if ((recent.count ?? 0) === 0) await log("LOCKED_OUT", id, ip, `blocked after ${a.count} wrong tries on this login / ${b.count} from this address in ${WINDOW_MIN} min`, await where);
    return json({ error: "locked", message: `Too many wrong tries. Wait ${WINDOW_MIN} minutes and try again.` }, 429);
  }
  const { data: prof } = await admin.from("profiles").select("user_id, role, name, login_id").eq("login_id", id).maybeSingle();
  let email = `none-${id.replace(/[^a-z0-9]/g, "")}@login.sentire.invalid`;
  if (prof) { const { data: u } = await admin.auth.admin.getUserById(prof.user_id); if (u?.user?.email) email = u.user.email; }
  const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session || !prof) { await log("login_fail", id, ip, prof ? (mode === "verify" ? "wrong password (admin check)" : "wrong password") : "unknown login ID", await where); return json({ error: "Wrong login ID or password." }, 401); }
  if (mode === "verify") {
    try { await admin.auth.admin.signOut(data.session.access_token, "local"); } catch (_) {}   // the check must not leave a login open
    if (prof.role !== "Admin") { await log("login_fail", id, ip, "non-admin tried the Admin check", await where); return json({ error: "That login is not an Admin." }, 403); }
    await log("admin_check_ok", id, ip, "Admin password confirmed for an override", await where); return json({ ok: true, name: prof.name });
  }
  const p = await where, dev = device(ua), sid = sessionIdOf(data.session.access_token);
  // Two-device limit: count this person's OTHER logins (the one just made is not counted)
  const { data: others } = await admin.rpc("svc_device_count", { p_user_id: prof.user_id, p_except: sid || crypto.randomUUID() });
  if ((others ?? 0) >= maxDevices) {
    try { await admin.auth.admin.signOut(data.session.access_token, "local"); } catch (_) {}
    await log("DEVICE_LIMIT", id, ip, `refused one more device · ${dev} (already logged in on ${others})`, p);
    return json({ error: "devices", message: `You are already logged in on ${maxDevices} devices. Kindly log out from one device and then try to log in again.` }, 409);
  }
  await log(prof.role === "Admin" ? "admin_login_ok" : "login_ok", id, ip, (prof.role === "Admin" ? "Admin logged in" : "Logged in") + " · " + dev, p);
  try {
    await admin.from("login_sessions").insert({ auth_session_id: sid, user_id: prof.user_id, login_id: prof.login_id, name: prof.name, role: prof.role, ip, device: dev, ...p });
  } catch (_) {}
  return json({ session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } });
});
