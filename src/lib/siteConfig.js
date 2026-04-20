const adminHost = import.meta.env.VITE_ADMIN_HOST || "";
const publicHost = import.meta.env.VITE_PUBLIC_HOST || "";
const adminUrl = import.meta.env.VITE_ADMIN_URL || "";
const publicUrl = import.meta.env.VITE_PUBLIC_URL || "";

export function isAdminHostname(hostname = window.location.hostname) {
  if (!adminHost) {
    return false;
  }

  return hostname === adminHost;
}

export function getAdminUrl(path = "/admin/login") {
  if (adminUrl) {
    return `${adminUrl}${path === "/" ? "" : path}`;
  }

  return path;
}

export function getPublicUrl(path = "/") {
  if (publicUrl) {
    return `${publicUrl}${path === "/" ? "" : path}`;
  }

  return path;
}

export function getHostHints() {
  return {
    adminHost,
    publicHost,
    adminUrl,
    publicUrl,
  };
}
