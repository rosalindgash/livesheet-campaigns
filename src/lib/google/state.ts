import { randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const GOOGLE_OAUTH_STATE_COOKIE = "lsc_google_oauth_state";

export function createGoogleOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export async function consumeGoogleOAuthState(state: string): Promise<boolean> {
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

  cookieStore.delete(GOOGLE_OAUTH_STATE_COOKIE);

  if (!expectedState) {
    return false;
  }

  const expected = Buffer.from(expectedState);
  const actual = Buffer.from(state);

  return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual);
}
