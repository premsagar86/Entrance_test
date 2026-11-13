import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * File storage. With R2_* configured (Cloudflare R2, S3-compatible) files go to the bucket, which is
 * required on serverless hosts such as Vercel. Otherwise they go to STORAGE_DIR on local disk
 * (development and the Docker/VPS setup).
 */
const localRoot = () => path.resolve(process.env.STORAGE_DIR ?? "./storage");

let client: S3Client | null = null;
function r2(): { s3: S3Client; bucket: string } | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_BUCKET) return null;
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
  });
  return { s3: client, bucket: R2_BUCKET };
}

const KEY_RE = /^[a-f0-9]{32}\.[a-z0-9]+$/;

/** Stores bytes under a random server-generated name. Returns the storage key. Never served directly. */
export async function saveFile(buf: Buffer, extension: string): Promise<string> {
  const key = `${randomBytes(16).toString("hex")}.${extension.replace(/[^a-z0-9]/gi, "")}`;
  const remote = r2();
  if (remote) {
    await remote.s3.send(new PutObjectCommand({ Bucket: remote.bucket, Key: key, Body: buf }));
    return key;
  }
  if (process.env.VERCEL) throw new Error("File storage is not configured (set R2_* variables)");
  await mkdir(localRoot(), { recursive: true });
  await writeFile(path.join(localRoot(), key), buf, { flag: "wx" });
  return key;
}

export async function readStored(key: string): Promise<Buffer> {
  if (!KEY_RE.test(key)) throw new Error("Invalid storage key");
  const remote = r2();
  if (remote) {
    const res = await remote.s3.send(new GetObjectCommand({ Bucket: remote.bucket, Key: key }));
    if (!res.Body) throw new Error("Stored file is empty");
    return Buffer.from(await res.Body.transformToByteArray());
  }
  return readFile(path.join(localRoot(), key));
}
