import { useEffect, useState } from 'react';
import { apiClient, extractErrorMessage } from '../api/client';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../context/AuthContext';
import { usePaginatedList } from '../hooks/usePaginatedList';
import type { MasterOption, Screen } from '../types';

interface MasterSectionProps {
  title: string;
  endpoint: string;
  itemLabel: string;
  screen: Screen;
}

const emptyForm = { id: 0, name: '', is_active: true };

function MasterSection({ title, endpoint, itemLabel, screen }: MasterSectionProps) {
  const { can } = useAuth();
  const canCreate = can(screen, 'create');
  const canEdit = can(screen, 'edit');
  const canDelete = can(screen, 'delete');

  const [rows, setRows] = useState<MasterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { pageItems, page, totalPages, setPage } = usePaginatedList(rows, 20);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<MasterOption[]>(endpoint);
      setRows(data);
    } catch (err) {
      setError(extractErrorMessage(err, `Failed to load ${itemLabel}s.`));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  const openCreateForm = () => {
    setForm(emptyForm);
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = (row: MasterOption) => {
    setForm({ id: row.id, name: row.name, is_active: !!row.is_active });
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
      const payload = { name: form.name, is_active: form.is_active };
      if (form.id) {
        await apiClient.put(`${endpoint}/${form.id}`, payload);
      } else {
        await apiClient.post(endpoint, payload);
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(extractErrorMessage(err, `Failed to save ${itemLabel}.`));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: MasterOption) => {
    if (!confirm(`Delete ${itemLabel} "${row.name}"?`)) return;
    setError(null);
    try {
      await apiClient.delete(`${endpoint}/${row.id}`);
      await load();
    } catch (err) {
      setError(extractErrorMessage(err, `Failed to delete ${itemLabel}.`));
    }
  };

  return (
    <section className="card">
      <div className="page-header">
        <h2>{title}</h2>
        {canCreate && <button onClick={openCreateForm}>+ Add {itemLabel}</button>}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <div className="modal-backdrop" onClick={closeForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{form.id ? `Edit ${itemLabel}` : `Add ${itemLabel}`}</h2>

            {formError && <div className="alert alert-error">{formError}</div>}

            <div className="form-grid">
              <label>
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
              <button onClick={handleSave} disabled={saving || !form.name.trim()}>
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
                <th>Name</th>
                <th>Active</th>
                {(canEdit || canDelete) && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.is_active ? 'Yes' : 'No'}</td>
                  {(canEdit || canDelete) && (
                    <td className="table-actions">
                      {canEdit && <button onClick={() => openEditForm(row)}>Edit</button>}
                      {canDelete && (
                        <button onClick={() => handleDelete(row)} className="btn-danger">
                          Delete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={canEdit || canDelete ? 3 : 2} className="empty-row">
                    No {itemLabel}s found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </section>
  );
}

export function MastersPage() {
  const { canView } = useAuth();

  return (
    <div className="page">
      <h1>Masters</h1>
      {canView('categories') && (
        <MasterSection title="Categories" endpoint="/categories" itemLabel="category" screen="categories" />
      )}
      {canView('units') && <MasterSection title="Units" endpoint="/units" itemLabel="unit" screen="units" />}
      {canView('vendors') && (
        <MasterSection title="Vendors" endpoint="/vendors" itemLabel="vendor" screen="vendors" />
      )}
    </div>
  );
}
