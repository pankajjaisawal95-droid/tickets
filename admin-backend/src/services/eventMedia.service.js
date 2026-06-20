import pool from "../config/database.js";

/* ------------------------------- gallery ---------------------------------- */

export const addGalleryImageService = async (eventId, { image_url, caption, sort_order }) => {
  if (!image_url) throw new Error("image_url is required");
  const [res] = await pool.query(
    `INSERT INTO event_gallery (event_id, image_url, caption, sort_order)
     VALUES (?, ?, ?, ?)`,
    [eventId, image_url, caption || null, Number(sort_order) || 0]
  );
  return { id: res.insertId };
};

export const deleteGalleryImageService = async (id) => {
  await pool.query(`UPDATE event_gallery SET status = 0 WHERE id = ?`, [id]);
  return { id, deleted: true };
};

export const updateGalleryImageService = async (id, { image_url, caption, sort_order, status }) => {
  const sets = [];
  const params = [];
  if (image_url !== undefined) { sets.push("image_url = ?"); params.push(image_url); }
  if (caption !== undefined) { sets.push("caption = ?"); params.push(caption || null); }
  if (sort_order !== undefined) { sets.push("sort_order = ?"); params.push(Number(sort_order) || 0); }
  if (status !== undefined) { sets.push("status = ?"); params.push(Number(status) ? 1 : 0); }
  if (!sets.length) throw new Error("Nothing to update");
  await pool.query(`UPDATE event_gallery SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
  return { id: Number(id), updated: true };
};

/** Bulk reorder: items = [{ id, sort_order }, ...] */
export const reorderGalleryService = async (items = []) => {
  if (!Array.isArray(items) || !items.length) throw new Error("items[] required");
  for (const it of items) {
    await pool.query(`UPDATE event_gallery SET sort_order = ? WHERE id = ?`, [Number(it.sort_order) || 0, it.id]);
  }
  return { reordered: items.length };
};

/* ------------------------------- artists ---------------------------------- */

export const addArtistService = async (eventId, { name, image_url, role, sort_order }) => {
  if (!name) throw new Error("name is required");
  const [res] = await pool.query(
    `INSERT INTO event_artists (event_id, name, image_url, role, sort_order)
     VALUES (?, ?, ?, ?, ?)`,
    [eventId, name, image_url || null, role || null, Number(sort_order) || 0]
  );
  return { id: res.insertId };
};

export const deleteArtistService = async (id) => {
  await pool.query(`UPDATE event_artists SET status = 0 WHERE id = ?`, [id]);
  return { id, deleted: true };
};

export const updateArtistService = async (id, { name, image_url, role, sort_order, status }) => {
  const sets = [];
  const params = [];
  if (name !== undefined) { sets.push("name = ?"); params.push(name); }
  if (image_url !== undefined) { sets.push("image_url = ?"); params.push(image_url || null); }
  if (role !== undefined) { sets.push("role = ?"); params.push(role || null); }
  if (sort_order !== undefined) { sets.push("sort_order = ?"); params.push(Number(sort_order) || 0); }
  if (status !== undefined) { sets.push("status = ?"); params.push(Number(status) ? 1 : 0); }
  if (!sets.length) throw new Error("Nothing to update");
  await pool.query(`UPDATE event_artists SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
  return { id: Number(id), updated: true };
};

/** Bulk reorder: items = [{ id, sort_order }, ...] */
export const reorderArtistsService = async (items = []) => {
  if (!Array.isArray(items) || !items.length) throw new Error("items[] required");
  for (const it of items) {
    await pool.query(`UPDATE event_artists SET sort_order = ? WHERE id = ?`, [Number(it.sort_order) || 0, it.id]);
  }
  return { reordered: items.length };
};

/* ----------------------------- admin listing ------------------------------ */

export const listEventMediaService = async (eventId) => {
  const [gallery] = await pool.query(
    `SELECT id, image_url, caption, sort_order, status
     FROM event_gallery WHERE event_id = ? ORDER BY sort_order ASC, id ASC`,
    [eventId]
  );
  const [artists] = await pool.query(
    `SELECT id, name, image_url, role, sort_order, status
     FROM event_artists WHERE event_id = ? ORDER BY sort_order ASC, id ASC`,
    [eventId]
  );
  return { gallery, artists };
};
