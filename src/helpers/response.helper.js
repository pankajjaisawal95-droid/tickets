/**
 * SUCCESS RESPONSE
 */
export const success = (res, data, message = 'Success', statusCode = 200) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data
    });
};


export const error = (res, message = 'Error', statusCode = 400, errors = null) => {
    return res.status(statusCode).json({
        success: false,
        message,
        ...(errors && { errors })
    });
};
