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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UpdateUserPayload {
  user_id?: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  job_title?: string | null;
  role_id?: string;
  is_active?: boolean;
  password?: string | null;
}

interface ProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  job_title: string | null;
  role_id: string | null;
  is_active: boolean;
  updated_at: string;
}

interface PermissionGrantRow {
  role_id: string;
  permission: { code: string } | null;
}

const GUARD_FAIL = { error: null as string | null, callerId: null as string | null };

async function checkCallerCanManageUsers(
  admin: SupabaseClient,
  authorization: string
): Promise<{ error: string | null; callerId: string | null }> {
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ...GUARD_FAIL, error: 'Jeton d’authentification manquant.' };

  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller.user) return { ...GUARD_FAIL, error: 'Session invalide ou expirée.' };

  const callerId = caller.user.id;

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role_id, is_active, role:roles(code)')
    .eq('id', callerId)
    .maybeSingle<{
      id: string;
      role_id: string | null;
      is_active: boolean;
      role: { code: string } | null;
    }>();

  if (profileError) return { callerId, error: 'Impossible de vérifier le profil de l’appelant.' };
  if (!profile || !profile.is_active) {
    return { callerId, error: 'Profil appelant introuvable ou inactif.' };
  }
  if (profile.role?.code === 'super_admin') return { callerId, error: null };
  if (!profile.role_id) return { callerId, error: 'Aucun rôle associé à ce profil.' };

  const { data: grants, error: grantsError } = await admin
    .from('role_permissions')
    .select('role_id, permission:permissions(code)')
    .eq('role_id', profile.role_id);

  if (grantsError) return { callerId, error: 'Impossible de vérifier les droits de l’appelant.' };

  const allowed = ((grants ?? []) as PermissionGrantRow[]).some(
    (grant) => grant.permission?.code === 'admin:users:manage'
  );
  return { callerId, error: allowed ? null : 'Permission admin:users:manage requise.' };
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

  const guard = await checkCallerCanManageUsers(admin, req.headers.get('Authorization') ?? '');
  if (guard.error) return json({ error: guard.error }, 403);

  let payload: UpdateUserPayload;
  try {
    payload = (await req.json()) as UpdateUserPayload;
  } catch {
    return json({ error: 'Corps JSON invalide.' }, 400);
  }

  const userId = (payload.user_id ?? '').trim();
  const firstName = (payload.first_name ?? '').trim();
  const lastName = (payload.last_name ?? '').trim();
  const roleId = (payload.role_id ?? '').trim();
  const phone = payload.phone?.trim() || null;
  const jobTitle = payload.job_title?.trim() || null;
  const password = payload.password ?? '';
  const isActive = payload.is_active !== false;

  if (!UUID_PATTERN.test(userId)) return json({ error: 'Identifiant d’utilisateur invalide.' }, 400);
  if (!firstName || !lastName) {
    return json({ error: 'Le prénom et le nom sont obligatoires.' }, 400);
  }
  if (!UUID_PATTERN.test(roleId)) return json({ error: 'Rôle invalide.' }, 400);
  if (password && password.length < 8) {
    return json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' }, 400);
  }
  if (userId === guard.callerId && !isActive) {
    return json({ error: 'Impossible de suspendre votre propre compte.' }, 400);
  }

  const { data: target, error: targetError } = await admin
    .from('profiles')
    .select('id, first_name, last_name, phone, job_title, role_id, is_active, updated_at')
    .eq('id', userId)
    .maybeSingle<ProfileRow>();

  if (targetError) return json({ error: 'Impossible de lire le profil cible.' }, 500);
  if (!target) return json({ error: 'Profil utilisateur introuvable.' }, 404);

  const { data: role, error: roleError } = await admin
    .from('roles')
    .select('id, code')
    .eq('id', roleId)
    .maybeSingle<{ id: string; code: string }>();

  if (roleError) return json({ error: 'Impossible de vérifier le rôle.' }, 500);
  if (!role) return json({ error: 'Rôle introuvable.' }, 400);

  const restoreProfile = async () => {
    const { error: rollbackError } = await admin
      .from('profiles')
      .update({
        first_name: target.first_name,
        last_name: target.last_name,
        phone: target.phone,
        job_title: target.job_title,
        role_id: target.role_id,
        is_active: target.is_active,
        updated_at: target.updated_at,
      })
      .eq('id', userId)
      .select('id');
    return rollbackError ? rollbackError.message : null;
  };

  const { data: updated, error: updateError } = await admin
    .from('profiles')
    .update({
      first_name: firstName,
      last_name: lastName,
      phone,
      job_title: jobTitle,
      role_id: roleId,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id');

  if (updateError) return json({ error: `Modification du profil impossible : ${updateError.message}` }, 500);
  if (!updated || updated.length === 0) {
    return json({ error: 'Aucune ligne modifiée : le profil est introuvable.' }, 404);
  }

  const authActions: string[] = [];

  if (password) {
    const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password });
    if (passwordError) {
      const rollbackMessage = await restoreProfile();
      return json(
        {
          error: `Mot de passe non modifié : ${passwordError.message}`,
          rollback: rollbackMessage ? `Échec du retour arrière : ${rollbackMessage}` : 'profil restauré',
        },
        400
      );
    }
    authActions.push('password');
  }

  const { data: authUser, error: authReadError } = await admin.auth.admin.getUserById(userId);
  if (authReadError || !authUser?.user) {
    const rollbackMessage = await restoreProfile();
    return json(
      {
        error: `État de connexion illisible : ${authReadError?.message ?? 'compte Auth introuvable'}`,
        rollback: rollbackMessage ? `Échec du retour arrière : ${rollbackMessage}` : 'profil restauré',
      },
      500
    );
  }

  const currentlyBanned = Boolean(authUser.user.banned_until);
  const desiredBan = isActive ? (currentlyBanned ? 'none' : null) : (currentlyBanned ? null : 'permanent');

  if (desiredBan) {
    const { error: banError } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: desiredBan,
    });
    if (banError) {
      const rollbackMessage = await restoreProfile();
      return json(
        {
          error: `État de connexion non appliqué : ${banError.message}`,
          rollback: rollbackMessage ? `Échec du retour arrière : ${rollbackMessage}` : 'profil restauré',
        },
        500
      );
    }
    authActions.push(desiredBan === 'permanent' ? 'ban' : 'unban');
  }

  const { data: profile, error: profileReadError } = await admin
    .from('profiles')
    .select('*, role:roles(*)')
    .eq('id', userId)
    .maybeSingle();

  if (profileReadError || !profile) {
    return json({ error: 'Profil modifié mais illisible après la modification.' }, 500);
  }

  return json({ profile, auth_actions: authActions }, 200);
});
