import type { Server } from "node:http";

/**
 * Ports the SSRF guard allows (guard.ts R1b) that test servers may bind to.
 * Kept in one place so the guarded-fetch tests bind the fixtures to ports the
 * REAL guard accepts — the tests exercise the guard, they do not disable it.
 *
 * With only two allowed ports, tests MUST close their servers and release the
 * port in `afterEach` before the next test claims it.
 */
const ALLOWED_TEST_PORTS = [8443, 8080] as const;

/** Ports currently claimed by live test servers in this process. */
const claimed = new Set<number>();

/**
 * Listens `server` on the next free SSRF-allowed port.
 *
 * ⚠️ RETRY ON WINDOWS TIME_WAIT. `server.close()` completes when the server
 * stops accepting, but the OS can hold the socket in TIME_WAIT briefly; a
 * naive single listen attempt races that. Retrying the SAME port handles it
 * without widening the port set.
 */
export function nextAllowedTestPort(server: Server): Promise<number> {
  const attempt = (portIndex: number, triesLeft: number): Promise<number> =>
    new Promise((resolve, reject) => {
      if (portIndex >= ALLOWED_TEST_PORTS.length) {
        reject(new Error("no free allowed test port; close servers between tests"));
        return;
      }
      const port = ALLOWED_TEST_PORTS[portIndex]!;
      const onError = (error: Error) => {
        server.off("listening", onListening);
        if (triesLeft > 0 && (error as NodeJS.ErrnoException).code === "EADDRINUSE") {
          setTimeout(() => attempt(portIndex, triesLeft - 1).then(resolve, reject), 100);
        } else {
          // Move on to the next allowed port.
          attempt(portIndex + 1, 2).then(resolve, reject);
        }
      };
      const onListening = () => {
        server.off("error", onError);
        claimed.add(port);
        resolve(port);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, "127.0.0.1");
    });
  return attempt(0, 3);
}

/** Marks a port free again after its server has closed. */
export function releaseTestPort(port: number): void {
  claimed.delete(port);
}
