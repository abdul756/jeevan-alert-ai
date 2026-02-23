import React, { useRef } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import PropTypes from 'prop-types';

/**
 * Reusable Image Upload Component
 *
 * Features:
 * - Drag-and-drop upload
 * - Click-to-upload
 * - Image preview
 * - File validation (JPEG/PNG, 10MB max)
 * - Remove uploaded image
 */
function ImageUpload({
  onImageSelect,
  onImageRemove,
  imagePreview,
  error,
  onError
}) {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    processFile(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    processFile(file);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFile = (file) => {
    if (!file) return;

    // Validate file type
    if (!file.type.match('image/(jpeg|jpg|png)')) {
      const errorMsg = 'Please upload a JPEG or PNG image';
      if (onError) onError(errorMsg);
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      const errorMsg = 'Image must be smaller than 10MB';
      if (onError) onError(errorMsg);
      return;
    }

    // Clear any previous errors
    if (onError) onError(null);

    // Notify parent component
    onImageSelect(file);
  };

  const handleRemove = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onImageRemove();
  };

  return (
    <div style={{ marginTop: '0.5rem' }}>
      {!imagePreview ? (
        /* Upload Zone */
        <div
          style={{
            border: isDragging ? '2px dashed #3b82f6' : '2px dashed #d1d5db',
            borderRadius: '8px',
            padding: '1.5rem',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: isDragging ? '#eff6ff' : 'white',
            transition: 'all 0.2s ease'
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          onMouseEnter={(e) => {
            if (!isDragging) {
              e.currentTarget.style.borderColor = '#60a5fa';
              e.currentTarget.style.backgroundColor = '#f9fafb';
            }
          }}
          onMouseLeave={(e) => {
            if (!isDragging) {
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.backgroundColor = 'white';
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          <Upload style={{ margin: '0 auto 0.75rem', color: '#9ca3af' }} size={32} />

          <p style={{ fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.25rem' }}>
            Drag and drop image here
          </p>
          <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>
            or click to browse (JPEG, PNG - max 10MB)
          </p>
        </div>
      ) : (
        /* Image Preview */
        <div style={{ position: 'relative', border: '2px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          <img
            src={imagePreview}
            alt="Selected lesion"
            style={{
              width: '100%',
              height: '200px',
              objectFit: 'cover',
              backgroundColor: '#f9fafb'
            }}
          />

          {/* Remove Button */}
          <button
            onClick={handleRemove}
            style={{
              position: 'absolute',
              top: '0.5rem',
              right: '0.5rem',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              padding: '0.5rem',
              cursor: 'pointer',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              transition: 'background-color 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
            title="Remove image"
          >
            <X size={16} />
          </button>

          {/* Image Icon Overlay */}
          <div style={{
            position: 'absolute',
            bottom: '0.5rem',
            left: '0.5rem',
            backgroundColor: 'rgba(255,255,255,0.95)',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.75rem',
            color: '#4b5563'
          }}>
            <ImageIcon size={12} />
            <span>Image selected</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          fontSize: '0.875rem',
          color: '#dc2626',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          padding: '0.5rem',
          marginTop: '0.5rem'
        }}>
          {error}
        </div>
      )}
    </div>
  );
}

ImageUpload.propTypes = {
  onImageSelect: PropTypes.func.isRequired,
  onImageRemove: PropTypes.func.isRequired,
  imagePreview: PropTypes.string,
  error: PropTypes.string,
  onError: PropTypes.func,
};

export default ImageUpload;
