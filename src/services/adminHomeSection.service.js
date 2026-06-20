import pool from "../config/database.js";

/**
 * Home page sections (replaces hand-editing the DB). A section references a
 * home_section_type by type_id and renders `item_limit` items in `layout`.
 */

export const listHomeSectionsService = async () => {
  const [rows] = await pool.query(
    `SELECT s.id, s.title, s.type_id, t.code AS type_code, t.name AS type_name,
            s.item_limit, s.layout, s.status, s.sort_order, s.created_at
     FROM home_sections s
     LEFT JOIN home_section_types t ON t.id = s.type_id
     ORDER BY s.sort_order ASC, s.id ASC`
  );
  return rows;
};

export const listHomeSectionTypesService = async () => {
  const [rows] = await pool.query(
    `SELECT id, code, name, description, status FROM home_section_types ORDER BY id ASC`
  );
  return rows;
};

export const createHomeSectionService = async (body) => {
  const { title, type_id, item_limit, layout, status, sort_order } = body;
  if (!title) throw new Error("title is required");
  if (!type_id) throw new Error("type_id is required");
  const [res] = await pool.query(
    `INSERT INTO home_sections (title, type_id, item_limit, layout, status, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      title,
      type_id,
      item_limit != null ? Number(item_limit) : 10,
      layout || "grid",
      status != null ? Number(status) : 1,
      sort_order != null ? Number(sort_order) : 0
    ]
  );
  return { id: res.insertId };
};

export const updateHomeSectionService = async (id, body) => {
  const allowed = ["title", "type_id", "item_limit", "layout", "status", "sort_order"];
  const sets = [];
  const params = [];
  for (const k of allowed) {
    if (body[k] !== undefined) { sets.push(`${k} = ?`); params.push(body[k]); }
  }
  if (!sets.length) throw new Error("No updatable fields provided");
  const [res] = await pool.query(
    `UPDATE home_sections SET ${sets.join(", ")} WHERE id = ?`,
    [...params, id]
  );
  if (res.affectedRows === 0) throw new Error("Home section not found");
  return { id: Number(id), updated: true };
};

export const deleteHomeSectionService = async (id) => {
  const [res] = await pool.query(`DELETE FROM home_sections WHERE id = ?`, [id]);
  if (res.affectedRows === 0) throw new Error("Home section not found");
  return { id: Number(id), deleted: true };
};

/** Bulk reorder: items = [{ id, sort_order }, ...] */
export const reorderHomeSectionsService = async (items = []) => {
  if (!Array.isArray(items) || !items.length) throw new Error("items[] required");
  for (const it of items) {
    await pool.query(`UPDATE home_sections SET sort_order = ? WHERE id = ?`, [Number(it.sort_order) || 0, it.id]);
  }
  return { reordered: items.length };
};
