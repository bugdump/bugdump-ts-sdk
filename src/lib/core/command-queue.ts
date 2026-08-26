import { Bugdump } from '../client';
import type { BugdumpConfig } from '../types';

/**
 * The command interface behind the install snippet's queue stub:
 *
 *   window.bugdump = window.bugdump || function () {
 *     (window.bugdump.q = window.bugdump.q || []).push(arguments);
 *   };
 *
 * The stub lets pages call `bugdump('init', {...})` before the async script has
 * loaded; calls accumulate in `window.bugdump.q`. When the SDK boots it replays
 * the queue in order and swaps the stub for a live dispatcher, so the same
 * `bugdump(...)` calls keep working after load.
 */

interface CommandStub {
  (...args: unknown[]): void;
  q?: ArrayLike<unknown>[];
}

const INSTANCE_COMMANDS = [
  'identify',
  'reset',
  'setContext',
  'open',
  'close',
  'identifyTask',
  'clearTask',
  'destroy',
] as const;

type InstanceCommand = (typeof INSTANCE_COMMANDS)[number];

function isInstanceCommand(command: string): command is InstanceCommand {
  return (INSTANCE_COMMANDS as readonly string[]).includes(command);
}

export function dispatchCommand(command: unknown, args: unknown[]): void {
  if (typeof command !== 'string') {
    console.warn('[Bugdump] Ignored bugdump(...) call: the first argument must be a command name.');
    return;
  }

  if (command === 'init') {
    Bugdump.init(args[0] as BugdumpConfig);
    return;
  }

  if (!isInstanceCommand(command)) {
    console.warn(`[Bugdump] Unknown command "${command}".`);
    return;
  }

  const instance = Bugdump.getInstance();
  if (!instance) {
    console.warn(`[Bugdump] Command "${command}" ignored: call bugdump('init', { apiKey }) first.`);
    return;
  }

  (instance[command] as (...commandArgs: unknown[]) => void).apply(instance, args);
}

export function installCommandInterface(): void {
  if (typeof window === 'undefined') return;

  const host = window as Window & { bugdump?: CommandStub };
  const queued = typeof host.bugdump === 'function' && Array.isArray(host.bugdump.q) ? [...host.bugdump.q] : [];

  host.bugdump = (...args: unknown[]) => {
    dispatchCommand(args[0], args.slice(1));
  };

  for (const call of queued) {
    // The stub pushes `arguments` objects; a queued call must not break the ones after it.
    const list = Array.prototype.slice.call(call) as unknown[];
    try {
      dispatchCommand(list[0], list.slice(1));
    } catch (error) {
      console.error('[Bugdump] Queued command failed:', error);
    }
  }
}
