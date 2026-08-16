/**
 * Inline name input with confirm/cancel — used when naming a saved profile.
 * A <form> so Enter submits natively; Escape cancels. Matches the server's
 * 80-char name cap.
 */
import { useState } from 'react';

export function InlineNameField({
  initialValue = '',
  placeholder,
  onSubmit,
  onCancel,
}: {
  initialValue?: string;
  placeholder?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <form
      className="inline-name-field"
      onSubmit={(e) => {
        e.preventDefault();
        const name = value.trim();
        if (name) {
          onSubmit(name);
        }
      }}
    >
      <input
        className="inline-name-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        maxLength={80}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onCancel();
          }
        }}
      />
      <button type="submit" className="chip" disabled={!value.trim()}>
        Save
      </button>
      <button type="button" className="chip" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
