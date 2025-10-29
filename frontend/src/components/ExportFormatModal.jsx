import React, { useState, useEffect } from 'react';

export default function ExportFormatModal({ open, onClose, onConfirm }) {
	const [fmt, setFmt] = useState('csv');
	useEffect(() => {
		if (open) setFmt('csv');
	}, [open]);
	if (!open) return null;
	return (
		<div className="modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 1000 }}>
			<div className="modal-card" style={{ background: '#fff', padding: 16, borderRadius: 8, minWidth: 320 }}>
				<h3 style={{ marginTop: 0 }}>Export current view</h3>
				<div role="group" style={{ display: 'flex', gap: 16, margin: '12px 0' }}>
					<label><input type="radio" name="fmt" value="csv" checked={fmt === 'csv'} onChange={() => setFmt('csv')} /> CSV</label>
					<label><input type="radio" name="fmt" value="json" checked={fmt === 'json'} onChange={() => setFmt('json')} /> JSON</label>
				</div>
				<div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
					<button onClick={onClose}>Cancel</button>
					<button onClick={() => onConfirm(fmt)}>Export</button>
				</div>
			</div>
		</div>
	);
}