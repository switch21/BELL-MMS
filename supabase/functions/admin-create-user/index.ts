import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CreateUserPayload {
  email?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  job_title?: string | null;
  role_id?: string;
  is_active?: boolean;
}

interface PermissionGrantRow {
  role_id: string;
  permission: { code: string } | null;
}

async function checkCallerCanManageUsers(
  admin: SupabaseClient,
  authorization: string
): Promise<string | null> {
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) return 'Jeton d’authentification manquant.';

  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller.user) return 'Session invalide ou expirée.';

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role_id, is_active, role:roles(code)')
    .eq('id', caller.user.id)
    .maybeSingle<{
      id: string;
      role_id: string | null;
      is_active: boolean;
      role: { code: string } | null;
    }>();

  if (profileError) return 'Impossible de vérifier le profil de l’appelant.';
  if (!profile || !profile.is_active) return 'Profil appelant introuvable ou inactif.';
  if (profile.role?.code === 'super_admin') return null;
  if (!profile.role_id) return 'Aucun rôle associé à ce profil.';

  const { data: grants, error: grantsError } = await admin
    .from('role_permissions')
    .select('role_id, permission:permissions(code)')
    .eq('role_id', profile.role_id);

  if (grantsError) return 'Impossible de vérifier les droits de l’appelant.';

  const allowed = ((grants ?? []) as PermissionGrantRow[]).some(
    (grant) => grant.permission?.code === 'admin:users:manage'
  );
  return allowed ? null : 'Permission admin:users:manage requise.';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Configuration serveur incomplète.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const authError = await checkCallerCanManageUsers(admin, req.headers.get('Authorization') ?? '');
  if (authError) return json({ error: authError }, 403);

  let payload: CreateUserPayload;
  try {
    payload = (await req.json()) as CreateUserPayload;
  } catch {
    return json({ error: 'Corps JSON invalide.' }, 400);
  }

  const email = (payload.email ?? '').trim().toLowerCase();
  const password = payload.password ?? '';
  const firstName = (payload.first_name ?? '').trim();
  const lastName = (payload.last_name ?? '').trim();
  const roleId = (payload.role_id ?? '').trim();
  const phone = payload.phone?.trim() || null;
  const jobTitle = payload.job_title?.trim() || null;
  const isActive = payload.is_active !== false;

  if (!EMAIL_PATTERN.test(email)) return json({ error: 'Adresse email invalide.' }, 400);
  if (password.length < 8) {
    return json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' }, 400);
  }
  if (!firstName || !lastName) {
    return json({ error: 'Le prénom et le nom sont obligatoires.' }, 400);
  }
  if (!UUID_PATTERN.test(roleId)) return json({ error: 'Rôle invalide.' }, 400);

  const { data: role, error: roleError } = await admin
    .from('roles')
    .select('id, code')
    .eq('id', roleId)
    .maybeSingle<{ id: string; code: string }>();

  if (roleError) return json({ error: 'Impossible de vérifier le rôle.' }, 500);
  if (!role) return json({ error: 'Rôle introuvable.' }, 400);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  });

  if (createError || !created.user) {
    return json({ error: createError?.message ?? 'Création du compte impossible.' }, 400);
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .insert({
      id: created.user.id,
      first_name: firstName,
      last_name: lastName,
      phone,
      job_title: jobTitle,
      role_id: roleId,
      is_active: isActive,
      theme_preference: 'system',
    })
    .select('*, role:roles(*)')
    .single();

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json({ error: `Profil non créé : ${profileError.message}` }, 500);
  }

  return json({ profile }, 200);
});
