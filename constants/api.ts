// API-related constants
export const API_CONFIG = {
  authHeader: "authorization",
  bearerPrefix: "Bearer ",
  defaultBatchSize: 50,
  defaultMaxBatches: 1,
  defaultRecentSendsLimit: 20,
  parseIntRadix: 10,
} as const;

// Time-based constants for API operations
export const API_TIME_CONSTANTS = {
  twentyFourHoursMs: 24 * 60 * 60 * 1000,
  thirtySecondsMs: 30 * 1000,
} as const;

// HTTP status codes
export const HTTP_STATUS = {
  ok: 200,
  created: 201,
  noContent: 204,
  badRequest: 400,
  unauthorized: 401,
  notFound: 404,
  gone: 410,
  internalServerError: 500,
} as const;
