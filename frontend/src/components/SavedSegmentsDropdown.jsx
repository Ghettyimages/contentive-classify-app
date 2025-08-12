import React, { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { slog, serror } from '../utils/log';

const auth = getAuth();
const db = getFirestore();

export default function SavedSegmentsDropdown({ value, onChange, onLoaded }) {
  const [uid, setUid] = useState(null);
  const [items, setItems] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u ? u.uid : null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid) {
      setItems([]);
      return;
    }
    const q = query(collection(db, 'users', uid, 'segments'), orderBy('server_timestamp', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      slog('Loaded saved segments', rows);
      setItems(rows);
      onLoaded && onLoaded(rows);
    }, (err) => {
      serror('onSnapshot segments failed', err);
    });
    return () => unsub();
  }, [uid, onLoaded]);

  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span>Saved Segments</span>
      <select value={value || ''} onChange={(e) => onChange?.(e.target.value)}>
        <option value="">— Select saved segment —</option>
        {items.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name || s.id} {typeof s.total_urls === 'number' ? `(${s.total_urls})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}