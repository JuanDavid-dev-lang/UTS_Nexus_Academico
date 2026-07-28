import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { http, onSessionExpired, setServerUrl } from '@/core/api/http-client';
import { tokenService } from '@/core/auth/token.service';
import { AppError } from '@/core/api/errors';

/**
 * HTTP client behaviour under authentication failures.
 *
 * These are the cases the v1 client got wrong: it stored a refresh token and
 * never used it, so an expired session surfaced as an unexplained error in
 * every widget at once.
 */

const SERVER = 'http://127.0.0.1:4000';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const listSchema = z.object({ ok: z.literal(true), items: z.array(z.string()) });

beforeEach(async () => {
  sessionStorage.clear();
  tokenService.__resetForTests();
  setServerUrl(SERVER);
  await tokenService.set({ accessToken: 'access-old', refreshToken: 'refresh-1' });
});

describe('token refresh', () => {
  it('refreshes once and retries the original request after a 401', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/auth/refresh')) {
        return jsonResponse({ ok: true, accessToken: 'access-new', refreshToken: 'refresh-2' });
      }
      // First attempt fails with an expired token, the retry succeeds.
      return fetchMock.mock.calls.length <= 1
        ? jsonResponse({ ok: false, message: 'expired' }, 401)
        : jsonResponse({ ok: true, items: ['a'] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await http.get('/students', { schema: listSchema });

    expect(result.items).toEqual(['a']);
    expect(tokenService.getAccessToken()).toBe('access-new');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/auth/refresh'))).toHaveLength(1);
  });

  it('issues a single refresh for concurrent 401s instead of one per request', async () => {
    let refreshed = false;
    let refreshCalls = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        // A real rotation invalidates the previous refresh token, so a second
        // concurrent call here would fail in production.
        await new Promise((resolve) => setTimeout(resolve, 10));
        refreshed = true;
        return jsonResponse({ ok: true, accessToken: 'access-new', refreshToken: 'refresh-2' });
      }

      return refreshed
        ? jsonResponse({ ok: true, items: ['ok'] })
        : jsonResponse({ ok: false }, 401);
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await Promise.all([
      http.get('/students', { schema: listSchema }),
      http.get('/subjects', { schema: listSchema }),
      http.get('/grades', { schema: listSchema }),
    ]);

    expect(results).toHaveLength(3);
    expect(refreshCalls).toBe(1);
  });

  it('clears the session and notifies once the refresh token is also rejected', async () => {
    const listener = vi.fn();
    const unsubscribe = onSessionExpired(listener);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ok: false, message: 'invalid' }, 401)),
    );

    await expect(http.get('/students', { schema: listSchema })).rejects.toThrow(AppError);

    expect(tokenService.getAccessToken()).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});

describe('response validation', () => {
  it('rejects a response that does not match the schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ok: true, items: [{ unexpected: true }] })),
    );

    await expect(http.get('/students', { schema: listSchema })).rejects.toMatchObject({
      kind: 'contract',
    });
  });

  it('maps a 403 to a forbidden error without retrying', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: false, message: 'Forbidden' }, 403));
    vi.stubGlobal('fetch', fetchMock);

    await expect(http.get('/students', { schema: listSchema })).rejects.toMatchObject({
      kind: 'forbidden',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('query building', () => {
  it('omits empty query parameters instead of sending blanks', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
      jsonResponse({ ok: true, items: [] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await http.get('/grades', {
      schema: listSchema,
      query: { period: '2026-1', subjectId: undefined, groupId: '' },
    });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('period=2026-1');
    expect(url).not.toContain('subjectId');
    expect(url).not.toContain('groupId');
  });
});
