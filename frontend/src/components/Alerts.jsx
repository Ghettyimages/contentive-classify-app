export function InlineAlert({ type = 'warning', children }) {
  const color = type === 'error' ? '#B00020' : '#8a6d3b';
  const bg = type === 'error' ? '#fdecea' : '#fcf8e3';
  const border = type === 'error' ? '#f5c6cb' : '#faebcc';
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, color, padding: 8, borderRadius: 8 }}>
      {children}
    </div>
  );
}