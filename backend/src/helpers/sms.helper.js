import axios from 'axios';

export const sendSms = async ({ mobile, templateid, peid, sendOtpUrl, message, otp }) => {
    try {
        if (!mobile || !templateid || !peid || !sendOtpUrl || !message || !otp) {
            throw new Error('Missing required fields in sendSms');
        }

        const postData = new URLSearchParams({
            mobile: process.env.SMS_ACCOUNT_MOBILE,
            pass: process.env.SMS_PASS,
            senderid: process.env.SMS_SENDERID,
            to: mobile,
            otp,
            msg: message,
            peid,
            templateid
        }).toString();

        const response = await axios.post(sendOtpUrl, postData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        console.log('📩 SMS API Response:', response.data);

        return true;

    } catch (err) {
        console.error('❌ SMS send failed:', err.message);
        return false; // never throw, background safe
    }
};
