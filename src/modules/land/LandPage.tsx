import React, { useState } from 'react';
import {
  MapPin,
  Plus,
  Layers,
  Building,
  ShieldAlert,
  Search,
  Filter,
  CheckCircle,
  FileText,
  AlertOctagon,
  Eye,
  Edit,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../context/AuthContext';
import {
  LandProperty,
  Plot,
  PlotStatus,
  Subdivision,
  Block,
  PlotStatusHistory,
} from '../../types/land.types';
import {
  getStoredData,
  INITIAL_BLOCKS,
  INITIAL_LAND_PROPERTIES,
  INITIAL_PLOTS,
  INITIAL_SUBDIVISIONS,
  logAuditEvent,
  setStoredData,
  STORAGE_KEYS,
} from '../../lib/storage';
import { formatCurrency } from '../../lib/utils';
import { InteractiveLandMap } from '../../components/map/InteractiveLandMap';

export const LandPage: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();

  const [landProperties, setLandProperties] = useState<LandProperty[]>(() =>
    getStoredData<LandProperty[]>(STORAGE_KEYS.LAND_PROPERTIES, INITIAL_LAND_PROPERTIES)
  );
  const [subdivisions] = useState<Subdivision[]>(() =>
    getStoredData<Subdivision[]>(STORAGE_KEYS.SUBDIVISIONS, INITIAL_SUBDIVISIONS)
  );
  const [blocks] = useState<Block[]>(() =>
    getStoredData<Block[]>(STORAGE_KEYS.BLOCKS, INITIAL_BLOCKS)
  );
  const [plots, setPlots] = useState<Plot[]>(() =>
    getStoredData<Plot[]>(STORAGE_KEYS.PLOTS, INITIAL_PLOTS)
  );

  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(
    landProperties[0]?.id || ''
  );
  const [selectedPlot, setSelectedPlot] = useState<Plot | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modales
  const [isPlotModalOpen, setIsPlotModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isLandModalOpen, setIsLandModalOpen] = useState(false);

  // Formulaire Nouvelle Parcelle
  const [newPlotNumber, setNewPlotNumber] = useState('');
  const [newPlotBlockId, setNewPlotBlockId] = useState(blocks[0]?.id || '');
  const [newPlotArea, setNewPlotArea] = useState<number>(500);
  const [newPlotFacade, setNewPlotFacade] = useState<number>(20);
  const [newPlotDepth, setNewPlotDepth] = useState<number>(25);
  const [newPlotPriceSqm, setNewPlotPriceSqm] = useState<number>(30000);
  const [newPlotNotes, setNewPlotNotes] = useState('');

  // Formulaire Changement de Statut
  const [targetStatus, setTargetStatus] = useState<PlotStatus>('disponible');
  const [statusChangeReason, setStatusChangeReason] = useState('');

  // Formulaire Nouveau Terrain
  const [newLandRef, setNewLandRef] = useState(`TER-2026-${String(landProperties.length + 1).padStart(3, '0')}`);
  const [newLandDesignation, setNewLandDesignation] = useState('');
  const [newLandOwnership, setNewLandOwnership] = useState<'entreprise' | 'tiers_mandat'>('entreprise');
  const [newLandTitle, setNewLandTitle] = useState('TF /Wouri');
  const [newLandLocality, setNewLandLocality] = useState('Douala');
  const [newLandArea, setNewLandArea] = useState<number>(30000);
  const [newLandPrice, setNewLandPrice] = useState<number>(100000000);

  const canManageLand = hasPermission('land:write');
  const canChangeStatus = hasPermission('land:status:change') || canManageLand;

  const currentProperty = landProperties.find((p) => p.id === selectedPropertyId);
  const currentSubdivision = subdivisions.find((s) => s.land_property_id === selectedPropertyId);
  const propertyPlots = plots.filter((p) =>
    currentSubdivision ? p.subdivision_id === currentSubdivision.id : true
  );

  const filteredPlots = propertyPlots.filter((p) => {
    const matchesFilter = statusFilter === 'all' || p.status === statusFilter;
    const matchesSearch =
      p.plot_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.notes && p.notes.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  // Calcul des statistiques du terrain sélectionné
  const plotStats = {
    total: propertyPlots.length,
    disponible: propertyPlots.filter((p) => p.status === 'disponible').length,
    reservee: propertyPlots.filter((p) => p.status === 'reservee').length,
    vendue: propertyPlots.filter((p) => p.status === 'vendue').length,
    bloquee: propertyPlots.filter((p) => ['bloquee', 'litige', 'indisponible'].includes(p.status)).length,
  };

  // Création d'une nouvelle parcelle
  const handleSavePlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSubdivision) return;

    // Vérification anti-doublon de numéro de lot
    const exists = plots.some(
      (p) =>
        p.subdivision_id === currentSubdivision.id &&
        p.plot_number.trim().toLowerCase() === newPlotNumber.trim().toLowerCase()
    );

    if (exists) {
      alert(`Le lot "${newPlotNumber}" existe déjà dans ce lotissement. Double attribution impossible.`);
      return;
    }

    // Coordonnées approximées autour du centre du terrain
    const latOffset = (Math.random() - 0.5) * 0.003;
    const lngOffset = (Math.random() - 0.5) * 0.003;

    const newPlot: Plot = {
      id: `plot-${Date.now()}`,
      subdivision_id: currentSubdivision.id,
      block_id: newPlotBlockId,
      plot_number: newPlotNumber,
      area_sqm: newPlotArea,
      facade_m: newPlotFacade,
      depth_m: newPlotDepth,
      price_per_sqm: newPlotPriceSqm,
      total_price: newPlotArea * newPlotPriceSqm,
      status: 'disponible',
      latitude: (currentProperty?.latitude || 4.0152) + latOffset,
      longitude: (currentProperty?.longitude || 9.8241) + lngOffset,
      notes: newPlotNotes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updatedPlots = [...plots, newPlot];
    setPlots(updatedPlots);
    setStoredData(STORAGE_KEYS.PLOTS, updatedPlots);

    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'CREATE',
      module: 'LAND',
      entity_name: 'plots',
      entity_id: newPlot.id,
      old_values: null,
      new_values: newPlot,
    });

    setIsPlotModalOpen(false);
    setNewPlotNumber('');
    setNewPlotNotes('');
  };

  // Changement de statut sécurisé (avec enregistrement du motif et traçabilité)
  const handleStatusChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlot || !statusChangeReason.trim()) {
      alert('Veuillez renseigner un motif obligatoire pour ce changement de statut.');
      return;
    }

    const oldStatus = selectedPlot.status;

    // Règle de sécurité : interdiction de remettre en "disponible" une parcelle vendue sans procédure formelle
    if (oldStatus === 'vendue' && targetStatus === 'disponible') {
      const confirmReversal = window.confirm(
        'ALERTE DE SÉCURITÉ FONCIÈRE : Cette parcelle est enregistrée comme VENDUE. La remettre en vente peut provoquer un contentieux grave ou une double vente. Confirmez-vous cette opération exceptionnelle ?'
      );
      if (!confirmReversal) return;
    }

    const updatedPlots = plots.map((p) => {
      if (p.id === selectedPlot.id) {
        return {
          ...p,
          status: targetStatus,
          updated_at: new Date().toISOString(),
        };
      }
      return p;
    });

    setPlots(updatedPlots);
    setStoredData(STORAGE_KEYS.PLOTS, updatedPlots);

    // Enregistrement dans l'historique des statuts de parcelles
    const statusHistory = getStoredData<PlotStatusHistory[]>(STORAGE_KEYS.PLOT_STATUS_HISTORY, []);
    const historyEntry: PlotStatusHistory = {
      id: `hist-${Date.now()}`,
      plot_id: selectedPlot.id,
      old_status: oldStatus,
      new_status: targetStatus,
      reason: statusChangeReason,
      changed_by: currentUser?.id,
      changed_at: new Date().toISOString(),
    };
    statusHistory.unshift(historyEntry);
    setStoredData(STORAGE_KEYS.PLOT_STATUS_HISTORY, statusHistory);

    // Audit Log de sécurité
    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'UPDATE',
      module: 'LAND',
      entity_name: 'plots:status',
      entity_id: selectedPlot.id,
      old_values: { plot_number: selectedPlot.plot_number, status: oldStatus },
      new_values: { status: targetStatus, reason: statusChangeReason },
    });

    setIsStatusModalOpen(false);
    setSelectedPlot(null);
    setStatusChangeReason('');
  };

  // Création d'un nouveau domaine foncier
  const handleSaveLand = (e: React.FormEvent) => {
    e.preventDefault();
    const newProperty: LandProperty = {
      id: `land-${Date.now()}`,
      reference: newLandRef,
      designation: newLandDesignation,
      ownership_type: newLandOwnership,
      land_title_number: newLandTitle,
      region: 'Littoral',
      division: 'Wouri',
      subdivision_name: 'Douala',
      locality: newLandLocality,
      total_area_sqm: newLandArea,
      purchase_price: newLandPrice,
      status: 'actif',
      latitude: 4.0511 + (Math.random() - 0.5) * 0.05,
      longitude: 9.7679 + (Math.random() - 0.5) * 0.05,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updated = [...landProperties, newProperty];
    setLandProperties(updated);
    setStoredData(STORAGE_KEYS.LAND_PROPERTIES, updated);
    setSelectedPropertyId(newProperty.id);

    logAuditEvent({
      user_id: currentUser?.id || null,
      user_email: currentUser?.email || null,
      action: 'CREATE',
      module: 'LAND',
      entity_name: 'land_properties',
      entity_id: newProperty.id,
      old_values: null,
      new_values: newProperty,
    });

    setIsLandModalOpen(false);
  };

  const getStatusBadge = (status: PlotStatus) => {
    switch (status) {
      case 'disponible':
        return <Badge variant="success">Disponible</Badge>;
      case 'reservee':
        return <Badge variant="warning">Réservée</Badge>;
      case 'vendue':
        return <Badge variant="neutral">Vendue</Badge>;
      case 'bloquee':
        return <Badge variant="danger">Bloquée</Badge>;
      case 'litige':
        return <Badge variant="danger">Litige</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête de la page */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            Gestion du Patrimoine Foncier & Parcelles
          </h1>
          <p className="text-xs text-slate-500 dark:text-executive-darkMuted">
            Domaines fonciers, lotissements approuvés, parcelles et cartographie Leaflet (Douala & environs)
          </p>
        </div>
        {canManageLand && (
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => setIsPlotModalOpen(true)} className="gap-1.5">
              <Plus className="w-4 h-4" />
              Créer une Parcelle (Lot)
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsLandModalOpen(true)} className="gap-1.5">
              <Building className="w-4 h-4" />
              Nouveau Domaine Foncier
            </Button>
          </div>
        )}
      </div>

      {/* Sélecteur de Domaine Foncier */}
      <div className="flex flex-wrap gap-2">
        {landProperties.map((land) => (
          <button
            key={land.id}
            onClick={() => setSelectedPropertyId(land.id)}
            className={`px-4 py-2.5 rounded-xl text-xs font-semibold text-left transition-all border flex items-center gap-2.5 ${
              selectedPropertyId === land.id
                ? 'bg-executive-dark text-white border-executive-dark shadow-sm'
                : 'bg-white dark:bg-executive-darkSurface text-slate-700 dark:text-slate-300 border-slate-200 dark:border-executive-darkBorder hover:bg-slate-50'
            }`}
          >
            <MapPin className="w-4 h-4 shrink-0 text-executive-emerald" />
            <div>
              <p className="truncate font-bold">{land.designation}</p>
              <div className="text-[10px] opacity-80 flex items-center gap-2">
                <span>Réf: {land.reference}</span>
                <span>•</span>
                <span>{land.ownership_type === 'entreprise' ? 'Propriété Entreprise' : 'Mandat Tiers'}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Fiche d'identité du Terrain Sélectionné */}
      {currentProperty && (
        <Card className="border-l-4 border-l-executive-emerald">
          <CardContent className="p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {currentProperty.designation}
                  </h2>
                  <Badge variant={currentProperty.ownership_type === 'entreprise' ? 'emerald' : 'info'}>
                    {currentProperty.ownership_type === 'entreprise' ? 'Pleine Propriété BELL' : 'Mandat Tiers'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Localisation : <strong>{currentProperty.locality}</strong> ({currentProperty.subdivision_name}, {currentProperty.division}) | Titre Foncier : <strong>{currentProperty.land_title_number || 'Non immatriculé'}</strong>
                </p>
                {currentProperty.mandate_details && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mt-0.5">
                    Conditions Mandat : Commission de {currentProperty.mandate_details.commission_percentage}% | Prix de référence : {formatCurrency(currentProperty.mandate_details.reference_price_sqm)}/m²
                  </p>
                )}
              </div>
              <div className="flex items-center gap-4 text-right">
                <div>
                  <span className="text-[11px] text-slate-400 uppercase font-semibold">Superficie Totale</span>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {currentProperty.total_area_sqm.toLocaleString('fr-FR')} m²
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cartes KPI du Lotissement */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-white dark:bg-executive-darkSurface border border-slate-200 dark:border-executive-darkBorder">
          <span className="text-[11px] font-semibold text-slate-400 uppercase">Parcelles Totales</span>
          <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{plotStats.total} lots</p>
        </div>
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
          <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400 uppercase">Disponibles</span>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{plotStats.disponible} lots</p>
        </div>
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
          <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-400 uppercase">Réservées</span>
          <p className="text-xl font-bold text-amber-700 dark:text-amber-300 mt-1">{plotStats.reservee} lots</p>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-100 dark:bg-executive-darkBg border border-slate-200 dark:border-executive-darkBorder">
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase">Vendues</span>
          <p className="text-xl font-bold text-slate-800 dark:text-slate-200 mt-1">{plotStats.vendue} lots</p>
        </div>
      </div>

      {/* Carte Interactive Leaflet */}
      <Card>
        <CardHeader className="py-3 px-5">
          <CardTitle className="text-xs uppercase tracking-wider text-slate-700 dark:text-executive-darkText flex items-center justify-between w-full">
            <span className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-executive-emerald" />
              Cartographie Interactive des Parcelles (Leaflet & OpenStreetMap)
            </span>
            <span className="text-[11px] font-normal text-slate-500">
              Cliquez sur un marqueur pour inspecter la parcelle
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <InteractiveLandMap
            landProperty={currentProperty}
            plots={propertyPlots}
            selectedPlot={selectedPlot}
            onSelectPlot={(p) => setSelectedPlot(p)}
            statusFilter={statusFilter}
          />
        </CardContent>
      </Card>

      {/* Tableau des Parcelles & Filtres */}
      <Card>
        <CardHeader className="py-4 px-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-executive-emerald" />
              Inventaire des Parcelles & Prix au m² ({filteredPlots.length})
            </CardTitle>

            <div className="flex flex-wrap items-center gap-2">
              {/* Filtre par statut */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-executive-darkBg border border-slate-200 dark:border-executive-darkBorder rounded-lg text-xs font-semibold"
              >
                <option value="all">Tous les statuts</option>
                <option value="disponible">Disponibles uniquement</option>
                <option value="reservee">Réservées uniquement</option>
                <option value="vendue">Vendues uniquement</option>
                <option value="bloquee">Bloquées uniquement</option>
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher lot..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-executive-darkBg border border-slate-200 dark:border-executive-darkBorder rounded-lg text-xs outline-none focus:ring-2 focus:ring-executive-emerald w-36 sm:w-48"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-executive-darkBorder bg-slate-50 dark:bg-executive-darkBg/50 text-slate-500 font-semibold uppercase text-[11px]">
                  <th className="py-3 px-4">Numéro de Lot</th>
                  <th className="py-3 px-4">Bloc</th>
                  <th className="py-3 px-4">Superficie</th>
                  <th className="py-3 px-4">Dimensions</th>
                  <th className="py-3 px-4">Prix / m²</th>
                  <th className="py-3 px-4">Prix Total (FCFA)</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-executive-darkBorder">
                {filteredPlots.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Aucune parcelle ne correspond aux filtres.
                    </td>
                  </tr>
                ) : (
                  filteredPlots.map((plot) => {
                    const block = blocks.find((b) => b.id === plot.block_id);
                    return (
                      <tr
                        key={plot.id}
                        className={`hover:bg-slate-50/80 dark:hover:bg-executive-darkBg/40 transition-colors ${
                          selectedPlot?.id === plot.id ? 'bg-executive-emerald/10' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                          {plot.plot_number}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {block?.name || 'Général'}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                          {plot.area_sqm} m²
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                          {plot.facade_m ? `${plot.facade_m}m x ${plot.depth_m}m` : '-'}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {formatCurrency(plot.price_per_sqm)}
                        </td>
                        <td className="py-3 px-4 font-bold font-mono text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(plot.total_price)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {getStatusBadge(plot.status)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canChangeStatus && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedPlot(plot);
                                  setTargetStatus(plot.status);
                                  setIsStatusModalOpen(true);
                                }}
                                className="text-[11px] py-1 px-2 h-7"
                                title="Modifier le statut de la parcelle"
                              >
                                Modifier Statut
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modale d'ajout d'une parcelle */}
      <Modal
        isOpen={isPlotModalOpen}
        onClose={() => setIsPlotModalOpen(false)}
        title="Créer une Nouvelle Parcelle (Lot)"
        description={`Ajout au lotissement : ${currentSubdivision?.name || 'Courant'}`}
      >
        <form onSubmit={handleSavePlot} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Numéro de Lot"
              required
              value={newPlotNumber}
              onChange={(e) => setNewPlotNumber(e.target.value)}
              placeholder="ex: Lot A-08"
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Bloc de Rapprochement
              </label>
              <select
                value={newPlotBlockId}
                onChange={(e) => setNewPlotBlockId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
              >
                {blocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Superficie (m²)"
              type="number"
              required
              min="100"
              value={newPlotArea}
              onChange={(e) => setNewPlotArea(parseFloat(e.target.value) || 0)}
            />
            <Input
              label="Façade (m)"
              type="number"
              value={newPlotFacade}
              onChange={(e) => setNewPlotFacade(parseFloat(e.target.value) || 0)}
            />
            <Input
              label="Profondeur (m)"
              type="number"
              value={newPlotDepth}
              onChange={(e) => setNewPlotDepth(parseFloat(e.target.value) || 0)}
            />
          </div>

          <Input
            label="Prix au m² (FCFA)"
            type="number"
            required
            step="1000"
            value={newPlotPriceSqm}
            onChange={(e) => setNewPlotPriceSqm(parseFloat(e.target.value) || 0)}
            helperText={`Prix total calculé : ${formatCurrency(newPlotArea * newPlotPriceSqm)}`}
          />

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Notes & Caractéristiques
            </label>
            <textarea
              rows={2}
              value={newPlotNotes}
              onChange={(e) => setNewPlotNotes(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
              placeholder="ex: Parcelle d'angle, vue dégagée, viabilisée..."
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsPlotModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Enregistrer la Parcelle
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale de Changement de Statut avec Motif Obligatoire (Sécurité Anti-Double Vente) */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title={`Changer le Statut de la Parcelle : ${selectedPlot?.plot_number}`}
        description="Tout changement de statut foncier est vérifié et consigné dans l'historique d'audit."
      >
        <form onSubmit={handleStatusChange} className="space-y-4">
          <div className="p-3 bg-slate-50 dark:bg-executive-darkBg rounded-lg border border-slate-200 dark:border-executive-darkBorder text-xs space-y-1">
            <p>Superficie : <strong>{selectedPlot?.area_sqm} m²</strong></p>
            <p>Prix Total : <strong>{formatCurrency(selectedPlot?.total_price)}</strong></p>
            <p>Statut Actuel : <strong>{selectedPlot?.status}</strong></p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Nouveau Statut de la Parcelle
            </label>
            <select
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value as PlotStatus)}
              className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs font-semibold"
            >
              <option value="disponible">Disponible (Prête à la vente)</option>
              <option value="reservee">Réservée (Attente acompte client)</option>
              <option value="en_cours_de_vente">En cours de vente</option>
              <option value="vendue">Vendue (Acte notarié définitif)</option>
              <option value="bloquee">Bloquée (Blocage administratif)</option>
              <option value="litige">Litige (Contestation de limite)</option>
              <option value="indisponible">Indisponible (Réserve technique)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
              Motif Obligatoire de la Modification
            </label>
            <textarea
              required
              rows={3}
              value={statusChangeReason}
              onChange={(e) => setStatusChangeReason(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs"
              placeholder="Indiquez impérativement la justification (ex: Réception fiche de réservation, accord direction, bornage contesté...)"
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsStatusModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Confirmer le Changement de Statut
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modale d'ajout d'un nouveau Domaine Foncier */}
      <Modal
        isOpen={isLandModalOpen}
        onClose={() => setIsLandModalOpen(false)}
        title="Créer un Nouveau Domaine Foncier"
        description="Enregistrement d'un terrain propre ou sous mandat exclusif de tiers."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveLand} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Référence Unique"
              required
              value={newLandRef}
              onChange={(e) => setNewLandRef(e.target.value)}
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-executive-darkMuted mb-1.5">
                Nature de Propriété
              </label>
              <select
                value={newLandOwnership}
                onChange={(e) => setNewLandOwnership(e.target.value as any)}
                className="w-full px-3 py-2 bg-white dark:bg-executive-darkBg border border-slate-300 dark:border-executive-darkBorder rounded-lg text-xs font-semibold"
              >
                <option value="entreprise">Appartient à BELL ENTERPRISE</option>
                <option value="tiers_mandat">Appartient à un Tiers (Sous Mandat)</option>
              </select>
            </div>
          </div>

          <Input
            label="Désignation du Terrain / Lotissement"
            required
            value={newLandDesignation}
            onChange={(e) => setNewLandDesignation(e.target.value)}
            placeholder="ex: Domaine Résidentiel des Palmiers..."
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Numéro de Titre Foncier (Cameroun)"
              required
              value={newLandTitle}
              onChange={(e) => setNewLandTitle(e.target.value)}
              placeholder="ex: TF 14500/Wouri"
            />
            <Input
              label="Localité / Quartier"
              required
              value={newLandLocality}
              onChange={(e) => setNewLandLocality(e.target.value)}
              placeholder="ex: Yassa, PK21..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Superficie Globale (m²)"
              type="number"
              required
              value={newLandArea}
              onChange={(e) => setNewLandArea(parseFloat(e.target.value) || 0)}
            />
            <Input
              label="Montant d'Acquisition ou Référence (FCFA)"
              type="number"
              value={newLandPrice}
              onChange={(e) => setNewLandPrice(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-slate-100 dark:border-executive-darkBorder">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsLandModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Enregistrer le Domaine Foncier
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
