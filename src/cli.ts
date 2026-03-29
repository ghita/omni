import { createCliProgram } from './cliCommand';

const program = createCliProgram();

program.parseAsync(process.argv);
