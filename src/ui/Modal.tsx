import { ReactNode } from 'react';

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fp-modal-backdrop" onPointerDown={onClose}>
      <div
        className={wide ? 'fp-modal wide' : 'fp-modal'}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="fp-modal-head">
          <h2>{title}</h2>
          <button className="fp-icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="fp-modal-body">{children}</div>
      </div>
    </div>
  );
}
