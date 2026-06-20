
import jwt from 'jsonwebtoken';
import redis from '../config/redis.js';
import { jwtExpires, jwtSecret, algorithm, jwtRefresSecret, jwtExpiresRefresSecret } from '../constent/constent.js';

export const generateAccessToken = (userId, jwtExpires = '62m') => {
    return jwt.sign(
        { userId },
        jwtSecret,
        { expiresIn: jwtExpires, algorithm }
    );
};



export const generateRefreshToken = async (userId, redisKey) => {
    const refreshToken = jwt.sign(
        { userId },
        jwtRefresSecret,
        { expiresIn: jwtExpiresRefresSecret, algorithm }
    );

    await redis.set(
        redisKey,
        refreshToken,
        "EX",
        jwtExpiresRefresSecret
    );

    return refreshToken;
};
export const verifyAccessToken = async (token) => {
    try {
        return jwt.verify(token, jwtSecret);
    } catch (err) {
        return null;
    }

};

export const verifyRefreshToken = async (refreshToken, validertor = 0) => {
    try {
        const decoded = jwt.verify(refreshToken, jwtRefresSecret);
        const redisKey = (validertor == 0) ? `refresh:${decoded.userId}` : `refresh_Validator:${decoded.userId}`
        const storedToken = await redis.get(redisKey);

        if (!storedToken) {
            return { status: false, message: "Session expired" };
        }

        if (storedToken !== refreshToken) {
            return { status: false, message: "Invalid refresh token" };
        }

        return { status: true, userId: decoded.userId };
    } catch (err) {
        return { status: false, message: "Refresh token invalid or expired" };
    }
};
export const refreshTokenService = async (refreshToken, validator = 0) => {
    const result = await verifyRefreshToken(refreshToken, validator);

    if (!result.status) {
        return result;
    }

    const newAccessToken = generateAccessToken(result.userId);

    return {

        accessToken: newAccessToken
    };
};


export const verifyRefreshJwt = async (refreshToken) => {
    try {
        return jwt.verify(
            refreshToken,
            jwtRefresSecret
        );
    } catch (err) {
        return null;
    }
};

export const getOldRefreshTokenHash = async (redisKey) => {
    return redis.get(redisKey);
};

export const logoutService = async (refreshToken) => {
    try {
        // 1️⃣ verify refresh token
        const decoded = await verifyRefreshJwt(refreshToken);
        const userId = decoded.userId; // mobile

        if (!userId) {
            return { status: false, message: "Unauthorized" };
        }

        // 2️⃣ redis key
        const redisKey = `refresh:${userId}`;

        // 3️⃣ delete refresh token
        await redis.del(redisKey);

        return { status: true };
    } catch (err) {
        return { status: false, message: "Invalid refresh token" };
    }
};

