import { describe, expect, it, vi } from 'vitest';
import {
  SCREEN_TASK,
  blockedCombo,
  keyCode,
  looksLikeCardNumber,
  parseAgentRequest,
  parseCombo,
  shotSize,
  toScreen,
  type AgentStatus,
} from '@shared/agent';
import { AgentRunner, pruneImages, type AgentDeps } from '../../src/main/services/agent-runner';
import { WinInput, type InputBackend } from '../../src/main/services/agent-input-win';

describe('agent phrases', () => {
  it('spots requests and pulls out the task', () => {
    expect(parseAgentRequest('handle this for me')).toBe(SCREEN_TASK);
    expect(parseAgentRequest('Handle this for me: sort my desktop')).toBe('sort my desktop');
    expect(parseAgentRequest('can you handle it and rename these files')).toBe(
      'rename these files',
    );
    expect(parseAgentRequest('take over and fill in this form')).toBe('fill in this form');
    expect(parseAgentRequest('agent mode: open spotify and play jazz')).toBe(
      'open spotify and play jazz',
    );
    expect(parseAgentRequest('do this for me.')).toBe(SCREEN_TASK);
    expect(parseAgentRequest('how do I handle stress')).toBeNull();
    expect(parseAgentRequest('what is agent mode')).toBeNull();
  });
});

describe('keys', () => {
  it('maps names and combos to virtual keys', () => {
    expect(keyCode('Return')).toBe(0x0d);
    expect(keyCode('a')).toBe(0x41);
    expect(keyCode('F5')).toBe(0x74);
    expect(parseCombo('ctrl+shift+s')).toEqual([0x11, 0x10, 0x53]);
    expect(parseCombo('alt+Tab')).toEqual([0x12, 0x09]);
    expect(parseCombo('ctrl++')).toEqual([0x11, 0xbb]);
    expect(parseCombo('ctrl+nonsense')).toBeNull();
  });
  it('blocks lock and ctrl-alt-del', () => {
    expect(blockedCombo(parseCombo('ctrl+alt+delete') ?? [])).toMatch(/Delete/);
    expect(blockedCombo(parseCombo('super+l') ?? [])).toMatch(/Win\+L/);
    expect(blockedCombo(parseCombo('ctrl+l') ?? [])).toBeNull();
  });
});

describe('safety + geometry', () => {
  it('recognises card numbers only when Luhn-valid', () => {
    expect(looksLikeCardNumber('4111 1111 1111 1111')).toBe(true);
    expect(looksLikeCardNumber('4111 1111 1111 1112')).toBe(false);
    expect(looksLikeCardNumber('call 07700 900123')).toBe(false);
  });
  it('scales screenshots and maps points back', () => {
    expect(shotSize({ width: 2560, height: 1440 })).toEqual({ width: 1280, height: 720 });
    expect(shotSize({ width: 1920, height: 1200 })).toEqual({ width: 1280, height: 800 });
    expect(toScreen(640, 360, { width: 1280, height: 720 }, { width: 2560, height: 1440 })).toEqual(
      {
        x: 1280,
        y: 720,
      },
    );
    expect(toScreen(5000, -3, { width: 1280, height: 720 }, { width: 2560, height: 1440 })).toEqual(
      {
        x: 2558,
        y: 0,
      },
    );
  });
});

describe('pruneImages', () => {
  it('keeps only the newest screenshots once there are too many', () => {
    const shot = {
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: 'x' },
    };
    const msgs = Array.from({ length: 10 }, (_, i) => ({
      role: 'user' as const,
      content: [{ type: 'tool_result' as const, tool_use_id: `t${i}`, content: [shot] }],
    }));
    const out = pruneImages(msgs, 3, 8);
    const kept = out.filter((m) => JSON.stringify(m).includes('"image"')).length;
    expect(kept).toBe(3);
    expect(JSON.stringify(out[0])).toContain('earlier screenshot removed');
    const few = msgs.slice(0, 5);
    expect(pruneImages(few, 3, 8)).toBe(few);
  });
});

function fakeInput(): InputBackend & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    move: async (x, y) => void log.push(`move ${x},${y}`),
    button: async (b, d) => void log.push(`${b} ${d ? 'down' : 'up'}`),
    wheel: async (v, h) => void log.push(`wheel ${v},${h}`),
    key: async (vk, d) => void log.push(`key ${vk} ${d ? 'down' : 'up'}`),
    type: async (t) => void log.push(`type ${t}`),
    cursor: async () => ({ x: 100, y: 50 }),
    close: () => undefined,
  };
}

type Block = Record<string, unknown>;
function scripted(turns: Block[][]) {
  const requests: Array<{ messages: unknown[] }> = [];
  let i = 0;
  const client = {
    beta: {
      messages: {
        create: vi.fn(async (req: { messages: unknown[] }) => {
          requests.push(JSON.parse(JSON.stringify(req)) as { messages: unknown[] });
          const content = turns[i++] ?? [{ type: 'text', text: 'All done.' }];
          return {
            content,
            stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
          };
        }),
      },
    },
  };
  return { client, requests };
}

function deps(client: unknown, input = fakeInput(), over: Partial<AgentDeps> = {}): AgentDeps {
  return {
    client: async () => client as never,
    model: () => 'claude-sonnet-5-5',
    names: () => ({ assistant: 'Alton', user: 'Jack' }),
    screen: {
      size: () => ({ width: 2560, height: 1440 }),
      shot: async () => ({ base64: 'AAAA', width: 1280, height: 720 }),
      zoom: async () => ({ base64: 'BBBB', width: 400, height: 300 }),
    },
    input,
    confirm: async () => true,
    ask: async () => 'blue',
    onStatus: () => undefined,
    settleMs: 0,
    ...over,
  };
}

const use = (id: string, name: string, input: Block = {}, computer = true): Block => ({
  type: 'tool_use',
  id,
  name,
  input,
  ...(computer ? { toolset_name: 'computer' } : {}),
});

describe('AgentRunner', () => {
  it('clicks at scaled coordinates, types, and finishes with a summary', async () => {
    const { client, requests } = scripted([
      [
        { type: 'text', text: 'Opening the search box.' },
        use('a', 'left_click', { coordinate: [640, 360] }),
      ],
      [use('b', 'type', { text: 'hello' }), use('c', 'key', { text: 'Return' })],
      [use('d', 'agent_done', { summary: 'Searched for hello.', success: true }, false)],
    ]);
    const input = fakeInput();
    const r = new AgentRunner(deps(client, input));
    const s = await r.run('search for hello');
    expect(s.state).toBe('done');
    expect(s.result).toBe('Searched for hello.');
    expect(input.log.slice(0, 3)).toEqual(['move 1280,720', 'left down', 'left up']);
    expect(input.log).toContain('type hello');
    expect(input.log).toContain('key 13 down');
    // Every computer result echoes the toolset name.
    const second = requests[1]?.messages.at(-1) as { content: Block[] };
    expect(second.content[0]).toMatchObject({
      tool_use_id: 'a',
      toolset_name: 'computer',
      content: 'OK',
    });
  });

  it('answers screenshots with an image and cursor_position in screenshot units', async () => {
    const { client, requests } = scripted([
      [use('a', 'screenshot'), use('b', 'cursor_position')],
      [use('z', 'agent_done', { summary: 'ok', success: true }, false)],
    ]);
    await new AgentRunner(deps(client)).run('look');
    const res = (requests[1]?.messages.at(-1) as { content: Block[] }).content;
    expect(JSON.stringify(res[0])).toContain('"image"');
    expect(res[1]).toMatchObject({ content: 'X=50, Y=25' });
  });

  it('stops the batch at the first failure', async () => {
    const { client, requests } = scripted([
      [
        use('a', 'key', { text: 'ctrl+alt+delete' }),
        use('b', 'left_click', { coordinate: [1, 1] }),
      ],
      [use('z', 'agent_done', { summary: 'ok', success: true }, false)],
    ]);
    const input = fakeInput();
    await new AgentRunner(deps(client, input)).run('x');
    const res = (requests[1]?.messages.at(-1) as { content: Block[] }).content;
    expect(res[0]).toMatchObject({ is_error: true });
    expect(res[1]).toMatchObject({
      is_error: true,
      content: expect.stringMatching(/Not executed/),
    });
    expect(input.log).not.toContain('left down');
  });

  it('never types card numbers', async () => {
    const { client, requests } = scripted([
      [use('a', 'type', { text: '4111 1111 1111 1111' })],
      [use('z', 'agent_done', { summary: 'ok', success: true }, false)],
    ]);
    const input = fakeInput();
    await new AgentRunner(deps(client, input)).run('pay');
    expect(input.log.some((l) => l.startsWith('type'))).toBe(false);
    expect(JSON.stringify(requests[1]?.messages.at(-1))).toMatch(/card number/);
  });

  it('asks the user to confirm risky steps and passes on a denial', async () => {
    const { client, requests } = scripted([
      [use('a', 'confirm_action', { action: 'Buy the shoes for £40' }, false)],
      [use('z', 'agent_done', { summary: 'Did not buy.', success: false }, false)],
    ]);
    const statuses: AgentStatus[] = [];
    const confirm = vi.fn(async () => false);
    await new AgentRunner(
      deps(client, fakeInput(), { confirm, onStatus: (s) => statuses.push(s) }),
    ).run('buy shoes');
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'confirm', text: 'Buy the shoes for £40' }),
    );
    expect(statuses.some((s) => s.state === 'waiting')).toBe(true);
    expect(JSON.stringify(requests[1]?.messages.at(-1))).toMatch(/denied/);
  });

  it('can be stopped, and lets go of held keys', async () => {
    let runner: AgentRunner | null = null;
    const { client } = scripted([
      [use('a', 'wait', { duration: 5 })],
      [use('b', 'left_click', { coordinate: [1, 1] })],
    ]);
    const input = fakeInput();
    runner = new AgentRunner(deps(client, input));
    const p = runner.run('wait');
    setTimeout(() => runner?.stop(), 50);
    const s = await p;
    expect(s.state).toBe('stopped');
    expect(input.log).toContain('key 17 up');
    expect(input.log.some((l) => l === 'left down')).toBe(false);
  });

  it('needs an API key', async () => {
    const s = await new AgentRunner({ ...deps(null), client: async () => null }).run('x');
    expect(s.state).toBe('error');
    expect(s.result).toMatch(/API key/);
  });

  it('lets Esc through while pressing it itself', async () => {
    const { client } = scripted([
      [use('a', 'key', { text: 'Escape' })],
      [use('z', 'agent_done', { summary: 'ok', success: true }, false)],
    ]);
    const escape = vi.fn();
    await new AgentRunner(deps(client, fakeInput(), { escape })).run('x');
    expect(escape.mock.calls).toEqual([[true], [false]]);
  });
});

describe('WinInput protocol', () => {
  it('matches replies to commands in order', async () => {
    const written: string[] = [];
    const listeners: Record<string, (d: string) => void> = {};
    let w: WinInput | null = null;
    const fake = {
      stdout: {
        setEncoding: () => undefined,
        on: (_: string, fn: (d: string) => void) => (listeners.data = fn),
      },
      stdin: {
        write: (line: string) => {
          written.push(line);
          setTimeout(() => w?.feed(line.startsWith('pos') ? 'pos 12 34\n' : 'ok\n'), 1);
        },
        end: () => undefined,
      },
      on: () => undefined,
      kill: () => undefined,
    };
    w = new WinInput(() => {
      setTimeout(() => w?.feed('ready\n'), 1);
      return fake as never;
    });
    await w.move(10.4, 20.6);
    expect(await w.cursor()).toEqual({ x: 12, y: 34 });
    await w.key(0x25, true);
    await w.type('hi');
    expect(written).toEqual([
      'move 10 21\n',
      'pos\n',
      'key 37 down 1\n',
      `type ${Buffer.from('hi').toString('base64')}\n`,
    ]);
  });
});

describe('pause and resume', () => {
  it('waits between steps while paused, then carries on', async () => {
    const { client, requests } = scripted([
      [use('a', 'wait', { duration: 0.2 })],
      [use('z', 'agent_done', { summary: 'ok', success: true }, false)],
    ]);
    const states: string[] = [];
    const r = new AgentRunner(deps(client, fakeInput(), { onStatus: (s) => states.push(s.state) }));
    const p = r.run('x');
    setTimeout(() => r.pause(true), 20);
    await new Promise((res) => setTimeout(res, 400));
    expect(r.get().state).toBe('paused');
    expect(requests.length).toBe(1);
    r.pause(false);
    const s = await p;
    expect(s.state).toBe('done');
    expect(JSON.stringify(requests[1]?.messages.at(-1))).toMatch(/resumed/);
  });

  it('can be stopped while paused', async () => {
    const { client } = scripted([[use('a', 'wait', { duration: 0.1 })]]);
    const r = new AgentRunner(deps(client));
    const p = r.run('x');
    r.pause(true);
    setTimeout(() => {
      r.stop();
    }, 300);
    expect((await p).state).toBe('stopped');
  });
});
