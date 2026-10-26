import React, { useState, useRef } from 'react';
import type { Addon, AddonPack, AddonPackItem } from '../types';
import { invoke } from '@tauri-apps/api/core';
import {
  X,
  Share2,
  Download,
  Upload,
  Copy,
  Check,
  CheckCircle2,
  Package,
  Loader2,
  AlertCircle,
  Square,
  CheckSquare,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  installedAddons: Addon[];
  onAddonsUpdated: () => void;
  showToast: (msg: string) => void;
}

export const SharePackModal: React.FC<Props> = ({
  isOpen,
  onClose,
  installedAddons,
  onAddonsUpdated,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');

  // Export State
  const [packName, setPackName] = useState('My WoW Addon Pack');
  const [selectedToExport, setSelectedToExport] = useState<Set<string>>(() => {
    return new Set(installedAddons.map((a) => a.id));
  });
  const [copied, setCopied] = useState(false);

  // Import State
  const [rawJson, setRawJson] = useState('');
  const [parsedPack, setParsedPack] = useState<AddonPack | null>(null);
  const [importSelected, setImportSelected] = useState<Set<number>>(new Set());
  const [importError, setImportError] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<{
    current: number;
    total: number;
    name: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Toggle selection for export
  const toggleExportItem = (id: string) => {
    setSelectedToExport((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllExport = () => {
    if (selectedToExport.size === installedAddons.length) {
      setSelectedToExport(new Set());
    } else {
      setSelectedToExport(new Set(installedAddons.map((a) => a.id)));
    }
  };

  // Build the AddonPack object
  const generatePackObject = (): AddonPack => {
    const items: AddonPackItem[] = installedAddons
      .filter((a) => selectedToExport.has(a.id))
      .map((a) => {
        let src = a.source || 'wago';
        let repo = a.repo || null;
        let wago_slug = a.wago_slug || null;
        let tukui_slug: string | null = null;

        if (src === 'tukui' || a.id.startsWith('tukui:')) {
          src = 'tukui';
          tukui_slug = a.id.replace('tukui:', '');
        } else if (src === 'github' || a.id.startsWith('github:')) {
          src = 'github';
          repo = a.repo || a.id.replace('github:', '');
        } else if (!wago_slug) {
          wago_slug = a.id.replace('wago:', '');
        }

        return {
          name: a.name,
          source: src,
          repo,
          wago_slug,
          tukui_slug,
        };
      });

    return {
      vault_version: '1.0.0',
      name: packName.trim() || 'WoW Addon Pack',
      export_date: new Date().toISOString(),
      addons: items,
    };
  };

  // Handle Export File Download
  const handleDownloadPack = () => {
    const pack = generatePackObject();
    if (pack.addons.length === 0) {
      alert('Please select at least one addon to export.');
      return;
    }

    const jsonStr = JSON.stringify(pack, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanFileName = pack.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    a.download = `${cleanFileName || 'wow-addons'}-pack.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded addon pack JSON file! 📦');
  };

  // Handle Copy to Clipboard
  const handleCopyPackJson = async () => {
    const pack = generatePackObject();
    if (pack.addons.length === 0) {
      alert('Please select at least one addon to export.');
      return;
    }

    const jsonStr = JSON.stringify(pack, null, 2);
    try {
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      showToast('Copied Addon Pack JSON to clipboard! 📋');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert('Could not copy to clipboard.');
    }
  };

  // Handle Parse JSON from file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      parsePackJson(content);
    };
    reader.readAsText(file);
    // Reset file input value
    e.target.value = '';
  };

  // Parse JSON string
  const parsePackJson = (raw: string) => {
    setImportError(null);
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.addons)) {
        throw new Error('Invalid Addon Pack format. Missing "addons" array.');
      }
      setParsedPack(parsed);
      // Select all uninstalled addons by default, or all if none installed
      const uninstalledIndices = new Set<number>();
      parsed.addons.forEach((item: AddonPackItem, idx: number) => {
        const isInstalled = isItemInstalled(item);
        if (!isInstalled) {
          uninstalledIndices.add(idx);
        }
      });

      // If all are already installed, select all
      if (uninstalledIndices.size === 0) {
        parsed.addons.forEach((_: any, idx: number) => uninstalledIndices.add(idx));
      }

      setImportSelected(uninstalledIndices);
    } catch (err: any) {
      setImportError(err.message || 'Invalid JSON syntax.');
    }
  };

  const isItemInstalled = (item: AddonPackItem) => {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanName = norm(item.name);
    return installedAddons.some((a) => {
      if (item.source === 'github' && item.repo && a.repo && norm(a.repo) === norm(item.repo)) {
        return true;
      }
      if (item.source === 'tukui' && item.tukui_slug && a.id === `tukui:${item.tukui_slug}`) {
        return true;
      }
      if (item.wago_slug && (a.wago_slug === item.wago_slug || a.id === `wago:${item.wago_slug}`)) {
        return true;
      }
      return norm(a.name) === cleanName;
    });
  };

  const toggleImportItem = (idx: number) => {
    setImportSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Perform Installation of Selected Addons
  const handleInstallSelected = async () => {
    if (!parsedPack || importSelected.size === 0) return;

    const itemsToInstall = parsedPack.addons.filter((_, idx) => importSelected.has(idx));
    setIsInstalling(true);
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < itemsToInstall.length; i++) {
      const item = itemsToInstall[i];
      setInstallProgress({
        current: i + 1,
        total: itemsToInstall.length,
        name: item.name,
      });

      try {
        let added: Addon;
        if (item.source === 'github' && item.repo) {
          added = await invoke<Addon>('add_addon_from_github', { repo: item.repo });
        } else if (item.source === 'tukui' && item.tukui_slug) {
          added = await invoke<Addon>('add_addon_from_tukui', { slug: item.tukui_slug });
        } else if (item.wago_slug) {
          added = await invoke<Addon>('add_addon_from_wago', { slug: item.wago_slug });
        } else if (item.repo) {
          added = await invoke<Addon>('add_addon_from_github', { repo: item.repo });
        } else {
          // Fallback to name as wago slug
          const slug = item.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
          added = await invoke<Addon>('add_addon_from_wago', { slug });
        }

        // Install or update files
        await invoke<Addon>('install_or_update', { addonId: added.id });
        successCount++;
      } catch (e) {
        console.error(`Failed to install pack item: ${item.name}`, e);
        failedCount++;
      }
    }

    setIsInstalling(false);
    setInstallProgress(null);
    onAddonsUpdated();

    if (failedCount === 0) {
      showToast(`Installed all ${successCount} addons from pack! 🎉`);
      onClose();
    } else {
      showToast(`Installed ${successCount} addons (${failedCount} failed). Check logs.`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-[#161922] border border-[#2b3347] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#242b3d]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Package size={17} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Share & Sync Addon Pack</h3>
              <p className="text-xs text-slate-400">
                Export your addon list or import a friend's pack with 1-click install
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#202534] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-[#242b3d] bg-[#12141c] px-6">
          <button
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'export'
                ? 'border-purple-500 text-purple-400 bg-purple-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Share2 size={14} />
            Export My Pack ({selectedToExport.size})
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'import'
                ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload size={14} />
            Import & Install Pack
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: EXPORT */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Pack Name</label>
                <input
                  type="text"
                  value={packName}
                  onChange={(e) => setPackName(e.target.value)}
                  placeholder="e.g. My Mythic+ Addons"
                  className="w-full bg-[#0d0f15] border border-[#262c3d] rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              {/* Addons List with Checkboxes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300">
                    Included Addons ({selectedToExport.size} of {installedAddons.length})
                  </span>
                  <button
                    type="button"
                    onClick={toggleSelectAllExport}
                    className="text-[11px] text-purple-400 hover:text-purple-300 transition-colors"
                  >
                    {selectedToExport.size === installedAddons.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                <div className="border border-[#262c3d] rounded-xl bg-[#0d0f15] divide-y divide-[#1e2330] max-h-56 overflow-y-auto">
                  {installedAddons.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      No addons installed in your vault to export.
                    </div>
                  ) : (
                    installedAddons.map((addon) => {
                      const isSelected = selectedToExport.has(addon.id);
                      return (
                        <div
                          key={addon.id}
                          onClick={() => toggleExportItem(addon.id)}
                          className="flex items-center justify-between p-2.5 px-3 hover:bg-[#161a24] cursor-pointer transition-colors text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isSelected ? (
                              <CheckSquare size={15} className="text-purple-400 shrink-0" />
                            ) : (
                              <Square size={15} className="text-slate-600 shrink-0" />
                            )}
                            <span className="text-white font-medium truncate">{addon.name}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-slate-500 font-mono">
                              v{addon.installed_version || '1.0'}
                            </span>
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#1a1e29] text-slate-400 border border-[#262c3d]">
                              {addon.source || 'wago'}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#242b3d]">
                <button
                  type="button"
                  onClick={handleCopyPackJson}
                  disabled={selectedToExport.size === 0}
                  className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-[#1a1e29] hover:bg-[#202534] border border-[#262c3d] rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  {copied ? 'Copied JSON!' : 'Copy JSON'}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPack}
                  disabled={selectedToExport.size === 0}
                  className="px-5 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-purple-600/20 flex items-center gap-2"
                >
                  <Download size={14} />
                  Download .json Pack
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: IMPORT */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              {/* Import Options (Upload File or Paste JSON) */}
              {!parsedPack ? (
                <div className="space-y-4">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[#2b3347] hover:border-cyan-500/50 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-[#0d0f15]/50 hover:bg-cyan-500/5 group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <Upload
                      size={28}
                      className="mx-auto text-slate-500 group-hover:text-cyan-400 mb-2 transition-colors"
                    />
                    <p className="text-xs font-semibold text-slate-200">
                      Click to choose a pack file (<code className="text-cyan-400">.json</code>)
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Load an exported addon collection from a teammate or friend
                    </p>
                  </div>

                  <div className="relative flex items-center justify-center my-2">
                    <div className="border-t border-[#262c3d] w-full" />
                    <span className="bg-[#161922] px-3 text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                      Or Paste JSON Code
                    </span>
                  </div>

                  <div className="space-y-2">
                    <textarea
                      value={rawJson}
                      onChange={(e) => setRawJson(e.target.value)}
                      placeholder='Paste pack JSON here: { "name": "...", "addons": [...] }'
                      rows={5}
                      className="w-full bg-[#0d0f15] border border-[#262c3d] rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => parsePackJson(rawJson)}
                      disabled={!rawJson.trim()}
                      className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-cyan-600/20"
                    >
                      Load & Preview Pack
                    </button>
                  </div>

                  {importError && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
                      <AlertCircle size={15} className="shrink-0" />
                      <span>{importError}</span>
                    </div>
                  )}
                </div>
              ) : (
                /* Parsed Pack Preview */
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-[#0d0f15] p-3.5 rounded-xl border border-[#262c3d]">
                    <div>
                      <h4 className="text-sm font-bold text-white">{parsedPack.name}</h4>
                      <p className="text-[11px] text-slate-400">
                        Contains {parsedPack.addons.length} addons • {importSelected.size} selected for install
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setParsedPack(null);
                        setRawJson('');
                      }}
                      className="text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      Choose Another File
                    </button>
                  </div>

                  {/* Addon Items in Pack */}
                  <div className="border border-[#262c3d] rounded-xl bg-[#0d0f15] divide-y divide-[#1e2330] max-h-60 overflow-y-auto">
                    {parsedPack.addons.map((item, idx) => {
                      const isSelected = importSelected.has(idx);
                      const installed = isItemInstalled(item);

                      return (
                        <div
                          key={idx}
                          onClick={() => toggleImportItem(idx)}
                          className="flex items-center justify-between p-2.5 px-3 hover:bg-[#161a24] cursor-pointer transition-colors text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isSelected ? (
                              <CheckSquare size={15} className="text-cyan-400 shrink-0" />
                            ) : (
                              <Square size={15} className="text-slate-600 shrink-0" />
                            )}
                            <div className="truncate">
                              <span className="text-white font-medium block truncate">
                                {item.name}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {item.source === 'github'
                                  ? item.repo
                                  : item.source === 'tukui'
                                  ? `tukui:${item.tukui_slug}`
                                  : `wago:${item.wago_slug || item.name}`}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {installed ? (
                              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                                <CheckCircle2 size={11} /> Installed
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                New Addon
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Installing Progress Indicator */}
                  {isInstalling && installProgress && (
                    <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 space-y-2">
                      <div className="flex items-center justify-between text-xs text-cyan-200">
                        <span className="flex items-center gap-2 font-semibold">
                          <Loader2 size={14} className="animate-spin text-cyan-400" />
                          Installing: {installProgress.name}
                        </span>
                        <span>
                          {installProgress.current} / {installProgress.total}
                        </span>
                      </div>
                      <div className="w-full bg-[#0d0f15] h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-cyan-400 h-full transition-all duration-300"
                          style={{
                            width: `${(installProgress.current / installProgress.total) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Install Action Button */}
                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#242b3d]">
                    <button
                      type="button"
                      onClick={() => setParsedPack(null)}
                      disabled={isInstalling}
                      className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-[#1a1e29] hover:bg-[#202534] rounded-xl transition-colors"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleInstallSelected}
                      disabled={isInstalling || importSelected.size === 0}
                      className="px-6 py-2.5 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 rounded-xl transition-all shadow-md shadow-cyan-400/20 flex items-center gap-2"
                    >
                      {isInstalling ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          Installing Pack...
                        </>
                      ) : (
                        <>
                          <Download size={15} />
                          Install Selected Addons ({importSelected.size})
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
