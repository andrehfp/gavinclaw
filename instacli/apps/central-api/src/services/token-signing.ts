import crypto from "node:crypto";

const toBase64Url = (value: Buffer | string): string =>
  (typeof value === "string" ? Buffer.from(value, "utf8") : value).toString("base64url");

const fromBase64Url = (value: string): Buffer | undefined => {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return undefined;
  }
};

const timingSafeEqualHex = (left: string, right: string): boolean => {
  if (!/^[0-9a-f]+$/i.test(left) || !/^[0-9a-f]+$/i.test(right)) {
    return false;
  }
  if (left.length !== right.length || left.length % 2 !== 0) {
    return false;
  }

  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const signPayload = (encodedPayload: string, secret: string): string =>
  crypto.createHmac("sha256", secret).update(encodedPayload).digest("hex");

export const createSignedToken = <TPayload extends Record<string, unknown>>(payload: TPayload, secret: string): string => {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
};

export const verifySignedToken = <TPayload extends Record<string, unknown>>(token: string, secret: string): TPayload | undefined => {
  const [encodedPayload, providedSignature, ...rest] = token.split(".");
  if (!encodedPayload || !providedSignature || rest.length > 0) {
    return undefined;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  if (!timingSafeEqualHex(expectedSignature, providedSignature)) {
    return undefined;
  }

  const payloadBuffer = fromBase64Url(encodedPayload);
  if (!payloadBuffer) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(payloadBuffer.toString("utf8")) as unknown;
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as TPayload;
    }
  } catch {
    return undefined;
  }

  return undefined;
};
