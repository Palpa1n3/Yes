/** One entry in Alton's action history (Settings › Privacy). */
export interface ActionRecord {
  at: number;
  /** Who did it: an action you approved or asked for, Agent Mode, memory learning… */
  source: 'action' | 'agent' | 'routine' | 'memory' | 'suggestion';
  text: string;
  ok: boolean;
}
