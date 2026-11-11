/**
 * Reusable UI Chrome & Design Tokens (SceneFlow Design Parity)
 * Centralized Tailwind class bundles for uniform surfaces, buttons, modals, dropdowns, and segmented pills.
 */

export const UI_TOKENS = {
  // Application layout frames & headers
  layout: {
    appHeader:
      'relative h-12 border-b border-border-main bg-surface flex items-center justify-between px-3 shrink-0 z-30 transition-all text-text-main select-none',
    leftPanelBase: 'flex flex-col bg-surface border-border-main z-10 text-text-main',
    rightPanelBase: 'bg-app flex flex-col overflow-hidden relative',
    sectionTitle: 'text-xs font-black uppercase tracking-[0.2em] text-text-faint',
    sectionTitleMini: 'text-[10px] font-black uppercase tracking-[0.2em] text-text-faint',
  },

  // Modal containers & overlays
  modal: {
    overlay:
      'fixed inset-0 z-[110] flex items-center justify-center p-4 bg-overlay-bg backdrop-blur-sm animate-in fade-in duration-300',
    overlayHeavy:
      'fixed inset-0 z-[100] flex items-center justify-center p-4 bg-overlay-heavy backdrop-blur-sm animate-in fade-in duration-300',
    containerSm:
      'bg-surface w-full max-w-sm rounded-[2rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-border-main text-text-main',
    containerMd:
      'bg-surface w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-border-main text-text-main',
    containerLg:
      'bg-surface w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-border-main text-text-main',
    containerLibrary:
      'relative w-full max-w-5xl h-[94vh] sm:h-[90vh] md:h-[86vh] bg-surface rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-border-main text-text-main',
    containerStaging:
      'relative w-full max-w-2xl max-h-[80vh] bg-surface rounded-xl shadow-2xl overflow-hidden flex flex-col border border-border-main text-text-main',
    header:
      'flex items-center justify-between px-4 py-3.5 md:px-5 md:py-4 border-b border-border-subtle bg-surface-subtle shrink-0 text-text-main',
    headerSubtle:
      'flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface-subtle shrink-0 text-text-main',
    footer:
      'px-6 py-3 border-t border-border-subtle bg-surface-subtle flex justify-end shrink-0',
    dialogPad: 'p-8 space-y-6 text-center',
    bodyPad: 'p-6 lg:p-8 space-y-6',
    title: 'text-lg font-bold text-text-main',
    description: 'text-sm text-text-muted mt-2',
  },

  // Dropdown menus
  dropdown: {
    menu: 'absolute top-full left-0 mt-2 w-48 bg-surface rounded-xl shadow-xl border border-border-main overflow-hidden z-50 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 text-text-main divide-y divide-border-subtle',
    menuRight:
      'absolute top-full right-0 mt-2 w-48 bg-surface rounded-xl shadow-xl border border-border-main overflow-hidden z-50 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 text-text-main divide-y divide-border-subtle',
    menuWide:
      'absolute top-full right-0 mt-2 w-56 bg-surface rounded-xl shadow-xl border border-border-main overflow-hidden z-50 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 text-text-main divide-y divide-border-subtle',
    header:
      'p-2 bg-surface-subtle border-b border-border-subtle flex items-center justify-between',
    headerText: 'text-[9px] font-black text-text-faint uppercase tracking-widest',
    item: 'w-full text-left px-3 py-2 text-xs font-semibold hover:bg-surface-subtle flex items-center justify-between transition-colors text-text-body hover:text-text-main cursor-pointer',
    itemActive:
      'w-full text-left px-3 py-2 text-xs font-semibold bg-surface-subtle text-text-main flex items-center justify-between transition-colors cursor-pointer',
  },

  // Button styles
  button: {
    primary:
      'px-6 py-2.5 bg-btn-primary-bg text-btn-primary-text rounded-xl font-bold hover:bg-btn-primary-hover transition-all active:scale-95 shadow-md cursor-pointer',
    secondary:
      'px-5 py-2.5 bg-btn-secondary-bg text-btn-secondary-text rounded-xl font-bold hover:bg-btn-secondary-hover transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
    danger:
      'px-5 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all active:scale-95 shadow-md shadow-red-500/20 cursor-pointer',
    actionPill:
      'flex items-center gap-2 px-3 py-1.5 bg-surface hover:bg-surface-subtle text-text-body rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 border border-border-main shadow-xs cursor-pointer',
    actionPillActive:
      'flex items-center gap-2 px-3 py-1.5 bg-btn-primary-bg text-btn-primary-text rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 border border-btn-primary-bg shadow-xs cursor-pointer',
    filePill:
      'flex items-center gap-1.5 px-2.5 py-1.5 bg-surface hover:bg-surface-subtle text-text-body hover:text-text-main rounded-xl text-xs font-bold transition-all active:scale-95 border border-border-main shadow-2xs cursor-pointer',
    filePillActive:
      'flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-muted text-text-main rounded-xl text-xs font-bold transition-all active:scale-95 border border-border-main shadow-inner cursor-pointer',
    libraryPop:
      'flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 border shadow-xs bg-surface hover:bg-surface-hover text-text-main border-border-main cursor-pointer',
    libraryPopActive:
      'flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 border bg-btn-primary-bg text-btn-primary-text border-btn-primary-bg shadow-md cursor-pointer',
    settingsPill:
      'flex items-center gap-1.5 px-2.5 py-1.5 bg-surface hover:bg-surface-subtle text-text-body hover:text-text-main rounded-xl text-xs font-bold transition-all active:scale-95 border border-border-main shadow-xs cursor-pointer',
    settingsPillActive:
      'flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-muted text-text-main rounded-xl text-xs font-bold transition-all active:scale-95 border border-border-main shadow-inner cursor-pointer',
    segmentedGroup:
      'flex items-center bg-surface-muted p-0.5 rounded-xl border border-border-main shadow-xs',
    segmentedItem:
      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] lg:text-xs font-semibold text-text-muted hover:text-text-main hover:bg-surface/60 transition-all active:scale-95 cursor-pointer',
    segmentedItemActive:
      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] lg:text-xs font-semibold bg-surface text-text-main shadow-xs transition-all cursor-pointer',
    headerControl:
      'px-3 py-1.5 bg-surface-muted hover:bg-surface-hover text-text-body rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-2 border border-border-subtle-trans shadow-xs cursor-pointer',
    iconClose:
      'p-2 hover:bg-surface-muted rounded-full transition-colors active:scale-90 text-text-faint hover:text-text-main cursor-pointer',
  },

  // Form controls & inputs
  input: {
    search:
      'w-full pl-9 pr-8 py-2 bg-surface-muted hover:bg-surface-subtle focus:bg-surface text-xs text-text-body placeholder-text-placeholder rounded-xl border border-transparent focus:border-border-main shadow-inner focus:shadow-none transition-all outline-none',
    numberBox:
      'w-full bg-surface border border-border-main text-text-main rounded-xl px-2 py-1.5 text-[10px] font-mono focus:outline-none focus:ring-2 focus:ring-surface-dark/5',
    label:
      'text-[10px] font-black uppercase tracking-[0.2em] text-text-faint ml-1',
    labelMini: 'text-[8px] font-black uppercase tracking-widest text-text-faint',
  },
} as const;
