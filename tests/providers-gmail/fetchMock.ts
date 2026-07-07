/**
 * Queue-based fetch mock for the GmailProvider tests. The mock is injected
 * through the provider's `fetchFn` option — never installed globally — and
 * builds plain in-memory Response objects, so no test ever opens a socket
 * (spec: user-stories/typescript_gmail_proxy.md).
 */

export interface RecordedCall {
  url: string;
  init?: RequestInit;
}

export interface FetchMock {
  /** Inject as the provider's `fetchFn`. Throws if called with nothing queued. */
  fn: typeof fetch;
  /** Every call the provider made, in order. */
  calls: RecordedCall[];
  /** Queue a JSON response (default status 200). Chainable. */
  respondJson(body: unknown, status?: number): FetchMock;
  /** Queue a non-JSON (text/html) response. Chainable. */
  respondText(text: string, status?: number): FetchMock;
  /** Queue a transport failure: the fetch promise rejects. Chainable. */
  reject(error: unknown): FetchMock;
}

export function createFetchMock(): FetchMock {
  const calls: RecordedCall[] = [];
  const queue: Array<() => Promise<Response>> = [];

  const mock: FetchMock = {
    calls,
    fn: (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(input), init });
      const next = queue.shift();
      if (!next) {
        throw new Error(`fetch mock: no queued response for ${String(input)}`);
      }
      return next();
    }) as typeof fetch,
    respondJson(body: unknown, status = 200): FetchMock {
      queue.push(() =>
        Promise.resolve(
          new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      );
      return mock;
    },
    respondText(text: string, status = 200): FetchMock {
      queue.push(() =>
        Promise.resolve(
          new Response(text, { status, headers: { 'content-type': 'text/html' } }),
        ),
      );
      return mock;
    },
    reject(error: unknown): FetchMock {
      queue.push(() => Promise.reject(error));
      return mock;
    },
  };
  return mock;
}

/** Parse a recorded POST call's JSON body. */
export function parseBody(call: RecordedCall): unknown {
  return JSON.parse(String(call.init?.body));
}

/** The content-type header of a recorded call, however headers were passed. */
export function contentTypeOf(call: RecordedCall): string | null {
  return new Headers(call.init?.headers).get('content-type');
}
