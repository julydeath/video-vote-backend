export type GoogleUserInfo = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
};

export async function getGoogleUserFromAccessToken(
  accessToken: string,
): Promise<GoogleUserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Invalid Google token. ${res.status} ${text}`);
  }

  const data = (await res.json()) as any;

  if (!data?.sub) throw new Error("Google userinfo missing sub");

  return {
    sub: data.sub,
    email: data.email,
    name: data.name,
    picture: data.picture,
  };
}
