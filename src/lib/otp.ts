import { env } from "./env";
import { hmac } from "./crypto";

export const otpHash = (adminId: string, code: string) => hmac(`${adminId}:${code}`, env().SESSION_SECRET);
