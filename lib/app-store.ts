import "server-only";

import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import { APP_STORE_PRODUCTS } from "@/lib/product-contract";

// Appens bundle-id (ADR-004). Måste vara samma som i nano-ios project.pbxproj; går inte att byta efter första inskick.
const BUNDLE_ID = process.env.APPLE_BUNDLE_ID || "se.nanosport.app";

export type AppStorePlan = (typeof APP_STORE_PRODUCTS)[keyof typeof APP_STORE_PRODUCTS]["plan"];

const PRODUCT_PLAN_BY_ID: Record<string, AppStorePlan> = Object.fromEntries(
  Object.values(APP_STORE_PRODUCTS).map((product) => [product.id, product.plan]),
);

function credentials() {
  const signingKey = process.env.APPLE_IAP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const keyId = process.env.APPLE_IAP_KEY_ID;
  const issuerId = process.env.APPLE_IAP_ISSUER_ID;
  if (!signingKey || !keyId || !issuerId) {
    throw new Error("App Store Server API credentials are not configured");
  }
  return { signingKey, keyId, issuerId };
}

function client(environment: Environment) {
  const { signingKey, keyId, issuerId } = credentials();
  return new AppStoreServerAPIClient(
    signingKey,
    keyId,
    issuerId,
    BUNDLE_ID,
    environment,
  );
}

function rootCertificates(): Buffer[] {
  const encoded = process.env.APPLE_ROOT_CA_CERTS_BASE64;
  if (!encoded) throw new Error("Apple root certificates are not configured");
  return encoded
    .split(",")
    .map((certificate) => certificate.trim())
    .filter(Boolean)
    .map((certificate) => Buffer.from(certificate, "base64"));
}

function verifier(environment: Environment) {
  const appAppleId =
    environment === Environment.PRODUCTION
      ? Number(process.env.APPLE_APP_ID)
      : undefined;
  if (environment === Environment.PRODUCTION && !Number.isFinite(appAppleId)) {
    throw new Error("APPLE_APP_ID is not configured");
  }
  return new SignedDataVerifier(
    rootCertificates(),
    true,
    environment,
    BUNDLE_ID,
    appAppleId,
  );
}

export async function fetchAuthoritativeTransaction(
  transactionId: string,
): Promise<JWSTransactionDecodedPayload> {
  let lastError: unknown;

  for (const environment of [Environment.PRODUCTION, Environment.SANDBOX]) {
    try {
      const response = await client(environment).getTransactionInfo(transactionId);
      if (!response.signedTransactionInfo) {
        throw new Error("Apple returned no signed transaction");
      }
      const transaction = await verifier(environment).verifyAndDecodeTransaction(
        response.signedTransactionInfo,
      );
      if (transaction.bundleId !== BUNDLE_ID) throw new Error("Bundle ID mismatch");
      if (!transaction.productId || !(transaction.productId in PRODUCT_PLAN_BY_ID)) {
        throw new Error("Unknown App Store product");
      }
      if (transaction.transactionId !== transactionId) {
        throw new Error("Transaction ID mismatch");
      }
      return transaction;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Transaction verification failed");
}

export async function verifyAppStoreNotification(
  signedPayload: string,
): Promise<ResponseBodyV2DecodedPayload> {
  let lastError: unknown;
  for (const environment of [Environment.PRODUCTION, Environment.SANDBOX]) {
    try {
      return await verifier(environment).verifyAndDecodeNotification(signedPayload);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Notification verification failed");
}

export async function verifySignedAppStoreTransaction(
  signedTransaction: string,
): Promise<JWSTransactionDecodedPayload> {
  let lastError: unknown;
  for (const environment of [Environment.PRODUCTION, Environment.SANDBOX]) {
    try {
      return await verifier(environment).verifyAndDecodeTransaction(signedTransaction);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Transaction verification failed");
}

export async function verifySignedAppStoreRenewal(
  signedRenewal: string,
): Promise<JWSRenewalInfoDecodedPayload> {
  let lastError: unknown;
  for (const environment of [Environment.PRODUCTION, Environment.SANDBOX]) {
    try {
      return await verifier(environment).verifyAndDecodeRenewalInfo(signedRenewal);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Renewal verification failed");
}

export function planForProduct(productId: string): AppStorePlan | null {
  return PRODUCT_PLAN_BY_ID[productId] ?? null;
}
