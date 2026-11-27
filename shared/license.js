/* License Key & Free/Pro Plan configuration for RelayPost.
 * To connect your production payment/license backend (Mayar, Midtrans, Lemon Squeezy,
 * Cloudflare Worker, Supabase, etc.), set verifyEndpoint and checkoutUrl below.
 */
(function (root) {
  "use strict";

  const LICENSE_CONFIG = {
    // Production license validation endpoint (POST JSON: { licenseKey, deviceId, product })
    // Expected JSON response: { valid: true, plan: "pro", expiresAt: "2027-01-01T00:00:00Z", customerEmail?: "..." }
    // Leave empty ("") during local testing to allow offline demo keys (prefix "RLY-PRO-").
    verifyEndpoint: "https://relaypost-web.vercel.app/api/verify-license",
    // Checkout page URL (Mayar, Midtrans, Lemon Squeezy, Gumroad, or your own landing page)
    checkoutUrl: "https://relaypost-web.vercel.app/upgrade",
    // Re-check remote license every 24 hours when verifyEndpoint is configured
    revalidateIntervalMs: 24 * 60 * 60 * 1000
  };

  const PLAN_LIMITS = {
    free: {
      maxGroupsPerCampaign: 5,
      maxMediaPerPost: 1,
      maxActiveSchedules: 1,
      allowBulkScheduleCsv: false,
      allowHealthCheck: false,
      allowSpintax: false,
      allowMultiVersion: false,
      allowFirstComment: false,
      allowImageSets: false,
      allowCsvExport: false
    },
    pro: {
      maxGroupsPerCampaign: Infinity,
      maxMediaPerPost: 10,
      maxActiveSchedules: Infinity,
      allowBulkScheduleCsv: true,
      allowHealthCheck: true,
      allowSpintax: true,
      allowMultiVersion: true,
      allowFirstComment: true,
      allowImageSets: true,
      allowCsvExport: true
    }
  };

  function normalizeKey(raw) {
    return String(raw || "").trim().toUpperCase();
  }

  function isProActive(lic) {
    if (!lic || lic.plan !== "pro" || lic.status !== "active") return false;
    if (lic.expiresAt) {
      const exp = Date.parse(lic.expiresAt);
      if (Number.isFinite(exp) && exp < Date.now()) return false;
    }
    return true;
  }

  function getLimits(lic) {
    return isProActive(lic) ? PLAN_LIMITS.pro : PLAN_LIMITS.free;
  }

  root.RelayLicense = {
    LICENSE_CONFIG,
    PLAN_LIMITS,
    normalizeKey,
    isProActive,
    getLimits
  };
})(typeof self !== "undefined" ? self : globalThis);
