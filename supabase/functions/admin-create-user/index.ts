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

interface CallerGuard {
  error: string | null;
  level: number;
}

// Le niveau vient de roles.access_level (migration 027) : la fonction refuse d'attribuer un
// role plus eleve que le sien, sinon un DG creerait un super_admin et l'escalade serait
// disponible des la creation. Le depot 027 doit donc etre applique AVANT ce redploiement.
async function checkCallerCanManageUsers(
  admin: SupabaseClient,
  authorization: string
): Promise<CallerGuard> {
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: 'Jeton d’authentification manquant.', level: 0 };

  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller.user) return { error: 'Session invalide ou expirée.', level: 0 };

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role_id, is_active, role:roles(code, access_level)')
    .eq('id', caller.user.id)
    .maybeSingle<{
      id: string;
      role_id: string | null;
      is_active: boolean;
      role: { code: string; access_level: number } | null;
    }>();

  if (profileError) return { error: 'Impossible de vérifier le profil de l’appelant.', level: 0 };
  if (!profile || !profile.is_active) return { error: 'Profil appelant introuvable ou inactif.', level: 0 };

  const callerLevel = profile.role?.access_level ?? 0;
  if (profile.role?.code === 'super_admin') return { error: null, level: callerLevel };
  if (!profile.role_id) return { error: 'Aucun rôle associé à ce profil.', level: callerLevel };

  const { data: grants, error: grantsError } = await admin
    .from('role_permissions')
    .select('role_id, permission:permissions(code)')
    .eq('role_id', profile.role_id);

  if (grantsError) return { error: 'Impossible de vérifier les droits de l’appelant.', level: callerLevel };

  const allowed = ((grants ?? []) as PermissionGrantRow[]).some(
    (grant) => grant.permission?.code === 'admin:users:manage'
  );
  return allowed
    ? { error: null, level: callerLevel }
    : { error: 'Permission admin:users:manage requise.', level: callerLevel };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'Configuration serveur incomplète.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const authorization = req.headers.get('Authorization') ?? '';
  const guard = await checkCallerCanManageUsers(admin, authorization);
  if (guard.error) return json({ error: guard.error }, 403);

  // L'insertion du profil se fait sous le jeton de l'appelant : le trigger d'audit prend son
  // acteur dans auth.uid() (003:13), NULL pour la clé service, donc le CREATE du compte
  // n'était jamais attribué. Le WITH CHECK de la politique 027 borne ici le rôle attribué.
  const asCaller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });

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
    .select('id, code, access_level')
    .eq('id', roleId)
    .maybeSingle<{ id: string; code: string; access_level: number }>();

  if (roleError) return json({ error: 'Impossible de vérifier le rôle.' }, 500);
  if (!role) return json({ error: 'Rôle introuvable.' }, 400);
  if ((role.access_level ?? 0) > guard.level) {
    return json({ error: 'Vous ne pouvez pas attribuer un rôle de niveau supérieur au vôtre.' }, 403);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  });

  if (createError || !created.user) {
    return json({ error: createError?.message ?? 'Création du compte impossible.' }, 400);
  }

  const { data: profile, error: profileError } = await asCaller
    .from('profiles')
    .insert({
      id: created.user.id,
      first_name: firstName,
      last_name: lastName,
      email,
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
