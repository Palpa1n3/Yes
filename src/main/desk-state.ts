/** Small bits of live state the desktop widget and taskbar need, reported by the parts of the
 *  app that know them (the renderer, Agent Mode, the updater). */
export const deskState = {
  /** idle / listening / thinking / speaking / executing / error (from the renderer). */
  assistant: 'idle',
  /** Agent Mode is waiting for the user's answer or OK. */
  agentWaiting: false,
  /** Update download in progress (0–100), or null. */
  update: null as number | null,
};

/** Set by index.ts: start/stop telemetry for the window and the desk windows. */
export const deskHooks = { syncTelemetry: (): void => undefined };
