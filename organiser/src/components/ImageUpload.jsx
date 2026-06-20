import { useRef, useState } from 'react';
import { uploadFile, assetUrl } from '../api/client.js';
import { useToast } from './Toast.jsx';

/**
 * Image field: pick a file → uploads to /organiser/upload → emits the stored URL via
 * onChange. Also accepts a pasted URL, a drag-and-dropped file, or a pasted image
 * from the clipboard. Shows a live preview.
 *
 * Drag-drop / clipboard-paste exist so uploads work even when the browser's
 * native "Choose file" dialog is broken (a known Windows shell-extension crash) —
 * dropping or pasting never opens that dialog.
 *
 * Props: value (url), onChange(url), folder, label
 */
export default function ImageUpload({ value, onChange, folder = 'event', label }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Shared upload path for the picker, drop zone and clipboard paste.
  const doUpload = async (file) => {
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    setBusy(true);
    try {
      const res = await uploadFile(file, folder);
      // Store the relative path ("/assets/images/...") — NOT the absolute URL —
      // so it stays correct across environments. Display prepends the origin.
      onChange(res.path || res.url);
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onPick = (e) => doUpload(e.target.files?.[0]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) doUpload(file);
  };

  // Lets the user paste an image straight from the clipboard (e.g. a screenshot).
  const onPaste = (e) => {
    if (busy) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      doUpload(item.getAsFile());
    }
  };

  return (
    <div className="img-upload">
      {label && <span className="img-upload-label">{label}</span>}
      <div className="img-upload-row">
        {/* Drop zone — doubles as the preview. Dropping/pasting here avoids the
            native file dialog entirely. */}
        <div
          className={`img-thumb${dragOver ? ' img-thumb-dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onPaste={onPaste}
          tabIndex={0}
          title="Drag an image here, or paste from clipboard"
        >
          {value
            ? <img src={assetUrl(value)} alt="preview" onError={(e) => (e.target.style.visibility = 'hidden')} />
            : <span className="img-thumb-empty">{dragOver ? 'Drop image' : 'Drop / paste image'}</span>}
        </div>
        <div className="img-upload-controls">
          <input
            type="file"
            accept="image/*"
            ref={inputRef}
            style={{ display: 'none' }}
            onChange={onPick}
          />
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? 'Uploading…' : value ? 'Replace image' : 'Upload image'}
          </button>
          {value && <button type="button" className="btn btn-sm btn-danger" onClick={() => onChange('')}>Remove</button>}
          <input
            className="input"
            placeholder="…or paste an image URL"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="img-upload-hint">Tip: drag an image onto the box, or click it and press Ctrl+V</span>
        </div>
      </div>
    </div>
  );
}
