export function requestIpFromHeaders(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || null;

  return headers.get("cf-connecting-ip") ?? headers.get("x-real-ip");
}
