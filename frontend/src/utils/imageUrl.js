/**
 * Resolve an image URL for display.
 *
 * Rule: if the value is already an absolute URL (http/https, protocol-relative,
 * or a data:/blob: URI) it is returned untouched — this covers our own
 * `https://ticket.sanskargroup.in/...` images as well as external ones like the
 * QR-code service and Unsplash placeholders. Anything else is treated as a
 * relative path and gets the site base prepended.
 */
//const IMAGE_BASE = "https://ticket.sanskargroup.in";
const IMAGE_BASE = import.meta.env.VITE_IMAGE_BASE || "https://ticket.sanskargroup.in";

export const resolveImageUrl = (url) => {
  if (!url || typeof url !== "string") return url;
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  // already absolute (http://, https://, //cdn, data:, blob:) → leave as-is
  if (/^(https?:)?\/\//i.test(trimmed) || /^(data|blob):/i.test(trimmed)) {
    return trimmed;
  }

  // relative path → prepend the site base (collapse any leading slashes)
  return `${IMAGE_BASE}/${trimmed.replace(/^\/+/, "")}`;
};

export default resolveImageUrl;
