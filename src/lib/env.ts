import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32),
  DOB_PEPPER: z.string().min(32),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

let cached: z.infer<typeof schema> | undefined;

/** Lazily validated so `next build` does not need secrets. */
export function env() {
  cached ??= schema.parse(process.env);
  return cached;
}
