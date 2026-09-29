// Only follow a post-sign-in `next` to a path on this site. "//host" and
// "/\host" are read by browsers as another website, so a crafted login link
// could otherwise send someone to a lookalike page straight after they sign in.
export function safeNext(value: string | undefined): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return undefined;
  }
  return value;
}
