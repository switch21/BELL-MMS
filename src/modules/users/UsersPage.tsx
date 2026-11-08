import React, { useState } from 'react';
import { Users, Plus, Shield, Check, X, Edit2, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import { UserProfile, UserRole } from '../../types/auth.types';
import {
  DEFAULT_ROLES,
  getStoredData,
  logAuditEvent,
  ROLE_PERMISSIONS_MAP,
  setStoredData,
  STORAGE_KEYS,
} from '../../lib/storage';

export const UsersPage: React.FC = () => {
  const { usersList, refreshUserData, currentUser } = useAuth();
  const [roles] = useState<UserRole[]>(() => getStoredData(STORAGE_KEYS.ROLES, DEFAULT_ROLES));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // Formulaire d'ajout / modification d'utilisateur
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [roleId, setRoleId] = useState(roles[3]?.id || '');
  const [isActive, setIsActive] = useState(true);

  const handleOpenCreateModal = () => {
    setSelectedUser(null);
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('+237 ');
    setJobTitle('');
    setRoleId(roles[3]?.id || '');
    setIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (user: UserProfile) => {
    setSelectedUser(user);
    setFirstName(user.first_name);
    setLastName(user.last_name);
    setEmail(user.email);
    setPhone(user.phone || '');
    setJobTitle(user.job_title || '');
    setRoleId(user.role_id);
    setIsActive(user.is_active);
    setIsModalOpen(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    const currentUsers = getStoredData<UserProfile[]>(STORAGE_KEYS.USERS, []);

    if (selectedUser) {
      // Modification
      const updatedList = currentUsers.map((u) => {
        if (u.id === selectedUser.id) {
          const updated: UserProfile = {
            ...u,
            first_name: firstName,
            last_name: lastName,
            email,
            phone,
            job_title: jobTitle,
            role_id: roleId,
            is_active: isActive,
            updated_at: new Date().toISOString(),
          };
          return updated;
        }
        return u;
      });

      setStoredData(STORAGE_KEYS.USERS, updatedList);

      logAuditEvent({
        user_id: currentUser?.id || null,
        user_email: currentUser?.email || null,
        action: 'UPDATE',
        module: 'USERS',
        entity_name: 'profiles',
        entity_id: selectedUser.id,
        old_values: selectedUser,
        new_values: { firstName, lastName, email, roleId, isActive },
      });
    } else {
      // Création
      const newUser: UserProfile = {
        id: `user-${Date.now()}`,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        job_title: jobTitle,
        role_id: roleId,
        is_active: isActive,
        theme_preference: 'light',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      currentUsers.push(newUser);
      setStoredData(STORAGE_KEYS.USERS, currentUsers);

      logAuditEvent({
        user_id: currentUser?.id || null,
        user_email: currentUser?.email || null,
        action: 'CREATE',
        module: 'USERS',
        entity_name: 'profiles',
        entity_id: newUser.id,
        old_values: null,
        new_values: newUser,
      });
    }

    refreshUserData();
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Gestion des Utilisateurs & Rôles
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            Comptes d'accès, affectations des rôles officiels et matrice des privilèges
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handleOpenCreateModal} className="gap-1.5">
          <Plus className="w-4 h-4" />
          Ajouter un Collaborateur
        </Button>
      </div>

      {/* Tableau des utilisateurs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-executive-emerald" />
            Liste des Collaborateurs & Accès Système
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg/50 text-slate-500 dark:text-executive-darkMuted font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Collaborateur</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Rôle Attribué</th>
                  <th className="py-3 px-4">Fonction</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
                {usersList.map((user) => {
                  const userRole = roles.find((r) => r.id === user.role_id);
                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-executive-darkBg/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {user.first_name} {user.last_name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {user.email}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                        {user.phone || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={userRole?.code === 'directeur_general' ? 'emerald' : userRole?.code === 'super_admin' ? 'neutral' : 'info'}
                        >
                          {userRole?.name || 'Inconnu'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                        {user.job_title || '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {user.is_active ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <Check className="w-3.5 h-3.5" /> Actif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                            <X className="w-3.5 h-3.5" /> Suspendu
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEditModal(user)}
                          className="h-8 w-8 p-0"
                          title="Modifier les droits"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Matrice de contrôle des permissions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-executive-emerald" />
            Vérification des Droits Actifs par Profil Métier
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {roles.map((role) => {
              const perms = ROLE_PERMISSIONS_MAP[role.code] || [];
              return (
                <div
                  key={role.id}
                  className="p-4 rounded-xl border border-slate-200 dark:border-executive-darkBorder bg-slate-50/50 dark:bg-executive-darkBg/50 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-xs text-slate-900 dark:text-white">
                      {role.name}
                    </h3>
                    <Badge variant="emerald" size="sm">
                      {perms.length} droits
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-executive-darkMuted leading-relaxed">
                    {role.description}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Modale d'édition / création d'utilisateur */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedUser ? "Modifier les accès d'un utilisateur" : "Créer un nouveau compte"}
        description="Les modifications de rôles sont automatiquement enregistrées dans le journal d'audit."
      >
        <form onSubmit={handleSaveUser} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Prénom"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <Input
              label="Nom de famille"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          <Input
            label="Adresse Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Téléphone (Cameroun)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+237 6..."
            />
            <Input
              label="Fonction / Poste"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="ex: Géomètre, Comptable..."
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Rôle Officiel Attribué
            </label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full px-3.5 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-sm text-slate-900 dark:text-white"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — ({r.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="is_active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded text-executive-emerald focus:ring-executive-emerald h-4 w-4"
            />
            <label htmlFor="is_active" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Compte actif et autorisé à se connecter
            </label>
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Enregistrer les modifications
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
