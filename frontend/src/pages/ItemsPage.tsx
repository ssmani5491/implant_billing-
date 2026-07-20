import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../context/AuthContext';
import type { Item, MasterOption, PaginatedResponse } from '../types';

const PAGE_SIZE = 50;

const emptyForm = {
  id: 0,
  item_code: '',
  item_name: '',
  category_id: '' as number | '',
  purchase_cost: '' as number | '',
  mrp: 0,
  unit_id: '' as number | '',
  is_active: true,
};

export function ItemsPage() {
  const { can } = useAuth();
  const canCreate = can('items', 'create');
  const canEdit = can('items', 'edit');
  const canDelete = can('items', 'delete');
  const canManage = canEdit || canDelete;

  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [categories, setCategories] = useState<MasterOption[]>([]);
  const [units, setUnits] = useState<MasterOption[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadItems = async (targetPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<PaginatedResponse<Item>>('/items', {
        params: { page: targetPage, pageSize: PAGE_SIZE, search: search || undefined },
      });
      setItems(data.data);
      setPage(data.page);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load items.'));
    } finally {
      setLoading(false);
    }
  };

  const loadOptions = async () => {
    try {
      const [categoryRes, unitRes] = await Promise.all([
        apiClient.get<MasterOption[]>('/categories', { params: { activeOnly: 'true' } }),
        apiClient.get<MasterOption[]>('/units', { params: { activeOnly: 'true' } }),
      ]);
      setCategories(categoryRes.data);
      setUnits(unitRes.data);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to load category/unit options.'));
    }
  };

  useEffect(() => {
    loadOptions();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => loadItems(1), 250);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const openCreateForm = () => {
    setForm(emptyForm);
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (item: Item) => {
    setForm({
      id: item.id,
      item_code: item.item_code,
      item_name: item.item_name,
      category_id: item.category_id ?? '',
      purchase_cost: item.purchase_cost === null ? '' : item.purchase_cost,
      mrp: item.mrp,
      unit_id: item.unit_id ?? '',
      is_active: !!item.is_active,
    });
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setFormError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        item_name: form.item_name,
        category_id: form.category_id === '' ? null : Number(form.category_id),
        purchase_cost: form.purchase_cost === '' ? null : Number(form.purchase_cost),
        mrp: Number(form.mrp),
        unit_id: form.unit_id === '' ? null : Number(form.unit_id),
        is_active: form.is_active,
      };

      if (form.id) {
        await apiClient.put(`/items/${form.id}`, payload);
      } else {
        await apiClient.post('/items', payload);
      }

      setShowForm(false);
      await loadItems(form.id ? page : 1);
    } catch (err) {
      setFormError(extractErrorMessage(err, 'Failed to save item.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: Item) => {
    if (!confirm(`Delete item "${item.item_name}"?`)) return;
    try {
      await apiClient.delete(`/items/${item.id}`);
      await loadItems(items.length === 1 && page > 1 ? page - 1 : page);
    } catch (err) {
      setError(extractErrorMessage(err, 'Failed to delete item.'));
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>Item Master</h1>
        {canCreate && <button onClick={openCreateForm}>+ Add Item</button>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <input
        className="search-input"
        placeholder="Search by code or name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {showForm && (
        <div className="modal-backdrop" onClick={closeForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{form.id ? 'Edit Item' : 'Add Item'}</h2>

            {formError && <div className="alert alert-error">{formError}</div>}

            <div className="form-grid">
              {form.id ? (
                <label>
                  Item Code
                  <input value={form.item_code} readOnly disabled />
                </label>
              ) : null}
              <label>
                Item Name
                <input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} />
              </label>
              <label>
                Category
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value === '' ? '' : Number(e.target.value) })}
                >
                  <option value="">Select category</option>
                  {categories.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Purchase Cost
                <input
                  type="number"
                  value={form.purchase_cost}
                  onChange={(e) => setForm({ ...form, purchase_cost: e.target.value === '' ? '' : Number(e.target.value) })}
                />
              </label>
              <label>
                MRP
                <input
                  type="number"
                  value={form.mrp}
                  onChange={(e) => setForm({ ...form, mrp: Number(e.target.value) })}
                />
              </label>
              <label>
                Unit
                <select
                  value={form.unit_id}
                  onChange={(e) => setForm({ ...form, unit_id: e.target.value === '' ? '' : Number(e.target.value) })}
                >
                  <option value="">Select unit</option>
                  {units.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Active
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={closeForm} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.item_name.trim() || !form.category_id || !form.unit_id}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Purchase Cost</th>
                <th>MRP</th>
                <th>Unit</th>
                <th>Active</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.item_code}</td>
                  <td>{item.item_name}</td>
                  <td>{item.category_name || '-'}</td>
                  <td>{item.purchase_cost === null ? '-' : Number(item.purchase_cost).toFixed(2)}</td>
                  <td>{Number(item.mrp).toFixed(2)}</td>
                  <td>{item.unit_name || '-'}</td>
                  <td>{item.is_active ? 'Yes' : 'No'}</td>
                  {canManage && (
                    <td className="table-actions">
                      {canEdit && <button onClick={() => openEditForm(item)}>Edit</button>}
                      {canDelete && (
                        <button onClick={() => handleDelete(item)} className="btn-danger">
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="empty-row">
                    No items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <Pagination page={page} totalPages={totalPages} onChange={loadItems} />
        </>
      )}
    </div>
  );
}
