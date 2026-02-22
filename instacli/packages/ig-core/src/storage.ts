import Conf from "conf";
import type { ProviderName } from "./types.js";

const KEYTAR_SERVICE = "instagram-agent-cli";
let keytarFallbackWarned = false;

type PendingAuth = {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: string;
};

type MetaByoConfig = {
  hasAccessToken?: boolean;
  hasRefreshToken?: boolean;
  expiresAt?: number;
  igAccountId?: string;
  igUserId?: string;
  igUsername?: string;
  tokenType?: string;
  scope?: string[];
  pendingAuth?: PendingAuth;
};

type MetaByoProviderConfig = {
  default_account?: string;
  accounts?: Record<string, MetaByoConfig>;
} & MetaByoConfig;

type CentralConfig = {
  hasSessionToken?: boolean;
  hasAccessToken?: boolean;
  expiresAt?: number;
};

type ConfigShape = {
  defaultProvider?: ProviderName;
  providers?: {
    "meta-byo"?: MetaByoProviderConfig;
    central?: CentralConfig;
  };
};

const LEGACY_META_ACCOUNT_NAME = "default";

const metaByoConfigKeys: Array<keyof MetaByoConfig> = [
  "hasAccessToken",
  "hasRefreshToken",
  "expiresAt",
  "igAccountId",
  "igUserId",
  "igUsername",
  "tokenType",
  "scope",
  "pendingAuth"
];

const getAccountName = (provider: ProviderName, field: string, accountName?: string): string =>
  accountName ? `${provider}:${accountName}:${field}` : `${provider}:${field}`;

const tryLoadKeytar = async (): Promise<null | {
  getPassword: (service: string, account: string) => Promise<string | null>;
  setPassword: (service: string, account: string, value: string) => Promise<void>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
}> => {
  try {
    const keytarModule = await import("keytar");
    return keytarModule.default ?? keytarModule;
  } catch {
    if (!keytarFallbackWarned) {
      keytarFallbackWarned = true;
      process.emitWarning(
        "keytar is unavailable. Secrets will be stored in the local config file in plaintext until keytar is installed."
      );
    }
    return null;
  }
};

export class CliStore {
  private readonly conf: Conf<ConfigShape>;

  public constructor(projectName = "instagram-agent-cli") {
    this.conf = new Conf<ConfigShape>({
      projectName,
      defaults: {
        providers: {}
      }
    });
  }

  public getDefaultProvider(): ProviderName | undefined {
    return this.conf.get("defaultProvider");
  }

  public setDefaultProvider(provider: ProviderName): void {
    this.conf.set("defaultProvider", provider);
  }

  public getMetaByoConfig(accountName?: string): MetaByoConfig {
    const provider = this.getMetaByoProviderConfig();
    const resolved = this.resolveMetaByoAccountName(accountName);
    if (!resolved) {
      return {};
    }

    return provider.accounts?.[resolved] ?? {};
  }

  public setMetaByoConfig(config: MetaByoConfig, accountName?: string): void {
    this.migrateLegacyMetaByoConfig();
    const provider = this.getMetaByoProviderConfig();
    const resolved = this.resolveMetaByoAccountName(accountName) ?? this.normalizeAccountName(config.igUsername) ?? LEGACY_META_ACCOUNT_NAME;
    const accounts = provider.accounts ?? {};
    const current = accounts[resolved] ?? {};

    this.setMetaByoProviderConfig({
      ...provider,
      default_account: provider.default_account ?? resolved,
      accounts: {
        ...accounts,
        [resolved]: {
          ...current,
          ...config
        }
      }
    });
  }

  public getMetaByoAccounts(): Record<string, MetaByoConfig> {
    const provider = this.getMetaByoProviderConfig();
    return provider.accounts ?? {};
  }

  public getDefaultAccount(provider: ProviderName = "meta-byo"): string | undefined {
    if (provider !== "meta-byo") {
      return undefined;
    }

    const meta = this.getMetaByoProviderConfig();
    if (meta.default_account && meta.accounts?.[meta.default_account]) {
      return meta.default_account;
    }

    const first = Object.keys(meta.accounts ?? {})[0];
    return first;
  }

  public setDefaultAccount(accountName: string, provider: ProviderName = "meta-byo"): void {
    if (provider !== "meta-byo") {
      return;
    }

    const normalized = this.normalizeAccountName(accountName);
    if (!normalized) {
      return;
    }

    const meta = this.getMetaByoProviderConfig();
    if (!meta.accounts?.[normalized]) {
      return;
    }

    this.setMetaByoProviderConfig({
      ...meta,
      default_account: normalized
    });
  }

  public hasMetaByoAccount(accountName: string): boolean {
    const normalized = this.normalizeAccountName(accountName);
    if (!normalized) {
      return false;
    }

    return Boolean(this.getMetaByoProviderConfig().accounts?.[normalized]);
  }

  public clearMetaByoAccount(accountName?: string): void {
    const resolved = this.resolveMetaByoAccountName(accountName);
    if (!resolved) {
      return;
    }

    const provider = this.getMetaByoProviderConfig();
    const accounts = { ...(provider.accounts ?? {}) };
    delete accounts[resolved];
    const accountNames = Object.keys(accounts);
    const nextDefault =
      provider.default_account === resolved
        ? (accountNames[0] ?? undefined)
        : provider.default_account && accounts[provider.default_account]
          ? provider.default_account
          : (accountNames[0] ?? undefined);

    this.setMetaByoProviderConfig({
      ...provider,
      default_account: nextDefault,
      accounts
    });
  }

  public getCentralConfig(): CentralConfig {
    return this.conf.get("providers.central", {});
  }

  public setCentralConfig(config: CentralConfig): void {
    this.conf.set("providers.central", {
      ...this.getCentralConfig(),
      ...config
    });
  }

  public async getSecret(provider: ProviderName, field: string, accountName?: string): Promise<string | undefined> {
    this.migrateLegacyMetaByoConfig();
    const keytar = await tryLoadKeytar();
    const resolvedAccount = provider === "meta-byo" ? this.resolveMetaByoAccountName(accountName) : undefined;
    const account = getAccountName(provider, field, resolvedAccount);

    if (keytar) {
      const value = await keytar.getPassword(KEYTAR_SERVICE, account);
      if (value !== null) {
        return value;
      }
    }

    const fallbackPath = this.getSecretFallbackPath(provider, field, resolvedAccount);
    const fallback = this.conf.get(fallbackPath as keyof ConfigShape);
    if (typeof fallback === "string") {
      return fallback;
    }

    if (provider === "meta-byo" && resolvedAccount) {
      const legacyAccount = getAccountName(provider, field);
      if (keytar) {
        const legacySecret = await keytar.getPassword(KEYTAR_SERVICE, legacyAccount);
        if (legacySecret !== null) {
          await keytar.setPassword(KEYTAR_SERVICE, account, legacySecret);
          await keytar.deletePassword(KEYTAR_SERVICE, legacyAccount);
          return legacySecret;
        }
      }

      const legacyFallback = this.conf.get(`providers.${provider}.${field}` as keyof ConfigShape);
      if (typeof legacyFallback === "string") {
        this.conf.set(fallbackPath as keyof ConfigShape, legacyFallback as never);
        this.conf.delete(`providers.${provider}.${field}` as keyof ConfigShape);
        return legacyFallback;
      }
    }

    return undefined;
  }

  public async setSecret(provider: ProviderName, field: string, value: string, accountName?: string): Promise<void> {
    this.migrateLegacyMetaByoConfig();
    const keytar = await tryLoadKeytar();
    const resolvedAccount = provider === "meta-byo" ? this.resolveMetaByoAccountName(accountName) ?? LEGACY_META_ACCOUNT_NAME : undefined;
    const account = getAccountName(provider, field, resolvedAccount);
    const fallbackPath = this.getSecretFallbackPath(provider, field, resolvedAccount);

    if (keytar) {
      await keytar.setPassword(KEYTAR_SERVICE, account, value);
      this.conf.delete(fallbackPath as keyof ConfigShape);
      return;
    }

    this.conf.set(fallbackPath as keyof ConfigShape, value as never);
  }

  public async deleteSecret(provider: ProviderName, field: string, accountName?: string): Promise<void> {
    this.migrateLegacyMetaByoConfig();
    const keytar = await tryLoadKeytar();
    const resolvedAccount = provider === "meta-byo" ? this.resolveMetaByoAccountName(accountName) : undefined;
    const account = getAccountName(provider, field, resolvedAccount);
    const fallbackPath = this.getSecretFallbackPath(provider, field, resolvedAccount);

    if (keytar) {
      await keytar.deletePassword(KEYTAR_SERVICE, account);
    }

    this.conf.delete(fallbackPath as keyof ConfigShape);
  }

  public clearProvider(provider: ProviderName): void {
    this.conf.delete(`providers.${provider}` as keyof ConfigShape);
  }

  private normalizeAccountName(accountName: string | undefined): string | undefined {
    if (typeof accountName !== "string") {
      return undefined;
    }
    const trimmed = accountName.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private getMetaByoProviderConfig(): MetaByoProviderConfig {
    this.migrateLegacyMetaByoConfig();
    return this.conf.get("providers.meta-byo", {});
  }

  private setMetaByoProviderConfig(config: MetaByoProviderConfig): void {
    this.conf.set("providers.meta-byo", config);
  }

  private trySetMetaByoProviderConfig(config: MetaByoProviderConfig): void {
    try {
      this.setMetaByoProviderConfig(config);
    } catch {
      // Best-effort migration should not fail read-only environments.
    }
  }

  private hasLegacyMetaByoProfile(config: MetaByoProviderConfig): boolean {
    return metaByoConfigKeys.some((key) => config[key] !== undefined);
  }

  private extractLegacyMetaByoProfile(config: MetaByoProviderConfig): MetaByoConfig {
    const profile: MetaByoConfig = {};
    for (const key of metaByoConfigKeys) {
      const value = config[key];
      if (value !== undefined) {
        profile[key] = value as never;
      }
    }
    return profile;
  }

  private migrateLegacyMetaByoConfig(): void {
    const provider = this.conf.get("providers.meta-byo", {} as MetaByoProviderConfig);
    const accountNames = Object.keys(provider.accounts ?? {});
    if (accountNames.length > 0) {
      if (!provider.default_account || !provider.accounts?.[provider.default_account]) {
        this.trySetMetaByoProviderConfig({
          ...provider,
          default_account: accountNames[0]
        });
      }
      return;
    }

    if (!this.hasLegacyMetaByoProfile(provider)) {
      return;
    }

    const legacyProfile = this.extractLegacyMetaByoProfile(provider);
    const accountName = this.normalizeAccountName(legacyProfile.igUsername) ?? LEGACY_META_ACCOUNT_NAME;
    this.trySetMetaByoProviderConfig({
      default_account: accountName,
      accounts: {
        [accountName]: legacyProfile
      }
    });
  }

  private resolveMetaByoAccountName(accountName?: string): string | undefined {
    const normalized = this.normalizeAccountName(accountName);
    if (normalized) {
      return normalized;
    }

    const provider = this.conf.get("providers.meta-byo", {} as MetaByoProviderConfig);
    if (provider.default_account) {
      return provider.default_account;
    }

    const accountNames = Object.keys(provider.accounts ?? {});
    return accountNames[0];
  }

  private getSecretFallbackPath(provider: ProviderName, field: string, accountName?: string): string {
    if (provider === "meta-byo" && accountName) {
      return `providers.${provider}.accounts.${accountName}.${field}`;
    }
    return `providers.${provider}.${field}`;
  }
}
