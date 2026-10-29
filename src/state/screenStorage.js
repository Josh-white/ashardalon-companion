// On the #screens test page each pane is the app in a frame with ?screen=<name>. Every
// frame shares the browser's storage, so each would be the same iPad. With a screen name,
// this frame keeps its own copy of everything it remembers (device id, seat, sound...)
// under keys starting "screen:<name>:", and acts as a device of its own. Imported first
// in main.jsx, before anything reads storage.
export const SCREEN_PREFIX = 'screen:'

export function screenName(search = window.location.search) {
  try {
    return new URLSearchParams(search).get('screen')
  } catch {
    return null
  }
}

const name = typeof window === 'undefined' ? null : screenName()
if (name) {
  const prefix = `${SCREEN_PREFIX}${name}:`
  const proto = window.Storage.prototype
  const { getItem, setItem, removeItem } = proto
  proto.getItem = function (key) {
    return getItem.call(this, prefix + key)
  }
  proto.setItem = function (key, value) {
    return setItem.call(this, prefix + key, value)
  }
  proto.removeItem = function (key) {
    return removeItem.call(this, prefix + key)
  }
  // Only the big screen pane plays sound unless one is switched on, so the panes don't
  // all roar and narrate at once.
  try {
    if (name !== 'Big screen' && window.localStorage.getItem('ashardalon-companion/sound') === null) {
      window.localStorage.setItem('ashardalon-companion/sound', 'off')
    }
  } catch {
    // Storage blocked: the pane keeps the usual sound setting.
  }
}
