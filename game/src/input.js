// ISLAND COURIER — keyboard + mouse input.
// Keys: W/S or Up/Down throttle, A/D or Left/Right bank, I/K pitch up/down,
// R/F also pitch (documented on the title screen), Space confirm / drop,
// P pause, M mute, R restart. Mouse clicks menu buttons.

export function createInput() {
  const keys = new Set();
  const pressed = new Set(); // edge-triggered, consumed by the game each frame
  const input = {
    keys, pressed,
    throttleUp: false, throttleDown: false,
    bankLeft: false, bankRight: false,
    pitchUp: false, pitchDown: false,
    muted: false,
  };

  const KEYMAP = {
    KeyW: 'throttleUp', ArrowUp: 'throttleUp',
    KeyS: 'throttleDown', ArrowDown: 'throttleDown',
    KeyA: 'bankLeft', ArrowLeft: 'bankLeft',
    KeyD: 'bankRight', ArrowRight: 'bankRight',
    KeyI: 'pitchUp',
    KeyK: 'pitchDown',
  };

  function refresh() {
    for (const action of Object.values(KEYMAP)) input[action] = false;
    for (const code of keys) {
      const action = KEYMAP[code];
      if (action) input[action] = true;
    }
  }

  window.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;
    keys.add(ev.code);
    pressed.add(ev.code);
    if (ev.code === 'Space') ev.preventDefault();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.code)) ev.preventDefault();
    refresh();
  });
  window.addEventListener('keyup', (ev) => {
    keys.delete(ev.code);
    refresh();
  });
  window.addEventListener('blur', () => { keys.clear(); refresh(); });

  input.wasPressed = (code) => pressed.has(code);
  input.endFrame = () => pressed.clear();
  input.isDown = (code) => keys.has(code);
  return input;
}
