import { success, error } from '../helpers/response.helper.js';
export const requireHeaders = (requiredHeaders = []) => {
    return (req, res, next) => {

        for (const headerGroup of requiredHeaders) {

            // Allow single header or aliases
            const headers = Array.isArray(headerGroup)
                ? headerGroup
                : [headerGroup];

            let valueFound = null;
            let headerFound = null;

            for (const header of headers) {
                const key = header.toLowerCase();
                const value = req.headers[key];
                // console.log("value",req.headers);
                // console.log("key",key)

                // ✅ key exists + value is valid non-empty string
                if (
                    typeof value === 'string' &&
                    value.trim().length > 0
                ) {
                    valueFound = value.trim();
                    headerFound = header;
                    break;
                }
            }

            // ❌ none of the headers had a valid value
            if (!valueFound) {
                return error(
                    res,
                    `One of these headers is required and must have a value: ${headers.join(', ')}`,
                    401
                );
            }

            // Attach to req using normalized name
            req[headerFound.replace(/-/g, '_')] = valueFound;
        }

        next();
    };
};

