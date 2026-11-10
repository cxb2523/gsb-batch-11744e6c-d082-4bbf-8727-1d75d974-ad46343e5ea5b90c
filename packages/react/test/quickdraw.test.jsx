// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRef } from 'react'
import { render, act, cleanup } from '@testing-library/react'
import { Quickdraw, useQuickdrawStore, Store, newId } from '../src/index.js'

const rect = (id) => ({
  id, typeName: 'shape', type: 'geo', x: 0, y: 0, rot: 0, z: 1,
  props: { geo: 'rectangle', w: 50, h: 50, color: 'blue', size: 'm', dash: 'solid', fill: 'none', font: 'draw' },
})

describe('<Quickdraw />', () => {
  it('mounts an editor with toolbar and cleans up on unmount', () => {
    const onMount = vi.fn()
    const { container, unmount } = render(<Quickdraw onMount={onMount} />)
    expect(onMount).toHaveBeenCalledTimes(1)
    const [editor, ui] = onMount.mock.calls[0]
    expect(editor.tool).toBe('draw')
    expect(ui.setHidden).toBeTypeOf('function')
    expect(container.querySelectorAll('canvas').length).toBe(2)
    expect(container.querySelector('.qd-dock')).toBeTruthy()
    unmount()
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('fires onChange with diffs and onSelectionChange with ids', () => {
    const onChange = vi.fn()
    const onSelectionChange = vi.fn()
    let editor
    render(
      <Quickdraw
        onMount={(e) => { editor = e }}
        onChange={onChange}
        onSelectionChange={onSelectionChange}
      />
    )
    act(() => {
      editor.store.put(rect(newId()))
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    const [diff, source] = onChange.mock.calls[0]
    expect(source).toBe('user')
    expect(Object.keys(diff.added).length).toBe(1)

    act(() => editor.selectAll())
    expect(onSelectionChange).toHaveBeenCalled()
    expect(onSelectionChange.mock.calls.at(-1)[0].length).toBe(1)
  })

  it('loads a snapshot on mount', () => {
    const snap = { document: { store: { r1: rect('r1') } } }
    let editor
    render(<Quickdraw snapshot={snap} onMount={(e) => { editor = e }} />)
    expect(editor.store.size).toBe(1)
    expect(editor.store.get('r1').props.color).toBe('blue')
    expect(editor.store.canUndo).toBe(false)
  })

  it('renders an external store and live-switches theme/readonly props', () => {
    const store = new Store()
    store.put(rect('r1'), 'remote')
    const ref = createRef()
    const { rerender, container } = render(
      <Quickdraw ref={ref} store={store} theme="light" />
    )
    expect(ref.current.editor.store).toBe(store)
    expect(ref.current.editor.theme.id).toBe('light')

    rerender(<Quickdraw ref={ref} store={store} theme="dark" readonly />)
    expect(ref.current.editor.theme.id).toBe('dark')
    expect(ref.current.editor.readonly).toBe(true)
    expect(container.querySelector('.qd-ui').classList.contains('qd-hidden')).toBe(true)

    rerender(<Quickdraw ref={ref} store={store} theme="dark" />)
    expect(ref.current.editor.readonly).toBe(false)
    expect(container.querySelector('.qd-ui').classList.contains('qd-hidden')).toBe(false)
  })

  it('drives the grid prop and reports in-board switches back', () => {
    const onThemeChange = vi.fn()
    const onGridChange = vi.fn()
    const ref = createRef()
    const { rerender, container } = render(
      <Quickdraw ref={ref} grid="lines" onThemeChange={onThemeChange} onGridChange={onGridChange} />
    )
    expect(ref.current.editor.grid).toBe('lines')

    rerender(
      <Quickdraw ref={ref} grid="dots" onThemeChange={onThemeChange} onGridChange={onGridChange} />
    )
    expect(ref.current.editor.grid).toBe('dots')
    expect(onGridChange).toHaveBeenCalledWith('dots', ref.current.editor)

    // the board menu's own switches report back so host state can follow
    act(() => {
      container.querySelector('.qd-dock button[data-name="menu"]').click()
    })
    const themeBtns = [...container.querySelectorAll('.qd-menu-row')]
      .find((r) => r.textContent.trim().startsWith('Theme'))
      .querySelectorAll('.qd-seg-btn')
    act(() => { themeBtns[1].click() })
    expect(onThemeChange).toHaveBeenCalledWith('dark', ref.current.editor)
    expect(container.firstChild.dataset.qdTheme).toBe('dark')
  })

  it('two components sharing one store see the same document', () => {
    const store = new Store()
    const a = createRef(), b = createRef()
    render(
      <div>
        <Quickdraw ref={a} store={store} />
        <Quickdraw ref={b} store={store} readonly />
      </div>
    )
    act(() => {
      a.current.editor.store.put(rect('shared'))
    })
    expect(b.current.editor.store.get('shared')).toBeTruthy()
  })

  it('useQuickdrawStore keeps a stable, optionally-seeded store', () => {
    let store1, store2
    function Probe() {
      const s = useQuickdrawStore({ document: { store: { r1: rect('r1') } } })
      store1 ||= s
      store2 = s
      return null
    }
    const { rerender } = render(<Probe />)
    rerender(<Probe />)
    expect(store1).toBe(store2)
    expect(store1.size).toBe(1)
  })

  afterEach(cleanup)
})
