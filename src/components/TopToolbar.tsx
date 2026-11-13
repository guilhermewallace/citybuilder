import React from 'react';
import {
  Building2,
  Download,
  FolderOpen,
  Plus,
  Redo2,
  Save,
  Share2,
  Undo2,
} from 'lucide-react';

interface TopToolbarProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onNewProject: () => void;
  onSave: () => void;
  justSaved: boolean;
  onExportPng: () => void;
  onOpenShareModal: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  projectName,
  onProjectNameChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onNewProject,
  onSave,
  justSaved,
  onExportPng,
  onOpenShareModal,
}) => {
  return (
    <header className="h-13 bg-white border-b border-slate-200 px-3 sm:px-4 flex items-center justify-between gap-2 sm:gap-4 shrink-0 z-20">
      {/* Brand + Project Name */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 sm:flex-initial">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-md bg-slate-900 text-white flex items-center justify-center">
            <Building2 className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-900 whitespace-nowrap">
            CityBuilder
          </span>
        </div>

        <span className="text-slate-300 select-none hidden xs:inline sm:inline" aria-hidden="true">
          /
        </span>

        <label htmlFor="project-name-input" className="sr-only">
          Project name
        </label>
        <input
          id="project-name-input"
          type="text"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          placeholder="Untitled City"
          maxLength={48}
          className="text-xs sm:text-sm font-medium text-slate-800 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white rounded-md px-1.5 sm:px-2 py-1 outline-none transition-colors min-w-0 w-24 sm:w-52 truncate"
        />
      </div>

      {/* Undo / Redo */}
      <div className="hidden sm:flex items-center gap-1 border border-slate-200 rounded-md p-0.5 bg-slate-50 shrink-0">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          className="p-1.5 rounded text-slate-700 hover:bg-white hover:text-slate-900 disabled:opacity-35 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-default"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
          className="p-1.5 rounded text-slate-700 hover:bg-white hover:text-slate-900 disabled:opacity-35 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-default"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      {/* Project Actions */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onNewProject}
          aria-label="New project"
          title="New project"
          className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New</span>
        </button>

        <button
          type="button"
          onClick={onOpenShareModal}
          aria-label="Projects and Import"
          className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Projects</span>
        </button>

        <button
          type="button"
          onClick={onSave}
          aria-label={justSaved ? 'Saved' : 'Save'}
          title="Save to browser storage (Ctrl+S)"
          className="inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{justSaved ? 'Saved' : 'Save'}</span>
        </button>

        <button
          type="button"
          onClick={onExportPng}
          title="Download city map as PNG"
          className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export PNG</span>
        </button>

        <button
          type="button"
          onClick={onOpenShareModal}
          aria-label="Share project"
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span className="hidden xs:inline sm:inline">Share</span>
        </button>
      </div>
    </header>
  );
};
