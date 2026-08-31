import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * OBJECT STORAGE — PLAN.md Part IV §4.5, Part X §10.6, Phase 2 task 2.12.
 *
 * Screenshots and exported reports. MinIO locally, S3 in production — the same
 * API, which is why `forcePathStyle` exists rather than two code paths.
 *
 * ⚠️ THE BUCKET IS PRIVATE AND STAYS PRIVATE. Nothing here makes an object
 * public, and there is deliberately no method that could. A screenshot is a
 * picture of a customer's client's website taken by us; a public URL would make
 * every one of them world-readable to anyone who guessed a key, and the keys
 * are guessable by design (they encode ids). Access is short-lived signed URLs
 * only.
 */

export interface StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** True for MinIO, false for real S3. */
  forcePathStyle: boolean;
  signedUrlTtlSeconds: number;
}

export function storageConfigFromEnv(): StorageConfig {
  return {
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET ?? "drift-monitor",
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    signedUrlTtlSeconds: Number(process.env.S3_SIGNED_URL_TTL_SECONDS ?? 900),
  };
}

export class ObjectStore {
  private readonly client: S3Client;

  constructor(private readonly config: StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /**
   * Uploads one object.
   *
   * ⚠️ NO ACL ARGUMENT, EVER. Passing `ACL: "public-read"` here is the one line
   * that would turn every stored screenshot into a public asset. The bucket
   * policy is the control; this method must never be able to override it.
   */
  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return key;
  }

  /**
   * Reads one object into memory.
   *
   * ⚠️ FOR SERVER-SIDE EMBEDDING ONLY — a screenshot inlined into a PDF, a
   * report streamed through a tenant-asserted download route. It is never a
   * substitute for `signedUrl`: proxying a browser's image loads through the
   * app would put every screenshot byte through the Node process.
   *
   * Returns null when the object is gone. A missing screenshot degrades a
   * report by one picture (P1: screenshots corroborate, they never establish a
   * fact); throwing here would discard the whole document over it.
   */
  async get(key: string): Promise<Buffer | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      const body = result.Body;
      if (!body) return null;
      return Buffer.from(await body.transformToByteArray());
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /**
   * A short-lived read URL.
   *
   * ⚠️ THE TTL IS THE ACCESS CONTROL. Once issued, the URL works for anyone who
   * holds it — so it is minutes, not days, and it is generated per request
   * rather than stored on the row. A signed URL persisted in the database is a
   * long-lived public link with extra steps.
   */
  async signedUrl(key: string, ttlSeconds?: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { expiresIn: ttlSeconds ?? this.config.signedUrlTtlSeconds },
    );
  }

  /**
   * Deletes everything under a prefix — the retention sweep and agency
   * deletion path (§5.7).
   *
   * Paginated because `ListObjectsV2` returns at most 1000 keys, and an agency
   * with a year of daily scans has far more than that. A single unpaginated
   * pass would silently leave the rest behind, which is the failure mode that
   * makes a deletion request only look honoured.
   */
  async deletePrefix(prefix: string): Promise<number> {
    let deleted = 0;
    let continuationToken: string | undefined;

    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const keys = (listed.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => Boolean(key));

      if (keys.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.config.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        );
        deleted += keys.length;
      }

      continuationToken = listed.IsTruncated
        ? listed.NextContinuationToken
        : undefined;
    } while (continuationToken);

    return deleted;
  }
}

/** One store per process — the S3 client pools connections internally. */
const globalForStore = globalThis as unknown as { pdmObjectStore?: ObjectStore };

export function objectStore(): ObjectStore {
  globalForStore.pdmObjectStore ??= new ObjectStore(storageConfigFromEnv());
  return globalForStore.pdmObjectStore;
}

/**
 * S3 and MinIO disagree on the shape of a not-found error — `NoSuchKey` from
 * one, a bare 404 from the other — so both are matched. Treating an unknown
 * error as "missing" would hide a credentials failure as an empty report.
 */
function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return (
    candidate.name === "NoSuchKey" ||
    candidate.name === "NotFound" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}
