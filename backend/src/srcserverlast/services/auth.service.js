

import pool from '../config/database.js';
export const userUpsertBackground = async (mobile) => {
    try {
        const [rows] = await pool.query(
            'SELECT id FROM users WHERE mobile = ? LIMIT 1',
            [mobile]
        );

        if (!rows.length) {
            await pool.query(
                'INSERT INTO users (mobile, status,role_id ) VALUES (?, ?,?)',
                [mobile, 'ACTIVE', 1]
            );
        }
    } catch (err) {
        console.error('User upsert failed:', err);
    }
};

export const count_check = async (mobile) => {
    try {
        const [rows] = await pool.query(
            `
            SELECT 
                ud.id AS device_row_id,
                ud.user_id,
                ud.device_id,
                ud.device_name,
                ud.ip_address,
                ud.last_active,
                u.device_limit
            FROM user_devices ud
            LEFT JOIN users u ON u.id = ud.user_id
            WHERE ud.is_active = 1
              AND u.mobile = ?
            ORDER BY ud.last_active DESC
            `,
            [mobile]
        );
        // console.log(rows.length)
        // No active device → allow
        if (rows.length === 0) {
            return {
                status: true,
                allow: true
            };
        }

        const activeDeviceCount = rows.length;
        const deviceLimit = rows[0].device_limit;

        if (activeDeviceCount >= deviceLimit) {
            return {
                status: false,
                allow: false,
                message: `Please logout from another device. Max limit ${deviceLimit}`,
                devices: rows.map(row => ({
                    device_id: row.device_id,
                    device_name: row.device_name,
                    ip_address: row.ip_address,
                    last_login_at: row.last_active
                }))
            };
        }

        return {
            status: true,
            allow: true
        };

    } catch (err) {
        console.error("count_check error:", err);
        throw err;
    }
};



export const userDeviceUpsertBackground = async (
    mobile,
    deviceId,
    deviceName,
    ipAddress = null
) => {
    try {
        const userRes = await getUserDetail(mobile);
        if (!userRes?.status || !userRes.user?.id) {
            console.warn('[DeviceUpsert] User not found:', mobile);
            return; // background → silently stop
        }

        const userId = userRes.user.id;

        await pool.query(
            `
      INSERT INTO user_devices
        (user_id, device_id, device_name, ip_address, is_active, last_active)
      VALUES (?, ?, ?, ?, 1, NOW())
      ON DUPLICATE KEY UPDATE
        device_name = VALUES(device_name),
        ip_address = VALUES(ip_address),
        is_active = 1,
        last_active = NOW()
      `,
            [userId, deviceId, deviceName, ipAddress]
        );

    } catch (err) {
        // 🔥 IMPORTANT: never throw in background job
        console.error('[DeviceUpsert] Failed:', {
            mobile,
            deviceId,
            error: err.message
        });
    }
};



export const getUserDetail = async (mobile) => {
    try {
        const [rows] = await pool.query(
            `
            SELECT
                id,
                name,
                mobile,
                email,
                status,
                role_id,
                device_limit,
                created_at
            FROM users
            WHERE mobile = ?
            LIMIT 1
            `,
            [mobile]
        );

        if (rows.length === 0) {
            return {
                status: false,
                message: "User not found"
            };
        }

        return {
            status: true,
            user: rows[0]
        };

    } catch (err) {
        console.error("getUserDetail error:", err);
        throw err;
    }
};


export const user_verified = async (mobile) => {
    try {

        const [rows] = await pool.query(
            `
                    SELECT id,device_id,device_name,status
                    FROM ticket_validator
                    WHERE mobile = ?
                    AND is_verified = 1
                    LIMIT 1
                    `,
            [mobile]
        );

        if (rows.length === 0) {
            return {
                status: false,
                message: "User not found"
            };
        }
        const validator = rows[0];

        // if (validator.status == 'ACTIVE') {
        //     return {
        //         status: false,
        //         message: `You are already logged in on device ${validator.device_name} (${validator.device_id})`
        //     };
        // }


        return {
            status: true,
            user: validator
        };
    } catch (err) {
        console.log(err)
    }
}
export const getvalidaterdetails = async (mobile) => {
    try {

        const [rows] = await pool.query(
            `
                    SELECT id,device_id,device_name,status
                    FROM ticket_validator
                    WHERE mobile = ?
                    AND is_verified = 1
                    LIMIT 1
                    `,
            [mobile]
        );

        if (rows.length === 0) {
            return {
                status: false,
                message: "User not found"
            };
        }
        const validator = rows[0];

        if (validator.status == 'ACTIVE') {
           return {
            status: true,
            user: validator
        };
        }


       
    } catch (err) {
        console.log(err)
    }
}
export const updateUserDetail = async (mobile, deviceId, deviceName) => {
    try {
        const [result] = await pool.query(
            `
            UPDATE ticket_validator
            SET 
            device_id = ?,
                device_name = ?,
                status = 'ACTIVE',
                updated_at = NOW()
            WHERE mobile = ?
            `,
            [deviceId, deviceName, mobile]
        );

        if (result.affectedRows === 0) {
            return {
                status: false,
                message: "User not updated"
            };
        }

        return {
            status: true,
            message: "User device updated successfully"
        };

    } catch (err) {
        console.error("updateUserDetail error:", err);
    }
};

export const checkEmailExists = async (email, excludeUserId = null) => {
  try {
    let query = 'SELECT id FROM users WHERE email = ?';
    const params = [email];

    if (excludeUserId) {
      query += ' AND id != ?';
      params.push(excludeUserId);
    }
    const [rows] = await pool.query(query, params);
    return rows.length > 0;
  } catch (err) {
    console.error('checkEmailExists error:', err);
    throw err;
  }
};

export const updateUserProfile = async (data, userId) => {
  try {
    const { email, name } = data;
    const [result] = await pool.query(
      `
      UPDATE users
      SET
        email  = COALESCE(?, email),
        name   = COALESCE(?, name)
      WHERE id = ?
      `,
      [email, name, userId]
    );
    if (result.affectedRows === 0) {
      return { status: false, message: 'Profile update failed' };
    }
    return { status: true };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return { status: false, message: 'Email or mobile already exists' };
    }
    throw err;
  }
};


/**
 * Returns the user's most recently saved "save for next booking" contact
 * detail (sync_user_data = 1), independent of event, for auto-filling the
 * checkout form. Returns null when nothing was saved.
 */
export const getSavedEventUserDetail = async (userId) => {
  const [rows] = await pool.query(
    `
    SELECT name, whatsapp_no, email
    FROM event_user_detail
    WHERE user_id = ? AND sync_user_data = 1 AND status = 1
    ORDER BY creation_time DESC, id DESC
    LIMIT 1
    `,
    [userId]
  );

  return rows[0] || null;
};

export const upsertEventUserDetail = async (data) => {
    console.log("Upsert event user detail called with data:", data); // Debug log
  try {
    const { user_id, name, mobile, email, event_id, sync_user_data } = data;
    const currentTime = new Date();

    // 🔥 STEP 1: Check record exists or not
    const [existing] = await pool.query(
      `
      SELECT id FROM event_user_detail
      WHERE user_id = ? AND event_id = ? AND whatsapp_no = ?
      LIMIT 1
      `,
      [user_id, event_id, mobile]
    );

    if (existing.length > 0) {
      // ===============================
      // ✅ UPDATE CASE
      // ===============================
      await pool.query(
        `
        UPDATE event_user_detail
        SET name = ?, 
            whatsapp_no = ?, 
            email = ?, 
            sync_user_data = ?, 
            updation_time = ?
        WHERE user_id = ? AND event_id = ?
        `,
        [
          name,
          mobile,
          email,
          sync_user_data,
          currentTime,
          user_id,
          event_id
        ]
      );

      return { status: true, action: "updated" };

    } else {
      // ===============================
      // ✅ INSERT CASE
      // ===============================
      const [result] = await pool.query(
        `
        INSERT INTO event_user_detail
        (user_id, name, whatsapp_no, email, event_id, sync_user_data, creation_time, updation_time, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          user_id,
          name,
          mobile,
          email,
          event_id,
          sync_user_data,
          currentTime,
          currentTime,
          1
        ]
      );

      return { status: true, action: "inserted", insertId: result.insertId };
    }

  } catch (err) {
    throw err;
  }
};

export const insertEventUserDetail = async (data) => {
  try {
    const { user_id, name, mobile, email, event_id } = data;
    const currentTime = new Date();

    // const [existing] = await pool.query(
    //   `
    //   SELECT id FROM event_user_detail
    //   WHERE user_id = ? AND event_id = ?
    //   LIMIT 1
    //   `,
    //   [user_id, event_id]
    // );

    // if (existing.length > 0) {
    //   return {
    //     status: false,
    //     message: 'User already registered for this event'
    //   };
    // }

    const [result] = await pool.query(
      `
      INSERT INTO event_user_detail
      (user_id, name, whatsapp_no, email, event_id, creation_time, updation_time, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        user_id,
        name,
        mobile,
        email,
        event_id,
        currentTime,
        currentTime,
        1
      ]
    );

    return {
      status: true,
      insertId: result.insertId
    };

  } catch (err) {
    throw err;
  }
};


