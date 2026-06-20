import { decode } from "node:punycode";
import { verifyAccessToken } from "../helpers/jwt.helpers.js";
import { error } from "../helpers/response.helper.js";
export const authenticate = async (req, res, next) => {
    try {
      console.log("auth middleware called");
      const token = req.headers['x-access-token'];
        if (!token) {
            return error(res, 'Authorization header missing', 401);
        }
        const decoded =await verifyAccessToken(token);
        req.userId = decoded.userId;
        next();
    } catch (err) {
        return error(res, 'Invalid or expired access token', 401);
    }
};


