// The page that runs INSIDE the React Native WebView. Bundled (with the core
// engine and its CSS) into a single self-contained HTML string by
// scripts/build-html.mjs — no network, no assets, works offline.
//
// Protocol (JSON messages):
//   RN -> page : window.__qdDispatch({ type, ... })
//   page -> RN : window.ReactNativeWebView.postMessage(JSON.stringify({ type, ... }))

import { createQuickdraw } from '@quickdrawjs/core'
import '@quickdrawjs/core/quickdraw.css'

const post = (msg) => {
  try {
    window.ReactNativeWebView?.postMessage(JSON.stringify(msg))
  } catch (e) {
    // a message that cannot serialize must not take the board down
    console.warn('quickdraw post failed', e)
  }
}

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = reject
    fr.readAsDataURL(blob)
  })

const host = document.getElementById('board')
let board = null
let hideUi = false

const handlers = {
  // first message from RN, carrying the initial props
  init(m) {
    if (board) board.destroy()
    hideUi = !!m.hideUi
    board = createQuickdraw({
      container: host,
      theme: m.theme || 'light',
      grid: m.grid || 'none',
      readonly: !!m.readonly,
      hideUi,
      themeToggle: m.themeToggle !== false,
      gridControl: m.gridControl !== false,
      watermark: m.watermark !== false,
      styles: m.styles || undefined,
      onSave: async (blob, background) => {
        post({ type: 'save', dataUrl: await blobToDataUrl(blob), background })
      },
    })
    if (m.snapshot) {
      board.editor.store.loadSnapshot(m.snapshot, 'remote')
      board.editor.fitContent()
    }
    board.editor.store.listen((diff, source) => post({ type: 'change', diff, source }))
    board.editor.on('selection', () => post({ type: 'selection', ids: [...board.editor.selection] }))
    // the in-board menu can move these too — keep the RN side informed
    board.editor.on('theme', () => {
      host.dataset.qdTheme = board.editor.theme.id
      post({ type: 'theme', theme: board.editor.theme.id })
    })
    board.editor.on('grid', () => post({ type: 'grid', grid: board.editor.grid }))
    post({ type: 'mounted' })
  },
  loadSnapshot(m) {
    board.editor.store.loadSnapshot(m.snapshot, 'remote')
    if (m.fit !== false) board.editor.fitContent()
  },
  applyDiff(m) { board.editor.store.applyDiff(m.diff, 'remote') },
  setTheme(m) {
    board.editor.setTheme(m.theme)
    host.dataset.qdTheme = board.editor.theme.id
  },
  setReadonly(m) {
    board.editor.setReadonly(!!m.readonly)
    board.ui.setHidden(!!m.readonly || hideUi)
  },
  setGrid(m) { board.editor.setGrid(m.grid) },
  setTool(m) { board.editor.setTool(m.tool) },
  setStyle(m) { board.editor.setStyle(m.key, m.value) },
  undo() { board.editor.store.undo() },
  redo() { board.editor.store.redo() },
  clear() { board.editor.clearBoard() },
  fitContent(m) { board.editor.fitContent({ animate: m.animate || 0 }) },
  getSnapshot(m) { post({ type: 'snapshot', id: m.id, snapshot: board.editor.store.getSnapshot() }) },
  async exportPng(m) {
    const blob = await board.editor.exportImage(m.opts || {})
    post({ type: 'export', id: m.id, dataUrl: blob ? await blobToDataUrl(blob) : null })
  },
}

window.__qdDispatch = async (m) => {
  try {
    if (!m || !handlers[m.type]) return
    if (!board && m.type !== 'init') return
    await handlers[m.type](m)
  } catch (e) {
    post({ type: 'error', message: String((e && e.message) || e) })
  }
}

post({ type: 'ready' })
