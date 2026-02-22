import React, { useCallback } from 'react';

const FileUpload = ({ onUpload, loading, error }) => {
  const [dragActive, setDragActive] = React.useState(false);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0]);
    }
  }, [onUpload]);

  const handleChange = useCallback((e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  }, [onUpload]);

  return (
    <div className="file-upload-container">
      <div
        className={`file-upload-zone ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-input"
          accept=".png,.jpg,.jpeg,.pdf"
          onChange={handleChange}
          disabled={loading}
          style={{ display: 'none' }}
        />
        <label htmlFor="file-input" className="file-upload-label">
          <div className="upload-icon">📁</div>
          <h2>Drop diagram here or click to upload</h2>
          <p>Supports PNG, JPG, PDF (max 50MB)</p>
          {loading && <p className="loading-text">Processing...</p>}
        </label>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
};

export default FileUpload;