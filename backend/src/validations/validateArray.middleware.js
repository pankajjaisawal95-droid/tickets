import { error as errorResponse } from "../helpers/response.helper.js";

export const validate = (schema) => {
  return (req, res, next) => {
    if (!req.body || Object.keys(req.body).length === 0) {
      return errorResponse(res, "Request body is required", 400);
    }

    const errors = [];

    /* ---------- BASIC REQUIRED FIELDS ---------- */
    for (const field of schema.required || []) {
      const value = req.body[field];

      if (value === undefined || value === null) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value === "") {
        errors.push(`${field} should not be empty`);
      }

      if (schema.integers?.includes(field)) {
        if (!Number.isInteger(value)) {
          errors.push(`${field} must be an integer`);
        }
      }

      if (Array.isArray(value) && value.length === 0) {
        errors.push(`${field} should not be empty`);
      }

      if (
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0
      ) {
        errors.push(`${field} should not be empty`);
      }
    }

    /* ---------- ARRAY VALIDATION (tickets[]) ---------- */
    if (schema.array) {
      for (const [arrayField, rules] of Object.entries(schema.array)) {
        const arr = req.body[arrayField];

        if (!Array.isArray(arr)) {
          errors.push(`${arrayField} must be an array`);
          continue;
        }

        arr.forEach((item, index) => {
          if (typeof item !== "object") {
            errors.push(`${arrayField}[${index}] must be an object`);
            return;
          }

          for (const field of rules.required || []) {
            if (
              item[field] === undefined ||
              item[field] === null ||
              item[field] === ""
            ) {
              errors.push(
                `${arrayField}[${index}].${field} is required`
              );
            }
          }

          for (const field of rules.integers || []) {
            if (
              item[field] !== undefined &&
              !Number.isInteger(item[field])
            ) {
              errors.push(
                `${arrayField}[${index}].${field} must be an integer`
              );
            }
          }

          for (const field of rules.positive || []) {
            if (item[field] <= 0) {
              errors.push(
                `${arrayField}[${index}].${field} must be greater than 0`
              );
            }
          }
        });
      }
    }

    if (errors.length > 0) {
      return errorResponse(res, "Validation failed", 400, errors);
    }

    next();
  };
};
