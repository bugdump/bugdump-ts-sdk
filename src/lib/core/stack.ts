export interface StackLocation {
  file: string;
  line: number;
  column: number;
}

const LOCATION = /^(.+):(\d+):(\d+)$/;
// The innermost parenthesized location of a V8 line, which for an eval frame
// (`eval at fn (url:1:2), <anonymous>:3:4`) is where the eval was called.
const V8_PARENTHESIZED = /\(([^()\s]+:\d+:\d+)\)/;
const FIREFOX_EVAL = /^(.+?) line (\d+) > (?:eval|Function)/;

function toLocation(text: string): StackLocation | null {
  const match = LOCATION.exec(text);
  if (!match) return null;
  return { file: match[1]!, line: Number(match[2]), column: Number(match[3]) };
}

function parseLine(raw: string): StackLocation | null {
  const line = raw.trim();

  if (line.startsWith('at ')) {
    const parenthesized = V8_PARENTHESIZED.exec(line);
    return toLocation(parenthesized ? parenthesized[1]! : line.slice(3));
  }

  // Firefox and Safari: `fn@url:line:col`. A URL can hold an `@` (`pkg@1.2.3`), a
  // function name practically never does, so the first one splits them.
  const at = line.indexOf('@');
  if (at === -1) return null;
  const location = line.slice(at + 1);
  const evalOrigin = FIREFOX_EVAL.exec(location);
  if (evalOrigin) return { file: evalOrigin[1]!, line: Number(evalOrigin[2]), column: 0 };
  return toLocation(location);
}

/** The file locations of a V8, Firefox or Safari stack, top frame first. Lines without one are skipped. */
export function parseStackLocations(stack: string): StackLocation[] {
  const locations: StackLocation[] = [];
  for (const line of stack.split('\n')) {
    const location = parseLine(line);
    if (location) locations.push(location);
  }
  return locations;
}
