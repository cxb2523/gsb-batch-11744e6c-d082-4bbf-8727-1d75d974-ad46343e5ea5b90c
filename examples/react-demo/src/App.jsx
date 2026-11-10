import { useEffect, useRef, useState } from 'react'
import { Quickdraw, useQuickdrawStore } from '@quickdrawjs/react'
import '@quickdrawjs/core/quickdraw.css'

const STORAGE_KEY = 'quickdraw-react-demo'

const load = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : undefined
  } catch {
    return undefined
  }
}

export default function App() {
  const [theme, setTheme] = useState('light')
  const [grid, setGrid] = useState('lines')
  const boardRef = useRef(null)
  const store = useQuickdrawStore(load())

  // debounced persistence
  useEffect(() => {
    let t = 0
    const unsub = store.listen(() => {
      clearTimeout(t)
      t = setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store.getSnapshot()))
      }, 500)
    })
    return () => { clearTimeout(t); unsub() }
  }, [store])

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Quickdraw
        ref={boardRef}
        store={store}
        theme={theme}
        grid={grid}
        autoFit={false}
        // the board menu can move these too — keep this app's state in step
        onThemeChange={setTheme}
        onGridChange={setGrid}
        onMount={(editor) => {
          if (store.size) editor.fitContent()
          window.editor = editor // handy for devtools poking
        }}
      />
      <button
        onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        style={{
          position: 'fixed', top: 10, right: 10, zIndex: 50,
          font: '500 13px system-ui', padding: '6px 12px', borderRadius: 999,
          border: '1px solid rgba(0,0,0,0.15)', background: '#fff', cursor: 'pointer',
        }}
      >
        {theme === 'light' ? 'dark' : 'light'}
      </button>
    </div>
  )
}
