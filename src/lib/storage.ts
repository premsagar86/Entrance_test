import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

const root = () => path.resolve(process.env.STORAGE_DIR ?? "./storage");

/** Stores bytes under a random server-generated name. Returns the storage key. Never served directly. */
export async function saveFile(buf: Buffer, extension: string): Promise<string> {
  const key = `${randomBytes(16).toString("hex")}.${extension.replace(/[^a-z0-9]/gi, "")}`;
  await mkdir(root(), { recursive: true });
  await writeFile(path.join(root(), key), buf, { flag: "wx" });
  return key;
}

export async function readStored(key: string): Promise<Buffer> {
  if (!/^[a-f0-9]{32}\.[a-z0-9]+$/.test(key)) throw new Error("Invalid storage key");
  return readFile(path.join(root(), key));
}
