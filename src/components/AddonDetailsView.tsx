import React, { useState } from 'react';
import type { Addon, AddonDetails } from '../types';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Calendar,
  CheckCircle2,
  Loader2,
  FileText,
  Image as ImageIcon,
  History,
  X,
  ChevronDown,
  ChevronUp,
  Tag,
} from 'lucide-react';

interface Props {
  details: AddonDetails;
  installedAddon?: Addon | null;
  viewMode: 'full' | 'drawer';
  gameFlavor: 'retail' | 'forever' | 'all';
  onClose: () => void;
  onInstallVersion: (version: string, downloadUrl: string) => void;
  installing: boolean;
}

export const AddonDetailsView: React.FC<Props> = ({
  details,
  installedAddon,
  viewMode,
  gameFlavor,
  onClose,
  onInstallVersion,
  installing,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'versions'>('overview');
  const [expandedChangelog, setExpandedChangelog] = useState<string | null>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(
    details.screenshots.length > 0 ? details.screenshots[0] : null
  );
  const [showAllFlavors, setShowAllFlavors] = useState(false);

  const isInstalled = Boolean(installedAddon && installedAddon.installed_version);

  const handleOpenWebsite = () => {
    if (details.website_url) {
      invoke('open_external_url', { url: details.website_url }).catch(console.error);
    }
  };

  // Filter versions by selected game branch
  const filteredVersions = details.versions.filter((ver) => {
    if (showAllFlavors || gameFlavor === 'all') return true;

    const gv = ver.game_version.toLowerCase();
    if (gameFlavor === 'retail') {
      return gv.includes('retail') || (!gv.includes('classic') && !gv.includes('forever'));
    }
    if (gameFlavor === 'forever') {
      return gv.includes('forever');
    }
    return true;
  });

  const containerClasses =
    viewMode === 'drawer'
      ? 'fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-[#12141c] border-l border-[#262c3d] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200'
      : 'flex-1 flex flex-col bg-[#12141c] rounded-2xl border border-[#262c3d] p-6 space-y-6';

  const overlayClasses =
    viewMode === 'drawer' ? 'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm' : '';

  return (
    <>
      {viewMode === 'drawer' && <div className={overlayClasses} onClick={onClose} />}

      <div className={containerClasses}>
        {/* Top bar with Back button and Close */}
        <div className="flex items-center justify-between pb-4 border-b border-[#262c3d]">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white bg-[#1a1e29] hover:bg-[#222736] px-3.5 py-1.5 rounded-xl border border-[#2e354a] transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>

          {viewMode === 'drawer' && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#202534]"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Addon Header Banner */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#161922] p-5 rounded-2xl border border-[#262c3d]">
          <div className="flex items-center gap-4 min-w-0">
            {details.image_url ? (
              <img
                src={details.image_url}
                alt={details.name}
                className="w-16 h-16 rounded-2xl object-cover bg-[#0d0f15] border border-[#262c3d] shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-amber-500/20 border border-purple-500/30 flex items-center justify-center text-amber-400 text-2xl shrink-0 font-black">
                {details.name.charAt(0)}
              </div>
            )}

            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black text-white truncate">{details.name}</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                  {details.source.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Created by <strong className="text-slate-200">{details.author}</strong>
              </p>
              {details.downloads && (
                <p className="text-[11px] text-slate-500">
                  📥 {Number(details.downloads).toLocaleString()} Total Downloads
                </p>
              )}
            </div>
          </div>

          {/* Action buttons in header */}
          <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
            {details.website_url && (
              <button
                onClick={handleOpenWebsite}
                className="p-2.5 rounded-xl bg-[#202534] hover:bg-[#282f42] text-slate-300 hover:text-white border border-[#2e354a] transition-colors"
                title="Open Source / Website in Browser"
              >
                <ExternalLink size={16} />
              </button>
            )}

            {details.download_url && (
              <button
                onClick={() =>
                  onInstallVersion(details.latest_version || 'latest', details.download_url!)
                }
                disabled={installing}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 disabled:opacity-50"
              >
                {installing ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Installing...
                  </>
                ) : isInstalled ? (
                  <>
                    <CheckCircle2 size={15} />
                    Installed ({installedAddon?.installed_version})
                  </>
                ) : (
                  <>
                    <Download size={15} />
                    Install ({details.latest_version || 'Latest'})
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Tabs: Overview vs Versions */}
        <div className="flex border-b border-[#262c3d] gap-2">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition-all ${
              activeSubTab === 'overview'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText size={15} />
            Overview & Description
          </button>
          <button
            onClick={() => setActiveSubTab('versions')}
            className={`flex items-center gap-2 pb-3 px-3 text-xs font-bold border-b-2 transition-all ${
              activeSubTab === 'versions'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History size={15} />
            Versions ({filteredVersions.length})
          </button>
        </div>

        {/* Tab 1: Overview */}
        {activeSubTab === 'overview' && (
          <div className="space-y-6 overflow-y-auto pr-1">
            {/* Screenshots Gallery (if available) */}
            {details.screenshots.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <ImageIcon size={14} className="text-amber-400" />
                  Screenshots & Preview
                </h3>

                {selectedScreenshot && (
                  <div className="rounded-2xl overflow-hidden border border-[#262c3d] bg-[#0d0f15] max-h-80 flex items-center justify-center">
                    <img
                      src={selectedScreenshot}
                      alt="Screenshot full preview"
                      className="max-h-80 w-auto object-contain"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2.5 overflow-x-auto pb-2">
                  {details.screenshots.map((s, idx) => (
                    <img
                      key={idx}
                      src={s}
                      alt={`Thumbnail ${idx}`}
                      onClick={() => setSelectedScreenshot(s)}
                      className={`w-20 h-14 rounded-xl object-cover cursor-pointer border-2 transition-all shrink-0 ${
                        selectedScreenshot === s
                          ? 'border-amber-500 scale-105'
                          : 'border-[#262c3d] opacity-60 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                About this Addon
              </h3>
              <div className="bg-[#161922] p-5 rounded-2xl border border-[#262c3d] text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-sans">
                {details.description || details.summary || 'No detailed description provided.'}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Versions / Rollback */}
        {activeSubTab === 'versions' && (
          <div className="space-y-3 overflow-y-auto pr-1">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                Showing versions for branch: <strong className="text-amber-400 uppercase">{gameFlavor}</strong>
              </span>

              <button
                onClick={() => setShowAllFlavors(!showAllFlavors)}
                className="text-slate-400 hover:text-white underline text-[11px]"
              >
                {showAllFlavors ? 'Filter by selected branch' : 'Show all game branches'}
              </button>
            </div>

            <div className="space-y-2">
              {filteredVersions.length === 0 ? (
                <div className="p-8 text-center bg-[#161922] rounded-xl text-slate-400 text-xs">
                  No versions matching branch <strong>{gameFlavor}</strong>.
                  <button
                    onClick={() => setShowAllFlavors(true)}
                    className="block mx-auto mt-2 text-amber-400 hover:underline"
                  >
                    View all versions ({details.versions.length})
                  </button>
                </div>
              ) : (
                filteredVersions.map((ver, idx) => {
                  const isCurrent = installedAddon?.installed_version === ver.version;
                  const isExpanded = expandedChangelog === `${ver.version}-${idx}`;

                  // Colorize stability
                  const stab = ver.stability || 'Release';
                  const stabBadgeClass =
                    stab === 'Release'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : stab === 'Beta'
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : 'bg-rose-500/15 text-rose-400 border-rose-500/30';

                  const isForever = ver.game_version.toLowerCase().includes('forever');

                  return (
                    <div
                      key={`${ver.version}-${idx}`}
                      className="p-4 rounded-xl bg-[#161922] border border-[#262c3d] space-y-3"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold font-mono text-white">
                              {ver.version}
                            </span>

                            {/* Stability Badge (Release / Beta / Alpha) */}
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${stabBadgeClass} flex items-center gap-1`}
                            >
                              <Tag size={10} />
                              {stab}
                            </span>

                            {/* Game Version Badge */}
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                isForever
                                  ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                  : 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                              }`}
                            >
                              {ver.game_version}
                            </span>

                            {isCurrent && (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full">
                                Currently Installed
                              </span>
                            )}
                          </div>

                          {ver.release_date && (
                            <p className="text-[11px] text-slate-500 flex items-center gap-1">
                              <Calendar size={12} /> Released: {ver.release_date}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {ver.changelog && (
                            <button
                              onClick={() =>
                                setExpandedChangelog(
                                  isExpanded ? null : `${ver.version}-${idx}`
                                )
                              }
                              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 bg-[#202534] px-2.5 py-1.5 rounded-lg border border-[#2e354a]"
                            >
                              Changelog
                              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                          )}

                          <button
                            onClick={() => onInstallVersion(ver.version, ver.download_url)}
                            disabled={installing}
                            className="bg-[#202534] hover:bg-amber-500 hover:text-slate-950 text-slate-200 font-bold px-3 py-1.5 rounded-lg text-xs transition-all border border-[#2e354a] hover:border-amber-400 flex items-center gap-1"
                          >
                            <Download size={13} />
                            {isCurrent ? 'Reinstall' : 'Install'}
                          </button>
                        </div>
                      </div>

                      {isExpanded && ver.changelog && (
                        <div className="p-3 bg-[#0d0f15] rounded-lg border border-[#262c3d] text-xs text-slate-300 whitespace-pre-wrap font-mono">
                          {ver.changelog}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};
