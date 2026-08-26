// Chunk entry point — see lib/core/chunk-loader.ts. `record` and `pack` ship together
// because packing only ever happens for events `record` produced.
export { record } from '@rrweb/record';
export { pack } from '@rrweb/packer';
