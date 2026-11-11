declare module 'cloudflare:workers' {
  export function waitUntil(work: Promise<unknown>): void;
}

declare namespace App {
  interface PageState {
    /** Set on the history entry a sheet opened, so going back closes it */
    sheet?: boolean;
  }
}
