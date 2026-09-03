import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectStore, storageConfigFromEnv, type StorageConfig } from "../index";

/**
 * OBJECT STORE — §4.5, §10.6.
 *
 * ⚠️ THIS PACKAGE HAD NO TESTS AT ALL (0% coverage) while holding two controls
 * that are only controls if they hold every time:
 *
 *   1. NOTHING may make an object public. A screenshot is a picture of a
 *      customer's client's website; the keys encode ids and are guessable by
 *      design, so a single `ACL: "public-read"` makes all of them world
 *      readable to anyone who guesses one.
 *   2. `deletePrefix` must PAGINATE. `ListObjectsV2` returns at most 1000 keys,
 *      and an agency with a year of daily scans has more. An unpaginated sweep
 *      leaves the remainder behind and makes a deletion request only LOOK
 *      honoured — which is the worst possible failure for a retention control.
 *
 * The S3 client is stubbed rather than mocked away: the assertions are about
 * the commands we send, which is exactly what the real service would see.
 */

interface SentCommand {
  name: string;
  input: Record<string, unknown>;
}

function storeWithStub(responses: unknown[] = []) {
  const sent: SentCommand[] = [];
  const store = new ObjectStore(config());

  const queue = [...responses];
  // @ts-expect-error — reaching into the private client is the point: these
  // assertions are about the commands that leave this module.
  store.client = {
    send: vi.fn(async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      sent.push({ name: command.constructor.name, input: command.input });
      return queue.shift() ?? {};
    }),
  };

  return { store, sent };
}

function config(overrides: Partial<StorageConfig> = {}): StorageConfig {
  return {
    region: "us-east-1",
    bucket: "test-bucket",
    accessKeyId: "key",
    secretAccessKey: "secret",
    forcePathStyle: true,
    signedUrlTtlSeconds: 900,
    ...overrides,
  };
}

describe("storageConfigFromEnv", () => {
  const original = { ...process.env };
  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("S3_")) delete process.env[key];
    }
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("defaults to path-style, which is what MinIO needs locally", () => {
    expect(storageConfigFromEnv().forcePathStyle).toBe(true);
  });

  it("turns path-style off only for the explicit string 'false'", () => {
    process.env.S3_FORCE_PATH_STYLE = "false";
    expect(storageConfigFromEnv().forcePathStyle).toBe(false);

    process.env.S3_FORCE_PATH_STYLE = "0";
    // Anything else stays path-style — an unrecognised value must not silently
    // switch to virtual-host addressing against MinIO.
    expect(storageConfigFromEnv().forcePathStyle).toBe(true);
  });

  it("omits the endpoint when unset so the SDK uses real S3", () => {
    expect(storageConfigFromEnv().endpoint).toBeUndefined();
  });
});

describe("put", () => {
  it("never sends an ACL", async () => {
    const { store, sent } = storeWithStub();
    await store.put("scans/a/b.png", Buffer.from("x"), "image/png");

    expect(sent).toHaveLength(1);
    expect(sent[0]!.name).toBe("PutObjectCommand");
    // The one assertion this file exists for.
    expect(sent[0]!.input).not.toHaveProperty("ACL");
    expect(sent[0]!.input.Bucket).toBe("test-bucket");
    expect(sent[0]!.input.Key).toBe("scans/a/b.png");
  });

  it("returns the key it stored", async () => {
    const { store } = storeWithStub();
    await expect(store.put("k", Buffer.from("x"), "image/png")).resolves.toBe("k");
  });
});

describe("get", () => {
  it("returns null for a missing object rather than throwing", async () => {
    // A missing screenshot degrades a report by one picture; it must not
    // discard the document.
    const { store } = storeWithStub();
    // @ts-expect-error — stubbing the private client, as above.
    store.client.send = vi.fn(async () => {
      throw Object.assign(new Error("nope"), { name: "NoSuchKey" });
    });
    await expect(store.get("gone")).resolves.toBeNull();
  });

  it("treats a bare 404 as missing — MinIO and S3 disagree on the shape", async () => {
    const { store } = storeWithStub();
    // @ts-expect-error — stubbing the private client.
    store.client.send = vi.fn(async () => {
      throw Object.assign(new Error("nope"), { $metadata: { httpStatusCode: 404 } });
    });
    await expect(store.get("gone")).resolves.toBeNull();
  });

  it("RETHROWS anything else — a credentials failure is not an empty report", async () => {
    const { store } = storeWithStub();
    // @ts-expect-error — stubbing the private client.
    store.client.send = vi.fn(async () => {
      throw Object.assign(new Error("denied"), {
        name: "AccessDenied",
        $metadata: { httpStatusCode: 403 },
      });
    });
    await expect(store.get("k")).rejects.toThrow("denied");
  });

  it("returns the bytes when the object is there", async () => {
    const { store } = storeWithStub([
      { Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } },
    ]);
    const result = await store.get("k");
    expect(result).toEqual(Buffer.from([1, 2, 3]));
  });
});

describe("deletePrefix", () => {
  it("PAGINATES — a truncated listing must not end the sweep", async () => {
    const { store, sent } = storeWithStub([
      {
        Contents: Array.from({ length: 1000 }, (_u, i) => ({ Key: `p/${i}` })),
        IsTruncated: true,
        NextContinuationToken: "page-2",
      },
      {}, // the delete for page 1
      { Contents: [{ Key: "p/1000" }], IsTruncated: false },
      {}, // the delete for page 2
    ]);

    const deleted = await store.deletePrefix("p/");

    expect(deleted).toBe(1001);
    const lists = sent.filter((c) => c.name === "ListObjectsV2Command");
    expect(lists).toHaveLength(2);
    // The second page must carry the token, or it re-reads page one forever.
    expect(lists[1]!.input.ContinuationToken).toBe("page-2");
  });

  it("sends no delete when the prefix is already empty", async () => {
    const { store, sent } = storeWithStub([{ Contents: [], IsTruncated: false }]);
    await expect(store.deletePrefix("empty/")).resolves.toBe(0);
    expect(sent.filter((c) => c.name === "DeleteObjectsCommand")).toHaveLength(0);
  });

  it("skips entries with no key rather than sending undefined", async () => {
    const { store, sent } = storeWithStub([
      { Contents: [{ Key: "a" }, {}, { Key: "b" }], IsTruncated: false },
      {},
    ]);
    await expect(store.deletePrefix("p/")).resolves.toBe(2);
    const del = sent.find((c) => c.name === "DeleteObjectsCommand")!;
    expect(del.input.Delete).toEqual({ Objects: [{ Key: "a" }, { Key: "b" }] });
  });
});
