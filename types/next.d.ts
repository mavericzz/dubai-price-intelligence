// Minimal Next.js type shim for standalone type-checking in this library workspace.
// Replace with the real `next` package when integrating into a Next.js project.
declare module 'next' {
  import type { IncomingMessage, ServerResponse } from 'http';

  export type NextApiRequest = IncomingMessage & {
    query: Record<string, string | string[] | undefined>;
    body: unknown;
    cookies: Record<string, string>;
    method?: string;
  };

  export type NextApiResponse<T = unknown> = ServerResponse & {
    status(code: number): NextApiResponse<T>;
    json(body: T): void;
    send(body: unknown): void;
    setHeader(name: string, value: string | string[]): NextApiResponse<T>;
  };
}
