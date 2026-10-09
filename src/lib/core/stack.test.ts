import { describe, expect, it } from 'vitest';
import { parseStackLocations } from './stack';

const APP = 'https://shop.test:8080/assets/app.js';

describe('parseStackLocations', () => {
  it('reads V8 frames with and without a function name, and skips the message and native frames', () => {
    const stack = [
      'TypeError: Cannot read properties of undefined (reading: 1:2)',
      `    at onClick (${APP}:10:5)`,
      '    at Array.forEach (<anonymous>)',
      `    at async loadCart (${APP}:20:7)`,
      `    at new Cart (${APP}:30:9)`,
      `    at ${APP}:40:11`,
    ].join('\n');

    expect(parseStackLocations(stack)).toEqual([
      { file: APP, line: 10, column: 5 },
      { file: APP, line: 20, column: 7 },
      { file: APP, line: 30, column: 9 },
      { file: APP, line: 40, column: 11 },
    ]);
  });

  it('takes the location an eval was called from', () => {
    const stack = `Error: boom\n    at eval (eval at run (${APP}:5:3), <anonymous>:1:7)`;

    expect(parseStackLocations(stack)).toEqual([{ file: APP, line: 5, column: 3 }]);
  });

  it('reads Firefox and Safari frames, including a URL with an @ in it', () => {
    const cdn = 'https://cdn.jsdelivr.net/npm/pkg@1.2.3/dist/index.js';
    const stack = [
      `onClick@${APP}:10:5`,
      `@${cdn}:1:200`,
      'forEach@[native code]',
      `global code@${APP}:2:1`,
      `run@${APP} line 7 > eval:1:4`,
    ].join('\n');

    expect(parseStackLocations(stack)).toEqual([
      { file: APP, line: 10, column: 5 },
      { file: cdn, line: 1, column: 200 },
      { file: APP, line: 2, column: 1 },
      { file: APP, line: 7, column: 0 },
    ]);
  });
});
