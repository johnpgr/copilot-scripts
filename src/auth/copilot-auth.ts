import path from "path";
import {
  loadCachedToken,
  saveBearerToken,
  saveOAuthToken,
} from "./token-store.ts";

const CLIENT_ID = "Iv1.b507a08c87ecfe98";

class DeviceCodeDTO {
  private constructor(
    public device_code: string,
    public user_code: string,
    public verification_uri: string,
    public interval: number,
  ) {}

  static fromJson(data: unknown): DeviceCodeDTO {
    if (
      typeof data === "object" &&
      data !== null &&
      "device_code" in data &&
      "user_code" in data &&
      "verification_uri" in data
    ) {
      const interval =
        typeof (data as any).interval === "number" ? (data as any).interval : 5;
      return new DeviceCodeDTO(
        String((data as any).device_code),
        String((data as any).user_code),
        String((data as any).verification_uri),
        interval,
      );
    }
    throw new Error("Invalid device code response");
  }
}

class AccessTokenDTO {
  private constructor(
    public access_token?: string,
    public error?: string,
  ) {}

  static fromJson(data: unknown): AccessTokenDTO {
    if (typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>;
      const access_token =
        typeof obj.access_token === "string" ? obj.access_token : undefined;
      const error = typeof obj.error === "string" ? obj.error : undefined;
      return new AccessTokenDTO(access_token, error);
    }
    throw new Error("Invalid access token response");
  }
}

class BearerTokenDTO {
  constructor(
    public token: string,
    public expires_at: number,
  ) {}

  static fromJson(data: unknown): BearerTokenDTO {
    if (
      typeof data === "object" &&
      data !== null &&
      typeof (data as any).token === "string" &&
      typeof (data as any).expires_at === "number"
    ) {
      return new BearerTokenDTO((data as any).token, (data as any).expires_at);
    }
    throw new Error("Invalid bearer token response");
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findExistingToken(): Promise<string | null> {
  const configPaths = [
    path.join(process.env.HOME || "", ".config/github-copilot/hosts.json"),
    path.join(process.env.HOME || "", ".config/github-copilot/apps.json"),
  ];

  for (const configPath of configPaths) {
    try {
      const data = await Bun.file(configPath).json();
      for (const [key, value] of Object.entries<any>(data)) {
        if (key.includes("github.com") && value.oauth_token) {
          return value.oauth_token as string;
        }
      }
    } catch {
      // Ignore missing/invalid configs
    }
  }

  return null;
}

async function deviceFlow(clientId: string): Promise<string> {
  const response = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ client_id: clientId, scope: "" }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to start device flow: ${response.status} ${response.statusText}`,
    );
  }

  const deviceData = DeviceCodeDTO.fromJson(await response.json());
  const { device_code, user_code, verification_uri, interval } = deviceData;

  console.log(`\nVisit ${verification_uri} and enter code: ${user_code}\n`);
  console.log("Waiting for authorization...");

  while (true) {
    await sleep((interval || 5) * 1000);

    const pollResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: { Accept: "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          device_code,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      },
    );

    if (!pollResponse.ok) {
      throw new Error(
        `Auth error: ${pollResponse.status} ${pollResponse.statusText}`,
      );
    }

    const data = AccessTokenDTO.fromJson(await pollResponse.json());
    if (data.access_token) {
      return data.access_token;
    }

    if (data.error && data.error !== "authorization_pending") {
      throw new Error(`Auth error: ${data.error}`);
    }
  }
}

async function getBearerToken(oauthToken: string): Promise<BearerTokenDTO> {
  const response = await fetch(
    "https://api.github.com/copilot_internal/v2/token",
    {
      headers: { Authorization: `Token ${oauthToken}` },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to get bearer token: ${response.status}`);
  }

  const data = BearerTokenDTO.fromJson(await response.json());
  return { token: data.token, expires_at: data.expires_at };
}

export async function authenticate(): Promise<string> {
  const cached = await loadCachedToken();
  const nowSeconds = Date.now() / 1000;

  if (
    cached?.bearer_token &&
    cached.expires_at &&
    cached.expires_at > nowSeconds
  ) {
    return cached.bearer_token;
  }

  let oauthToken = await findExistingToken();
  if (!oauthToken) {
    oauthToken = await deviceFlow(CLIENT_ID);
    await saveOAuthToken(oauthToken);
  }

  const bearer = await getBearerToken(oauthToken);
  await saveBearerToken(bearer);
  return bearer.token;
}
