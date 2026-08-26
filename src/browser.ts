import { Bugdump } from './lib/client';
import { runAutoInit } from './lib/auto-init';
import { installCommandInterface } from './lib/core/command-queue';

runAutoInit();
// After auto-init, so commands queued behind a data-api-key tag find the instance.
installCommandInterface();

export default Bugdump;
