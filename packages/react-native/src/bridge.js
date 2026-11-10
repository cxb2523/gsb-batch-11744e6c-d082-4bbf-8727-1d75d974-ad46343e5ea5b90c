// The RN side of the WebView message bridge. Pure JS (no react-native
// imports) so the protocol is unit-testable in Node.

/** Encode a command as an injectJavaScript payload for the board page. */
export const encodeDispatch = (msg) => {
  // JSON is valid JS except U+2028/U+2029, which are line terminators in JS
  const json = JSON.stringify(msg)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
  return `window.__qdDispatch(${json}); true;`
}

/**
 * Request/response manager over a one-way `send(js)` channel.
 * Responses arrive via settle(id, value) from the onMessage handler.
 */
export function createBridge(send, { timeout = 10000 } = {}) {
  let seq = 0
  const pending = new Map()
  return {
    post(msg) {
      send(encodeDispatch(msg))
    },
    request(msg) {
      const id = 'r' + ++seq
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          pending.delete(id)
          reject(new Error('quickdraw bridge timeout: ' + msg.type))
        }, timeout)
        pending.set(id, { resolve, t })
        send(encodeDispatch({ ...msg, id }))
      })
    },
    settle(id, value) {
      const p = pending.get(id)
      if (!p) return false
      pending.delete(id)
      clearTimeout(p.t)
      p.resolve(value)
      return true
    },
    dispose() {
      for (const { t } of pending.values()) clearTimeout(t)
      pending.clear()
    },
  }
}
