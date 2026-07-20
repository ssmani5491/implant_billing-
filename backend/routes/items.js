const express = require('express');
const pool = require('../db/mysql');
const { requireAuth, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

const SELECT_WITH_JOINS = `
  SELECT items.*, categories.name AS category_name, units.name AS unit_name
  FROM items
  LEFT JOIN categories ON categories.id = items.category_id
  LEFT JOIN units ON units.id = items.unit_id
`;

async function generateItemCode(conn) {
  await conn.query(
    'INSERT INTO item_sequences (id, last_seq) VALUES (1, 0) ON DUPLICATE KEY UPDATE id = id'
  );

  await conn.query('SELECT last_seq FROM item_sequences WHERE id = 1 FOR UPDATE');

  await conn.query('UPDATE item_sequences SET last_seq = last_seq + 1 WHERE id = 1');

  const [seqRows] = await conn.query('SELECT last_seq FROM item_sequences WHERE id = 1');
  const seq = seqRows[0].last_seq;

  return `IMP-${String(seq).padStart(3, '0')}`;
}

async function findDuplicateItemName(conn, itemName, excludeId) {
  let sql = 'SELECT id, item_code FROM items WHERE LOWER(item_name) = LOWER(?)';
  const params = [itemName];
  if (excludeId) {
    sql += ' AND id != ?';
    params.push(excludeId);
  }
  const [rows] = await conn.query(sql, params);
  return rows[0] || null;
}

async function categoryExists(conn, categoryId) {
  const [rows] = await conn.query('SELECT id FROM categories WHERE id = ?', [categoryId]);
  return rows.length > 0;
}

async function unitExists(conn, unitId) {
  const [rows] = await conn.query('SELECT id FROM units WHERE id = ?', [unitId]);
  return rows.length > 0;
}

router.get('/', requirePermission('items', 'view'), async (req, res) => {
  const { search, activeOnly } = req.query;

  // Unpaginated callers (item-picker dropdowns on the invoice form, etc.)
  // pass paginate=false and rely on activeOnly=true to keep the payload
  // reasonable; everything else (Item Master screen) paginates server-side.
  const paginate = req.query.paginate !== 'false';

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
  const offset = (page - 1) * pageSize;

  let where = 'WHERE 1=1';
  const params = [];

  if (search) {
    where += ' AND (items.item_code LIKE ? OR items.item_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (activeOnly === 'true') {
    where += ' AND items.is_active = 1';
  }

  try {
    if (!paginate) {
      const [rows] = await pool.query(`${SELECT_WITH_JOINS} ${where} ORDER BY items.item_name ASC`, params);
      return res.json(rows);
    }

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM items ${where}`, params);
    const total = countRows[0].total;

    const [rows] = await pool.query(
      `${SELECT_WITH_JOINS} ${where} ORDER BY items.item_name ASC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({ data: rows, page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 });
  } catch (err) {
    console.error('List items error:', err.message);
    res.status(500).json({ error: 'Failed to fetch items.' });
  }
});

router.get('/:id', requirePermission('items', 'view'), async (req, res) => {
  try {
    const [rows] = await pool.query(`${SELECT_WITH_JOINS} WHERE items.id = ?`, [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Item not found.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Get item error:', err.message);
    res.status(500).json({ error: 'Failed to fetch item.' });
  }
});

router.post('/', requirePermission('items', 'create'), async (req, res) => {
  const { item_name, category_id, purchase_cost, mrp, unit_id, is_active } = req.body || {};

  if (!item_name) {
    return res.status(400).json({ error: 'item_name is required.' });
  }

  if (!category_id) {
    return res.status(400).json({ error: 'category_id is required.' });
  }

  if (!unit_id) {
    return res.status(400).json({ error: 'unit_id is required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (!(await categoryExists(conn, category_id))) {
      await conn.rollback();
      return res.status(400).json({ error: 'Selected category does not exist.' });
    }

    if (!(await unitExists(conn, unit_id))) {
      await conn.rollback();
      return res.status(400).json({ error: 'Selected unit does not exist.' });
    }

    const duplicate = await findDuplicateItemName(conn, item_name);
    if (duplicate) {
      await conn.rollback();
      return res.status(409).json({
        error: `An item named '${item_name}' already exists (code ${duplicate.item_code}).`,
      });
    }

    const itemCode = await generateItemCode(conn);

    const [result] = await conn.query(
      `INSERT INTO items (item_code, item_name, category_id, purchase_cost, mrp, unit_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        itemCode,
        item_name,
        category_id,
        purchase_cost === undefined || purchase_cost === '' ? null : purchase_cost,
        mrp || 0,
        unit_id,
        is_active === undefined ? 1 : is_active ? 1 : 0,
      ]
    );

    const [rows] = await conn.query(`${SELECT_WITH_JOINS} WHERE items.id = ?`, [result.insertId]);

    await conn.commit();

    res.status(201).json(rows[0]);
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // Rollback can fail if the connection is already broken; the original error is what matters.
    }
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `An item named '${item_name}' already exists.` });
    }
    console.error('Create item error:', err.message);
    res.status(500).json({ error: 'Failed to create item.' });
  } finally {
    conn.release();
  }
});

router.put('/:id', requirePermission('items', 'edit'), async (req, res) => {
  const { item_name, category_id, purchase_cost, mrp, unit_id, is_active } = req.body || {};

  if (!item_name) {
    return res.status(400).json({ error: 'item_name is required.' });
  }

  if (!category_id) {
    return res.status(400).json({ error: 'category_id is required.' });
  }

  if (!unit_id) {
    return res.status(400).json({ error: 'unit_id is required.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (!(await categoryExists(conn, category_id))) {
      await conn.rollback();
      return res.status(400).json({ error: 'Selected category does not exist.' });
    }

    if (!(await unitExists(conn, unit_id))) {
      await conn.rollback();
      return res.status(400).json({ error: 'Selected unit does not exist.' });
    }

    const duplicate = await findDuplicateItemName(conn, item_name, req.params.id);
    if (duplicate) {
      await conn.rollback();
      return res.status(409).json({
        error: `An item named '${item_name}' already exists (code ${duplicate.item_code}).`,
      });
    }

    const [beforeRows] = await conn.query(`${SELECT_WITH_JOINS} WHERE items.id = ?`, [req.params.id]);
    req.auditBefore = beforeRows[0];
    req.auditIgnoreFields = ['category_name', 'unit_name'];

    const [result] = await conn.query(
      `UPDATE items SET item_name = ?, category_id = ?, purchase_cost = ?, mrp = ?, unit_id = ?, is_active = ?
       WHERE id = ?`,
      [
        item_name,
        category_id,
        purchase_cost === undefined || purchase_cost === '' ? null : purchase_cost,
        mrp || 0,
        unit_id,
        is_active ? 1 : 0,
        req.params.id,
      ]
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Item not found.' });
    }

    const [rows] = await conn.query(`${SELECT_WITH_JOINS} WHERE items.id = ?`, [req.params.id]);

    await conn.commit();

    res.json(rows[0]);
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // Rollback can fail if the connection is already broken; the original error is what matters.
    }
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: `An item named '${item_name}' already exists.` });
    }
    console.error('Update item error:', err.message);
    res.status(500).json({ error: 'Failed to update item.' });
  } finally {
    conn.release();
  }
});

router.delete('/:id', requirePermission('items', 'delete'), async (req, res) => {
  try {
    const [beforeRows] = await pool.query(`${SELECT_WITH_JOINS} WHERE items.id = ?`, [req.params.id]);
    if (beforeRows.length === 0) {
      return res.status(404).json({ error: 'Item not found.' });
    }
    req.auditBefore = beforeRows[0];
    req.auditIgnoreFields = ['category_name', 'unit_name'];

    const [result] = await pool.query('DELETE FROM items WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Item not found.' });
    }
    res.status(204).send();
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        error: 'This item is used on existing invoices and cannot be deleted. Consider marking it inactive instead.',
      });
    }
    console.error('Delete item error:', err.message);
    res.status(500).json({ error: 'Failed to delete item.' });
  }
});

module.exports = router;
