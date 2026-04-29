/**
 * Loads Omise.js on demand and tokenizes credit-card data in the browser
 * so raw card details never reach our server.
 */

interface OmiseTokenCardInput {
  name: string;
  number: string;
  expirationMonth: number;
  expirationYear: number;
  securityCode: string;
}

interface OmiseTokenResponse {
  id?: string;
  object?: string;
  card?: { last_digits?: string; brand?: string };
  message?: string;
}

interface OmiseGlobal {
  setPublicKey: (key: string) => void;
  createToken: (
    type: "card",
    card: {
      name: string;
      number: string;
      expiration_month: number;
      expiration_year: number;
      security_code: string;
    },
    callback: (statusCode: number, response: OmiseTokenResponse) => void,
  ) => void;
}

declare global {
  interface Window {
    Omise?: OmiseGlobal;
  }
}

const OMISE_SCRIPT_URL = "https://cdn.omise.co/omise.js";
let omiseScriptPromise: Promise<OmiseGlobal> | null = null;

function loadOmiseScript(publicKey: string): Promise<OmiseGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Omise.js can only load in the browser"));
  }
  if (window.Omise) {
    window.Omise.setPublicKey(publicKey);
    return Promise.resolve(window.Omise);
  }
  if (omiseScriptPromise) return omiseScriptPromise;

  omiseScriptPromise = new Promise<OmiseGlobal>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${OMISE_SCRIPT_URL}"]`,
    );
    const script = existing ?? document.createElement("script");
    if (!existing) {
      script.src = OMISE_SCRIPT_URL;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => {
      if (!window.Omise) {
        reject(new Error("Omise.js failed to initialize"));
        return;
      }
      window.Omise.setPublicKey(publicKey);
      resolve(window.Omise);
    });
    script.addEventListener("error", () => {
      omiseScriptPromise = null;
      reject(new Error("Failed to load Omise.js"));
    });
  });

  return omiseScriptPromise;
}

export function useOmise() {
  const config = useRuntimeConfig();
  const publicKey = String(config.public.omisePublicKey ?? "");

  async function ensureLoaded(): Promise<OmiseGlobal> {
    if (!publicKey) {
      throw new Error("OMISE_PUBLIC_KEY is not configured");
    }
    return loadOmiseScript(publicKey);
  }

  async function createCardToken(card: OmiseTokenCardInput): Promise<string> {
    const omise = await ensureLoaded();
    return new Promise<string>((resolve, reject) => {
      omise.createToken(
        "card",
        {
          name: card.name,
          number: card.number.replace(/\s+/g, ""),
          expiration_month: card.expirationMonth,
          expiration_year: card.expirationYear,
          security_code: card.securityCode,
        },
        (statusCode, response) => {
          if (statusCode === 200 && response.id) {
            resolve(response.id);
            return;
          }
          reject(
            new Error(
              response.message ||
                `Omise token creation failed (status ${statusCode})`,
            ),
          );
        },
      );
    });
  }

  return {
    publicKey,
    createCardToken,
  };
}
