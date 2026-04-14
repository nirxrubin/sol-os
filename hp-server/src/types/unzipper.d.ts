declare module 'unzipper' {
  import { Transform } from 'stream';

  export interface Entry extends NodeJS.ReadableStream {
    path: string;
    type: 'File' | 'Directory' | string;
    autodrain(): void;
  }

  export function Parse(): Transform;
}
