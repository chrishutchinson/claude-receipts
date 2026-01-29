import type { ShareableReceiptData, ModelBreakdown } from "../types.js";

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  data?: ShareableReceiptData;
}

const MAX_STRING_LENGTH = 200;
const MAX_LOCATION_LENGTH = 100;
const MAX_MODEL_BREAKDOWNS = 10;

function isString(val: unknown): val is string {
  return typeof val === "string";
}

function isNumber(val: unknown): val is number {
  return typeof val === "number" && !isNaN(val) && isFinite(val);
}

function isNonNegativeNumber(val: unknown): val is number {
  return isNumber(val) && val >= 0;
}

function isNonNegativeInteger(val: unknown): val is number {
  return isNonNegativeNumber(val) && Number.isInteger(val);
}

function isValidISODate(val: unknown): boolean {
  if (!isString(val)) return false;
  const date = new Date(val);
  return !isNaN(date.getTime());
}

function validateModelBreakdown(
  breakdown: unknown,
  index: number,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `modelBreakdowns[${index}]`;

  if (typeof breakdown !== "object" || breakdown === null) {
    errors.push({ field: prefix, message: "must be an object" });
    return errors;
  }

  const bd = breakdown as Record<string, unknown>;

  if (!isString(bd.modelName) || bd.modelName.length === 0) {
    errors.push({
      field: `${prefix}.modelName`,
      message: "must be a non-empty string",
    });
  } else if (bd.modelName.length > MAX_STRING_LENGTH) {
    errors.push({
      field: `${prefix}.modelName`,
      message: `must be at most ${MAX_STRING_LENGTH} characters`,
    });
  }

  if (!isNonNegativeInteger(bd.inputTokens)) {
    errors.push({
      field: `${prefix}.inputTokens`,
      message: "must be a non-negative integer",
    });
  }

  if (!isNonNegativeInteger(bd.outputTokens)) {
    errors.push({
      field: `${prefix}.outputTokens`,
      message: "must be a non-negative integer",
    });
  }

  if (
    bd.cacheCreationTokens !== undefined &&
    !isNonNegativeInteger(bd.cacheCreationTokens)
  ) {
    errors.push({
      field: `${prefix}.cacheCreationTokens`,
      message: "must be a non-negative integer",
    });
  }

  if (
    bd.cacheReadTokens !== undefined &&
    !isNonNegativeInteger(bd.cacheReadTokens)
  ) {
    errors.push({
      field: `${prefix}.cacheReadTokens`,
      message: "must be a non-negative integer",
    });
  }

  if (!isNonNegativeNumber(bd.cost)) {
    errors.push({
      field: `${prefix}.cost`,
      message: "must be a non-negative number",
    });
  }

  return errors;
}

export function validateReceiptData(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof data !== "object" || data === null) {
    return {
      valid: false,
      errors: [{ field: "root", message: "data must be an object" }],
    };
  }

  const d = data as Record<string, unknown>;

  // Required string fields
  if (!isString(d.sessionSlug) || d.sessionSlug.length === 0) {
    errors.push({
      field: "sessionSlug",
      message: "must be a non-empty string",
    });
  } else if (d.sessionSlug.length > MAX_STRING_LENGTH) {
    errors.push({
      field: "sessionSlug",
      message: `must be at most ${MAX_STRING_LENGTH} characters`,
    });
  }

  if (!isString(d.location) || d.location.length === 0) {
    errors.push({ field: "location", message: "must be a non-empty string" });
  } else if (d.location.length > MAX_LOCATION_LENGTH) {
    errors.push({
      field: "location",
      message: `must be at most ${MAX_LOCATION_LENGTH} characters`,
    });
  }

  if (!isValidISODate(d.sessionDate)) {
    errors.push({
      field: "sessionDate",
      message: "must be a valid ISO 8601 date string",
    });
  }

  // Optional timezone
  if (d.timezone !== undefined && !isString(d.timezone)) {
    errors.push({ field: "timezone", message: "must be a string" });
  } else if (isString(d.timezone) && d.timezone.length > 50) {
    errors.push({
      field: "timezone",
      message: "must be at most 50 characters",
    });
  }

  // Required numeric fields
  if (!isNonNegativeNumber(d.totalCost)) {
    errors.push({
      field: "totalCost",
      message: "must be a non-negative number",
    });
  }

  if (!isNonNegativeInteger(d.totalTokens)) {
    errors.push({
      field: "totalTokens",
      message: "must be a non-negative integer",
    });
  }

  if (!isNonNegativeInteger(d.inputTokens)) {
    errors.push({
      field: "inputTokens",
      message: "must be a non-negative integer",
    });
  }

  if (!isNonNegativeInteger(d.outputTokens)) {
    errors.push({
      field: "outputTokens",
      message: "must be a non-negative integer",
    });
  }

  if (!isNonNegativeInteger(d.cacheCreationTokens)) {
    errors.push({
      field: "cacheCreationTokens",
      message: "must be a non-negative integer",
    });
  }

  if (!isNonNegativeInteger(d.cacheReadTokens)) {
    errors.push({
      field: "cacheReadTokens",
      message: "must be a non-negative integer",
    });
  }

  if (!isNonNegativeInteger(d.userMessageCount)) {
    errors.push({
      field: "userMessageCount",
      message: "must be a non-negative integer",
    });
  }

  if (!isNonNegativeInteger(d.assistantMessageCount)) {
    errors.push({
      field: "assistantMessageCount",
      message: "must be a non-negative integer",
    });
  }

  if (!isNonNegativeInteger(d.totalMessages)) {
    errors.push({
      field: "totalMessages",
      message: "must be a non-negative integer",
    });
  }

  // Model breakdowns array
  if (!Array.isArray(d.modelBreakdowns)) {
    errors.push({ field: "modelBreakdowns", message: "must be an array" });
  } else if (d.modelBreakdowns.length > MAX_MODEL_BREAKDOWNS) {
    errors.push({
      field: "modelBreakdowns",
      message: `must have at most ${MAX_MODEL_BREAKDOWNS} entries`,
    });
  } else {
    for (let i = 0; i < d.modelBreakdowns.length; i++) {
      errors.push(...validateModelBreakdown(d.modelBreakdowns[i], i));
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build validated data object
  const validatedData: ShareableReceiptData = {
    sessionSlug: d.sessionSlug as string,
    location: d.location as string,
    sessionDate: d.sessionDate as string,
    timezone: d.timezone as string | undefined,
    totalCost: d.totalCost as number,
    totalTokens: d.totalTokens as number,
    inputTokens: d.inputTokens as number,
    outputTokens: d.outputTokens as number,
    cacheCreationTokens: d.cacheCreationTokens as number,
    cacheReadTokens: d.cacheReadTokens as number,
    modelBreakdowns: (d.modelBreakdowns as unknown[]).map((bd) => {
      const b = bd as Record<string, unknown>;
      return {
        modelName: b.modelName as string,
        inputTokens: b.inputTokens as number,
        outputTokens: b.outputTokens as number,
        cacheCreationTokens: b.cacheCreationTokens as number | undefined,
        cacheReadTokens: b.cacheReadTokens as number | undefined,
        cost: b.cost as number,
      } as ModelBreakdown;
    }),
    userMessageCount: d.userMessageCount as number,
    assistantMessageCount: d.assistantMessageCount as number,
    totalMessages: d.totalMessages as number,
  };

  return { valid: true, errors: [], data: validatedData };
}
