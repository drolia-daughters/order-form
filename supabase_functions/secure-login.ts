// Copy of the live Supabase Edge Function "secure-login" (deployed with verify_jwt = false).
// Login with lock-out: 5 wrong passwords per login or 20 per address in 15 minutes -> blocked.
// Every wrong password, lock-out and Admin login is written to public.security_log.
// The internal e-mail of a login is looked up here and never sent to the browser.
import { createClient } from "npm:@supabase/supabase-js@2";
const URL_ = Deno.env.get("SUPABASE_URL")!, SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const WINDOW_MIN = 15, MAX_PER_LOGIN = 5, MAX_PER_IP = 20;
async function log(kind: string, login_id: string | null, ip: string, detail: string) { try { await admin.from("security_log").insert({ kind, login_id, ip, detail }); } catch (_) {} }
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Not allowed." }, 405);
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 64);
  let body: any = {}; try { body = await req.json(); } catch (_) { return json({ error: "Bad request." }, 400); }
  const id = String(body.login_id ?? "").trim().toLowerCase().slice(0, 40), password = String(body.password ?? "").slice(0, 200);
  const mode = body.mode === "verify" ? "verify" : "login";
  if (!id || !password) return json({ error: "Wrong login ID or password." }, 401);
  const since = new Date(Date.now() - WINDOW_MIN * 60000).toISOString();
  const [a, b] = await Promise.all([
    admin.from("security_log").select("id", { count: "exact", head: true }).eq("kind", "login_fail").eq("login_id", id).gt("at", since),
    ip ? admin.from("security_log").select("id", { count: "exact", head: true }).eq("kind", "login_fail").eq("ip", ip).gt("at", since) : Promise.resolve({ count: 0 }),
  ]);
  if ((a.count ?? 0) >= MAX_PER_LOGIN || (b.count ?? 0) >= MAX_PER_IP) {
    const recent = await admin.from("security_log").select("id", { count: "exact", head: true }).eq("kind", "LOCKED_OUT").eq("login_id", id).gt("at", new Date(Date.now() - 60000).toISOString());
    if ((recent.count ?? 0) === 0) await log("LOCKED_OUT", id, ip, `blocked after ${a.count} wrong tries on this login / ${b.count} from this address in ${WINDOW_MIN} min`);
    return json({ error: "locked", message: `Too many wrong tries. Wait ${WINDOW_MIN} minutes and try again.` }, 429);
  }
  const { data: prof } = await admin.from("profiles").select("user_id, role, name, login_id").eq("login_id", id).maybeSingle();
  let email = `none-${id.replace(/[^a-z0-9]/g, "")}@login.sentire.invalid`;
  if (prof) { const { data: u } = await admin.auth.admin.getUserById(prof.user_id); if (u?.user?.email) email = u.user.email; }
  const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session || !prof) { await log("login_fail", id, ip, prof ? (mode === "verify" ? "wrong password (admin check)" : "wrong password") : "unknown login ID"); return json({ error: "Wrong login ID or password." }, 401); }
  if (mode === "verify") {
    if (prof.role !== "Admin") { await log("login_fail", id, ip, "non-admin tried the Admin check"); return json({ error: "That login is not an Admin." }, 403); }
    await log("admin_check_ok", id, ip, "Admin password confirmed for an override"); return json({ ok: true, name: prof.name });
  }
  if (prof.role === "Admin") await log("admin_login_ok", id, ip, "Admin logged in");
  return json({ session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } });
});
