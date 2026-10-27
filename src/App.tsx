import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Settings, Addon, AddonDetails, ScannedAddon, AppUpdateInfo } from './types';
import { Navbar } from './components/Navbar';
import { AddonList } from './components/AddonList';
import { BrowseView } from './components/BrowseView';
import { AddonDetailsView } from './components/AddonDetailsView';
import { SettingsModal } from './components/SettingsModal';
import { ScanImportModal } from './components/ScanImportModal';
import { SharePackModal } from './components/SharePackModal';
import { AlertTriangle, Sparkles, Loader2, Download } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<'my-addons' | 'browse'>('my-addons');
  const [settings, setSettings] = useState<Settings>({
    wow_path: '',
    github_token: null,
    details_view_mode: 'full',
    game_flavor: 'retail',
    auto_update_addons: false,
  });
  const [addons, setAddons] = useState<Addon[]>([]);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);

  // Selected addon for details page
  const [selectedDetails, setSelectedDetails] = useState<AddonDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Scan modal state
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scannedAddons, setScannedAddons] = useState<ScannedAddon[]>([]);
  const [scanningDisk, setScanningDisk] = useState(false);

  // Share Pack modal
  const [isSharePackOpen, setIsSharePackOpen] = useState(false);

  // Settings modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [appUpdate, setAppUpdate] = useState<AppUpdateInfo | null>(null);
  const [updatingApp, setUpdatingApp] = useState(false);
  const [updateAppError, setUpdateAppError] = useState<string | null>(null);

  useEffect(() => {
    loadInitialData();
  }, []);

  // Periodic background update check every 15 minutes (15 * 60 * 1000 ms)
  useEffect(() => {
    const FIFTEEN_MINUTES = 15 * 60 * 1000;
    const interval = setInterval(() => {
      if (addons.length > 0 && settings.wow_path && settings.wow_path.trim()) {
        executeCheckUpdates(Boolean(settings.auto_update_addons), true);
      }
    }, FIFTEEN_MINUTES);

    return () => clearInterval(interval);
  }, [addons.length, settings.wow_path, settings.auto_update_addons]);

  const loadInitialData = async () => {
    try {
      // Check for App Update in background
      invoke<AppUpdateInfo | null>('check_app_update')
        .then((up) => {
          if (up) setAppUpdate(up);
        })
        .catch(() => {});

      const loadedSettings = await invoke<Settings>('get_settings');
      setSettings(loadedSettings);

      const loadedAddons = await invoke<Addon[]>('get_addons');
      setAddons(loadedAddons);

      let effectivePath = loadedSettings.wow_path;

      if (!effectivePath || !effectivePath.trim()) {
        const detected = await invoke<string | null>('auto_detect_wow_path');
        if (detected) {
          effectivePath = detected;
          const updated = { ...loadedSettings, wow_path: detected };
          await invoke('save_settings', { settings: updated });
          setSettings(updated);
        } else {
          setIsSettingsOpen(true);
        }
      }

      // Auto-check for addon updates on startup
      if (loadedAddons.length > 0 && effectivePath && effectivePath.trim()) {
        executeCheckUpdates(Boolean(loadedSettings.auto_update_addons), true);
      }
    } catch (err) {
      console.error('Error loading initial data:', err);
    }
  };

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  const handleSaveSettings = async (newSettings: Settings) => {
    try {
      await invoke('save_settings', { settings: newSettings });
      setSettings(newSettings);
      showToast('Settings saved successfully!');
    } catch (err: any) {
      alert(`Failed to save settings: ${err}`);
    }
  };

  const handleApplyAppUpdate = async () => {
    if (!appUpdate?.download_url) {
      invoke('open_external_url', {
        url: appUpdate?.html_url || 'https://github.com/TPower-Kerito/wow-addon-vault/releases',
      });
      return;
    }

    setUpdatingApp(true);
    setUpdateAppError(null);
    showToast('Downloading and installing app update... 🚀');

    try {
      await invoke('install_app_update', { downloadUrl: appUpdate.download_url });
    } catch (err: any) {
      console.error('Failed to apply app update:', err);
      setUpdateAppError(typeof err === 'string' ? err : 'Update installation failed.');
      setUpdatingApp(false);
    }
  };

  const handleGameFlavorChange = async (flavor: 'retail' | 'forever' | 'all') => {
    const updated = { ...settings, game_flavor: flavor };
    setSettings(updated);
    try {
      await invoke('save_settings', { settings: updated });
    } catch (e) {
      console.error(e);
    }
  };

  const handleScanDisk = async () => {
    if (!settings.wow_path || !settings.wow_path.trim()) {
      setIsSettingsOpen(true);
      return;
    }

    setScanningDisk(true);
    try {
      const diskList = await invoke<ScannedAddon[]>('scan_disk_addons');
      setScannedAddons(diskList);
      setIsScanModalOpen(true);
      if (diskList.length === 0) {
        showToast('No addon folders found in Interface/AddOns.');
      }
    } catch (err: any) {
      alert(`Scan error: ${err}`);
    } finally {
      setScanningDisk(false);
    }
  };

  const handleImportScanned = async (selected: ScannedAddon[]) => {
    try {
      const updated = await invoke<Addon[]>('import_scanned_addons', { scanned: selected });
      setAddons(updated);
      showToast(`Imported ${selected.length} addons into your Vault without downloading! 🛡️`);
    } catch (err: any) {
      alert(`Failed to import addons: ${err}`);
    }
  };

  const isAddonUpdatable = (a: Addon) => {
    if (a.ignored) return false;
    if (!a.latest_version || a.latest_version === '-' || a.latest_version === 'none') return false;
    return Boolean(a.has_update);
  };

  const executeCheckUpdates = async (autoUpdateIfFound = false, isBackground = false) => {
    setCheckingUpdates(true);
    try {
      const refreshed = await invoke<Addon[]>('check_all_updates');
      setAddons(refreshed);
      const toUpdate = refreshed.filter(isAddonUpdatable);
      const count = toUpdate.length;

      if (count > 0) {
        if (autoUpdateIfFound && settings.wow_path && settings.wow_path.trim()) {
          showToast(`Auto-Update: Updating ${count} addon(s) in background... 🚀`);
          setUpdatingAll(true);
          for (const addon of toUpdate) {
            setInstallingId(addon.id);
            try {
              const updated = await invoke<Addon>('install_or_update', { addonId: addon.id });
              setAddons((prev) => prev.map((a) => (a.id === addon.id ? updated : a)));
            } catch (err) {
              console.error(`Auto-update failed for ${addon.name}`, err);
            }
          }
          setInstallingId(null);
          setUpdatingAll(false);
          showToast(`Auto-Update completed for ${count} addon(s)! ✨`);
        } else {
          showToast(`Found ${count} addon update${count > 1 ? 's' : ''}!`);
        }
      } else if (!isBackground) {
        showToast('All addons are up to date! 🛡️');
      }
    } catch (err: any) {
      if (!isBackground) {
        showToast(`Error checking updates: ${err}`);
      }
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleCheckUpdates = () => executeCheckUpdates(Boolean(settings.auto_update_addons), false);

  const handleToggleAutoUpdate = async () => {
    const nextState = !settings.auto_update_addons;
    const updated = { ...settings, auto_update_addons: nextState };
    setSettings(updated);
    try {
      await invoke('save_settings', { settings: updated });
      showToast(
        nextState
          ? 'Auto-Update enabled! Addons will update in background when detected. 🚀'
          : 'Auto-Update disabled.'
      );
      if (nextState) {
        const toUpdate = addons.filter(isAddonUpdatable);
        if (toUpdate.length > 0) {
          handleUpdateAll();
        }
      }
    } catch (e) {
      console.error('Failed to save auto-update setting:', e);
    }
  };

  const handleInstallOrUpdate = async (id: string) => {
    if (!settings.wow_path || !settings.wow_path.trim()) {
      setIsSettingsOpen(true);
      return;
    }

    setInstallingId(id);
    try {
      const updated = await invoke<Addon>('install_or_update', { addonId: id });
      setAddons((prev) => prev.map((a) => (a.id === id ? updated : a)));
      showToast(`Installed ${updated.name} successfully! ✨`);
    } catch (err: any) {
      alert(`Installation error: ${err}`);
    } finally {
      setInstallingId(null);
    }
  };

  const handleSelectAddon = async (slug: string) => {
    setLoadingDetails(true);
    try {
      const details = await invoke<AddonDetails>('get_addon_details', { slugOrId: slug });
      setSelectedDetails(details);
    } catch (err: any) {
      alert(`Could not load addon details: ${err}`);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleInstallVersion = async (version: string, downloadUrl: string) => {
    if (!selectedDetails) return;
    if (!settings.wow_path || !settings.wow_path.trim()) {
      setIsSettingsOpen(true);
      return;
    }

    setInstallingId(selectedDetails.id);
    try {
      const installed = await invoke<Addon>('install_specific_version', {
        addonId: selectedDetails.id,
        version,
        downloadUrl,
      });

      setAddons((prev) => {
        const idx = prev.findIndex((a) => a.id === installed.id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = installed;
          return next;
        }
        return [installed, ...prev];
      });

      showToast(`Installed ${selectedDetails.name} (${version})! 🎉`);
    } catch (err: any) {
      alert(`Error installing version: ${err}`);
    } finally {
      setInstallingId(null);
    }
  };

  const handleQuickInstall = async (slug: string) => {
    if (!settings.wow_path || !settings.wow_path.trim()) {
      setIsSettingsOpen(true);
      return;
    }

    setInstallingId(slug.startsWith('github:') || slug.startsWith('tukui:') ? slug : `wago:${slug}`);
    try {
      let added: Addon;
      if (slug.startsWith('github:')) {
        added = await invoke<Addon>('add_addon_from_github', { repo: slug.replace('github:', '') });
      } else if (slug.startsWith('tukui:')) {
        added = await invoke<Addon>('add_addon_from_tukui', { slug: slug.replace('tukui:', '') });
      } else {
        added = await invoke<Addon>('add_addon_from_wago', { slug });
      }
      const updated = await invoke<Addon>('install_or_update', { addonId: added.id });

      setAddons((prev) => {
        const exists = prev.some((a) => a.id === updated.id);
        if (exists) {
          return prev.map((a) => (a.id === updated.id ? updated : a));
        }
        return [updated, ...prev];
      });

      showToast(`Installed ${updated.name} successfully! ✨`);
    } catch (err: any) {
      alert(`Quick install error: ${err}`);
    } finally {
      setInstallingId(null);
    }
  };

  const handleAddGithub = async (repo: string) => {
    if (!settings.wow_path || !settings.wow_path.trim()) {
      setIsSettingsOpen(true);
      return;
    }

    setInstallingId(`github:${repo}`);
    try {
      const added = await invoke<Addon>('add_addon_from_github', { repo });
      const installed = await invoke<Addon>('install_or_update', { addonId: added.id });

      setAddons((prev) => {
        const exists = prev.some((a) => a.id === installed.id);
        if (exists) {
          return prev.map((a) => (a.id === installed.id ? installed : a));
        }
        return [installed, ...prev];
      });

      showToast(`Installed ${installed.name} from GitHub! 🐙`);
    } catch (err: any) {
      alert(`GitHub install error: ${err}`);
    } finally {
      setInstallingId(null);
    }
  };

  const handleUpdateAll = async () => {
    if (!settings.wow_path || !settings.wow_path.trim()) {
      setIsSettingsOpen(true);
      return;
    }

    const toUpdate = addons.filter(isAddonUpdatable);
    if (toUpdate.length === 0) return;

    setUpdatingAll(true);
    for (const addon of toUpdate) {
      setInstallingId(addon.id);
      try {
        const updated = await invoke<Addon>('install_or_update', { addonId: addon.id });
        setAddons((prev) => prev.map((a) => (a.id === addon.id ? updated : a)));
      } catch (err) {
        console.error(`Failed to update ${addon.name}`, err);
      }
    }
    setInstallingId(null);
    setUpdatingAll(false);
    showToast('All updates completed! 🎉');
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke('delete_addon', { addonId: id });
      setAddons((prev) => prev.filter((a) => a.id !== id));
      showToast('Addon uninstalled from vault and game folder.');
    } catch (err: any) {
      alert(`Delete error: ${err}`);
    }
  };

  const handleOpenFolder = async () => {
    if (!settings.wow_path || !settings.wow_path.trim()) {
      setIsSettingsOpen(true);
      return;
    }
    try {
      await invoke('open_addons_folder');
    } catch (err: any) {
      alert(`Could not open folder: ${err}`);
    }
  };

  const updateCount = addons.filter(isAddonUpdatable).length;
  const viewMode = (settings.details_view_mode as 'full' | 'drawer') || 'full';
  const gameFlavor = (settings.game_flavor as 'retail' | 'forever' | 'all') || 'retail';

  return (
    <div className="min-h-screen bg-[#0d0f15] text-slate-100 flex flex-col font-sans select-none">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#161922] border border-amber-500/40 text-amber-300 text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl shadow-black/80 flex items-center gap-2 animate-in slide-in-from-bottom-3 duration-200">
          <Sparkles size={15} className="text-amber-400" />
          {notification}
        </div>
      )}

      {/* Main Navbar */}
      <Navbar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setSelectedDetails(null);
          setActiveTab(tab);
        }}
        settings={settings}
        totalInstalled={addons.length}
        updateCount={updateCount}
        checkingUpdates={checkingUpdates}
        updatingAll={updatingAll}
        scanningDisk={scanningDisk}
        onCheckUpdates={handleCheckUpdates}
        onUpdateAll={handleUpdateAll}
        onScanDisk={handleScanDisk}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenFolder={handleOpenFolder}
        onOpenSharePack={() => setIsSharePackOpen(true)}
        onGameFlavorChange={handleGameFlavorChange}
      />

      {/* Loading Details Overlay */}
      {loadingDetails && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-[#161922] p-6 rounded-2xl border border-[#262c3d] flex items-center gap-3 text-sm text-slate-200 shadow-2xl">
            <Loader2 size={20} className="animate-spin text-amber-400" />
            Loading Addon Details & Version History...
          </div>
        </div>
      )}

      {/* App Update Available Notification Banner */}
      {appUpdate && (
        <div className="bg-gradient-to-r from-amber-500/20 via-purple-500/20 to-amber-500/20 border-b border-amber-500/30 px-6 py-2.5 flex items-center justify-between gap-4 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-2.5 text-xs text-amber-200">
            <Sparkles size={16} className="text-amber-400 shrink-0" />
            <div>
              <span>
                <strong>New App Version Available!</strong> (v{appUpdate.latest_version}) — You are currently on v{appUpdate.current_version}.
              </span>
              {updateAppError && (
                <div className="text-[11px] text-rose-400 mt-0.5">
                  Update Error: {updateAppError}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleApplyAppUpdate}
              disabled={updatingApp}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold px-3.5 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer"
              title="Download and apply update directly without opening browser"
            >
              {updatingApp ? (
                <>
                  <Loader2 size={13} className="animate-spin text-slate-950" />
                  <span>Updating App...</span>
                </>
              ) : (
                <>
                  <Download size={13} />
                  <span>Update Now</span>
                </>
              )}
            </button>
            <button
              onClick={() => setAppUpdate(null)}
              disabled={updatingApp}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Missing WoW Path Warning Banner */}
      {(!settings.wow_path || !settings.wow_path.trim()) && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-amber-300">
            <AlertTriangle size={15} />
            <span>
              World of Warcraft directory is not configured yet. Configure it to enable 1-click installing and updates.
            </span>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1 rounded-lg transition-colors shrink-0"
          >
            Configure Now
          </button>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 flex flex-col">
        {/* Full Page Details View (if open in 'full' mode) */}
        {selectedDetails && viewMode === 'full' ? (
          <AddonDetailsView
            details={selectedDetails}
            installedAddon={addons.find((a) => a.id === selectedDetails.id || a.wago_slug === selectedDetails.id.replace('wago:', ''))}
            viewMode="full"
            gameFlavor={gameFlavor}
            onClose={() => setSelectedDetails(null)}
            onInstallVersion={handleInstallVersion}
            installing={installingId === selectedDetails.id}
          />
        ) : (
          <>
            {activeTab === 'my-addons' ? (
              <AddonList
                addons={addons}
                installingId={installingId}
                onInstallOrUpdate={handleInstallOrUpdate}
                onDelete={handleDelete}
                onOpenAddModal={() => setActiveTab('browse')}
                onSelectAddon={handleSelectAddon}
                onUpdateAddon={(updated) => {
                  setAddons((prev) =>
                    prev.map((a) => (a.id === updated.id ? updated : a))
                  );
                }}
                onUpdateAll={handleUpdateAll}
                updatingAll={updatingAll}
                autoUpdateEnabled={Boolean(settings.auto_update_addons)}
                onToggleAutoUpdate={handleToggleAutoUpdate}
                showToast={showToast}
              />
            ) : (
              <BrowseView
                installedAddons={addons}
                onSelectAddon={handleSelectAddon}
                onQuickInstall={handleQuickInstall}
                onAddGithub={handleAddGithub}
                installingId={installingId}
              />
            )}
          </>
        )}

        {/* Drawer Mode Details View (slides in from right if open in 'drawer' mode) */}
        {selectedDetails && viewMode === 'drawer' && (
          <AddonDetailsView
            details={selectedDetails}
            installedAddon={addons.find((a) => a.id === selectedDetails.id || a.wago_slug === selectedDetails.id.replace('wago:', ''))}
            viewMode="drawer"
            gameFlavor={gameFlavor}
            onClose={() => setSelectedDetails(null)}
            onInstallVersion={handleInstallVersion}
            installing={installingId === selectedDetails.id}
          />
        )}
      </main>

      {/* Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

      <ScanImportModal
        isOpen={isScanModalOpen}
        onClose={() => setIsScanModalOpen(false)}
        scannedAddons={scannedAddons}
        loading={scanningDisk}
        onImport={handleImportScanned}
      />

      <SharePackModal
        isOpen={isSharePackOpen}
        onClose={() => setIsSharePackOpen(false)}
        installedAddons={addons}
        onAddonsUpdated={async () => {
          try {
            const refreshed = await invoke<Addon[]>('get_addons');
            setAddons(refreshed);
          } catch (e) {
            console.error(e);
          }
        }}
        showToast={showToast}
      />
    </div>
  );
}

export default App;
