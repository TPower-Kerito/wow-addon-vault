import React, { useState } from 'react';
import type { ScannedAddon } from '../types';
import { X, Check, Scan, CheckSquare, Square, FolderCheck, Loader2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  scannedAddons: ScannedAddon[];
  loading: boolean;
  onImport: (selected: ScannedAddon[]) => void;
}

export const ScanImportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  scannedAddons,
  loading,
  onImport,
}) => {
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());

  // Auto-select all whenever new addons are loaded
  React.useEffect(() => {
    if (scannedAddons.length > 0) {
      setSelectedFolders(new Set(scannedAddons.map((s) => s.folder_name)));
    }
  }, [scannedAddons]);

  if (!isOpen) return null;

  const toggleAll = () => {
    if (selectedFolders.size === scannedAddons.length) {
      setSelectedFolders(new Set());
    } else {
      setSelectedFolders(new Set(scannedAddons.map((s) => s.folder_name)));
    }
  };

  const toggleItem = (folder: string) => {
    const next = new Set(selectedFolders);
    if (next.has(folder)) {
      next.delete(folder);
    } else {
      next.add(folder);
    }
    setSelectedFolders(next);
  };

  const handleConfirm = () => {
    const toImport = scannedAddons.filter((s) => selectedFolders.has(s.folder_name));
    onImport(toImport);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-[#161922] border border-[#262c3d] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#262c3d]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Scan size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Import Existing AddOns from PC</h2>
              <p className="text-xs text-slate-400">
                Scanned directly from your World of Warcraft directory (CurseForge / Manual)
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

        {/* Info banner */}
        <div className="bg-[#12141c] px-6 py-3 border-b border-[#262c3d] flex items-center justify-between text-xs">
          <span className="text-slate-300">
            Found <strong>{scannedAddons.length}</strong> installed addon folder(s) on your disk.
          </span>
          <button
            onClick={toggleAll}
            className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1.5"
          >
            {selectedFolders.size === scannedAddons.length ? (
              <>
                <CheckSquare size={14} /> Unselect All
              </>
            ) : (
              <>
                <Square size={14} /> Select All
              </>
            )}
          </button>
        </div>

        {/* Content list */}
        <div className="p-6 overflow-y-auto flex-1 space-y-2">
          {loading ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Loader2 size={24} className="animate-spin mx-auto text-amber-400" />
              <p className="text-xs">Reading .toc files from your AddOns folder...</p>
            </div>
          ) : scannedAddons.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No third-party addons found in your WoW directory.
            </div>
          ) : (
            scannedAddons.map((addon) => {
              const isChecked = selectedFolders.has(addon.folder_name);
              return (
                <div
                  key={addon.folder_name}
                  onClick={() => toggleItem(addon.folder_name)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isChecked
                      ? 'bg-[#1a1e29] border-cyan-500/40 text-white'
                      : 'bg-[#12141c] border-[#262c3d] text-slate-400 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                        isChecked
                          ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                          : 'border-slate-600 bg-transparent'
                      }`}
                    >
                      {isChecked && <Check size={14} strokeWidth={3} />}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold truncate">{addon.title}</span>
                        <span className="text-[10px] text-slate-500 bg-[#0d0f15] px-1.5 py-0.5 rounded border border-[#262c3d]">
                          📁 {addon.folder_name}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        by {addon.author} • Version: <span className="text-cyan-400 font-mono">{addon.version}</span>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#262c3d] bg-[#12141c] flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Selected: <strong className="text-white">{selectedFolders.size}</strong> addons
          </span>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-400 hover:text-white rounded-xl hover:bg-[#202534] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedFolders.size === 0}
              className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-1.5"
            >
              <FolderCheck size={15} />
              Import to Vault ({selectedFolders.size})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
