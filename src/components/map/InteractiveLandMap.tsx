import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Plot, LandProperty, PlotStatus } from '../../types/land.types';
import { formatCurrency } from '../../lib/utils';
import { Badge } from '../ui/Badge';

// Fix icônes Leaflet par défaut
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});

// Icônes personnalisées selon le statut foncier (Executive Green charte)
const getStatusIcon = (status: PlotStatus) => {
  let color = '#27815E'; // disponible (émeraude)
  if (status === 'reservee') color = '#D97706'; // ambre
  if (status === 'vendue') color = '#475569'; // gris/ardoise
  if (status === 'bloquee') color = '#7C3AED'; // violet
  if (status === 'litige') color = '#DC2626'; // rouge alerte

  const svgHtml = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="30" height="30">
      <path fill="${color}" stroke="#ffffff" stroke-width="2" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
      <circle cx="12" cy="9" r="2.5" fill="#ffffff"/>
    </svg>
  `;

  return L.divIcon({
    className: 'custom-plot-marker',
    html: svgHtml,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28],
  });
};

interface InteractiveLandMapProps {
  landProperty?: LandProperty;
  plots: Plot[];
  selectedPlot?: Plot | null;
  onSelectPlot?: (plot: Plot) => void;
  statusFilter?: string;
}

// Composant pour recentrer la carte lorsque le terrain ou la parcelle change
const MapUpdater: React.FC<{ center: [number, number]; zoom: number }> = ({ center, zoom }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
};

export const InteractiveLandMap: React.FC<InteractiveLandMapProps> = ({
  landProperty,
  plots,
  selectedPlot,
  onSelectPlot,
  statusFilter = 'all',
}) => {
  const defaultCenter: [number, number] = landProperty
    ? [landProperty.latitude, landProperty.longitude]
    : plots.length > 0
    ? [plots[0].latitude, plots[0].longitude]
    : [4.0152, 9.8241]; // Japoma, Douala

  const filteredPlots = plots.filter((p) => {
    if (statusFilter === 'all') return true;
    return p.status === statusFilter;
  });

  return (
    <div className="relative w-full h-[450px] rounded-xl overflow-hidden border border-slate-200 dark:border-executive-darkBorder shadow-xs">
      <MapContainer
        center={defaultCenter}
        zoom={16}
        scrollWheelZoom={false}
        className="w-full h-full z-10"
      >
        <MapUpdater center={defaultCenter} zoom={16} />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Emplacement global du terrain / lotissement */}
        {landProperty && (
          <Circle
            center={[landProperty.latitude, landProperty.longitude]}
            radius={180}
            pathOptions={{
              color: '#164B3A',
              fillColor: '#27815E',
              fillOpacity: 0.12,
              weight: 2,
              dashArray: '5, 5',
            }}
          />
        )}

        {/* Parcelles individuelles */}
        {filteredPlots.map((plot) => (
          <Marker
            key={plot.id}
            position={[plot.latitude, plot.longitude]}
            icon={getStatusIcon(plot.status)}
            eventHandlers={{
              click: () => onSelectPlot && onSelectPlot(plot),
            }}
          >
            <Popup className="custom-leaflet-popup">
              <div className="p-1 space-y-1.5 text-xs text-slate-800 font-sans min-w-[180px]">
                <div className="flex items-center justify-between border-b pb-1">
                  <strong className="text-sm font-bold text-slate-900">{plot.plot_number}</strong>
                  <span className="text-[10px] uppercase font-bold text-slate-500">
                    {plot.status}
                  </span>
                </div>
                <div className="space-y-0.5 text-[11px] text-slate-600">
                  <p>Superficie : <strong>{plot.area_sqm} m²</strong></p>
                  <p>Dimensions : <strong>{plot.facade_m || '-'}m x {plot.depth_m || '-'}m</strong></p>
                  <p>Prix au m² : <strong>{formatCurrency(plot.price_per_sqm)}</strong></p>
                  <p className="font-bold text-emerald-800 text-xs pt-1 border-t">
                    Total : {formatCurrency(plot.total_price)}
                  </p>
                </div>
                {plot.notes && (
                  <p className="text-[10px] text-slate-500 italic bg-slate-50 p-1 rounded">
                    {plot.notes}
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Légende interactive sur la carte */}
      <div className="absolute bottom-3 left-3 z-20 bg-white/90 dark:bg-executive-darkSurface/90 backdrop-blur-xs p-2.5 rounded-lg border border-slate-200 dark:border-executive-darkBorder shadow-md text-xs space-y-1">
        <p className="font-bold text-[10px] text-slate-600 dark:text-slate-300 uppercase tracking-wider mb-1">
          Légende Statuts
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span>
            <span>Disponible</span>
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
            <span>Réservée</span>
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block"></span>
            <span>Vendue</span>
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-600 inline-block"></span>
            <span>Bloquée</span>
          </div>
        </div>
      </div>
    </div>
  );
};
