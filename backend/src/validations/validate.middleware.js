import { error as errorResponse } from "../helpers/response.helper.js";

export const validate = (schema) => {
    return (req, res, next) => {

        if (!req.body || Object.keys(req.body).length === 0) {
            return errorResponse(res, "Request body is required", 400);
        }
        const errors = [];
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
            if (schema.minDigits?.[field]) {
                if (value.toString().length !== schema.minDigits[field]) {
                    errors.push(
                        `${field} must be at least ${schema.minDigits[field]} digits`
                    );
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

        if (errors.length > 0) {
            return errorResponse(res, "Validation failed", 400, errors);
        }

        next();
    };
};




