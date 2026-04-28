export type EnvStatus = {
  configured: boolean;
  missing: string[];
};

export function getRequiredEnvStatus(keys: string[]): EnvStatus {
  const missing = keys.filter((key) => !process.env[key]);

  return {
    configured: missing.length === 0,
    missing,
  };
}

export function requireEnv(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}
