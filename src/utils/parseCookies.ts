export const parseCookies = (
  cookieHeader: string | undefined
): Record<string, string> => {
  const cookies: Record<string, string> = {};

  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    const value = rest.join('=');
    cookies[name] = decodeURIComponent(value);
  });

  return cookies;
};

export default parseCookies;
