import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export const AppLayout: React.FC = () => {
  return (
    <div className="flex h-screen overflow-hidden bg-executive-light dark:bg-executive-darkBg">
      {/* Sidebar gauche */}
      <Sidebar />

      {/* Colonne droite : Topbar + Contenu principal scrollable */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
