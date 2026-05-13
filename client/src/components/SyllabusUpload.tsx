import { useState, useRef, useCallback } from 'react';
import type { ParsedSyllabus, SyllabusUnit, SyllabusUploadResponse } from '../../../shared/types';

interface SyllabusUploadProps {
  sessionId: string;
  onUploadComplete: (response: SyllabusUploadResponse) => void;
  onClose: () => void;
  syllabi: ParsedSyllabus[];
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'text/plain',
];

const ACCEPTED_EXTENSIONS = '.pdf,.jpg,.jpeg,.png,.txt';

export default function SyllabusUpload({ sessionId, onUploadComplete, onClose, syllabi }: SyllabusUploadProps) {
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [dragActive, setDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [previewSyllabus, setPreviewSyllabus] = useState<SyllabusUploadResponse | null>(null);
  const [expandedUnits, setExpandedUnits] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setErrorMessage('Please upload a PDF, image (JPG/PNG), or text file.');
      setUploadState('error');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('File is too large. Please upload a file under 20MB.');
      setUploadState('error');
      return;
    }

    setUploadState('uploading');
    setErrorMessage('');

    try {
      const formData = new FormData();
      formData.append('syllabus', file);
      formData.append('sessionId', sessionId);

      const res = await fetch('/api/syllabus/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Upload failed with status ${res.status}`);
      }

      const data: SyllabusUploadResponse = await res.json();
      setPreviewSyllabus(data);
      setUploadState('success');
    } catch (err) {
      console.error('Syllabus upload error:', err);
      setErrorMessage('Something went wrong uploading your syllabus. Please try again.');
      setUploadState('error');
    }
  }, [sessionId]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleConfirm = () => {
    if (previewSyllabus) {
      onUploadComplete(previewSyllabus);
    }
  };

  const toggleUnit = (unitNumber: number) => {
    setExpandedUnits(prev => {
      const next = new Set(prev);
      if (next.has(unitNumber)) {
        next.delete(unitNumber);
      } else {
        next.add(unitNumber);
      }
      return next;
    });
  };

  const resetUpload = () => {
    setUploadState('idle');
    setPreviewSyllabus(null);
    setErrorMessage('');
    setExpandedUnits(new Set());
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="syllabus-upload-modal" onClick={onClose}>
      <div className="syllabus-upload-modal__content" onClick={e => e.stopPropagation()}>
        <div className="syllabus-upload-modal__header">
          <h2>Upload Your Syllabus</h2>
          <button className="syllabus-upload-modal__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {syllabi.length > 0 && uploadState === 'idle' && (
          <div className="syllabus-upload-modal__existing">
            <p className="syllabus-upload-modal__existing-label">Already loaded:</p>
            <div className="syllabus-upload-modal__existing-list">
              {syllabi.map(s => (
                <span key={s.id} className="syllabus-pill syllabus-pill--small">
                  {s.subject}
                </span>
              ))}
            </div>
          </div>
        )}

        {uploadState === 'idle' && (
          <>
            <div
              className={`syllabus-dropzone${dragActive ? ' syllabus-dropzone--active' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="syllabus-dropzone__icon">&#128214;</div>
              <p className="syllabus-dropzone__text">Drop your syllabus here</p>
              <p className="syllabus-dropzone__subtext">or click to browse files</p>
              <p className="syllabus-dropzone__formats">PDF, JPG, PNG, or TXT</p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleFileInput}
                style={{ display: 'none' }}
              />
            </div>
            <p className="syllabus-upload-modal__hint">
              Your teacher's syllabus, course outline, or curriculum guide -- we'll find the units and topics for you.
            </p>
          </>
        )}

        {uploadState === 'uploading' && (
          <div className="upload-progress">
            <div className="upload-progress__spinner" />
            <p className="upload-progress__text">Reading your syllabus...</p>
            <p className="upload-progress__subtext">Our AI is finding your units, topics, and standards</p>
          </div>
        )}

        {uploadState === 'error' && (
          <div className="syllabus-upload-error">
            <div className="syllabus-upload-error__icon">&#9888;&#65039;</div>
            <p className="syllabus-upload-error__text">{errorMessage}</p>
            <button className="btn btn--primary" onClick={resetUpload}>Try Again</button>
          </div>
        )}

        {uploadState === 'success' && previewSyllabus && (
          <div className="syllabus-preview">
            <div className="syllabus-preview__header">
              <div className="syllabus-preview__success-icon">&#10003;</div>
              <div>
                <h3 className="syllabus-preview__title">{previewSyllabus.syllabus.subject}</h3>
                <div className="syllabus-preview__badges">
                  <span className="badge badge--duration">{previewSyllabus.syllabus.gradeLevel}</span>
                  <span className="badge badge--difficulty-easy">
                    {previewSyllabus.syllabus.units.length} units
                  </span>
                  {previewSyllabus.syllabus.teacher && (
                    <span className="badge badge--duration">{previewSyllabus.syllabus.teacher}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="syllabus-preview__units">
              {previewSyllabus.syllabus.units.map((unit: SyllabusUnit) => (
                <div
                  key={unit.unitNumber}
                  className={`syllabus-unit${expandedUnits.has(unit.unitNumber) ? ' syllabus-unit--expanded' : ''}`}
                >
                  <button
                    className="syllabus-unit__header"
                    onClick={() => toggleUnit(unit.unitNumber)}
                  >
                    <span className="syllabus-unit__number">Unit {unit.unitNumber}</span>
                    <span className="syllabus-unit__title">{unit.title}</span>
                    <span className="syllabus-unit__toggle">
                      {expandedUnits.has(unit.unitNumber) ? '\u25B2' : '\u25BC'}
                    </span>
                  </button>
                  {expandedUnits.has(unit.unitNumber) && (
                    <div className="syllabus-unit__body">
                      {unit.topics.length > 0 && (
                        <div className="syllabus-unit__topics">
                          <strong>Topics:</strong>
                          <ul>
                            {unit.topics.map((topic, i) => (
                              <li key={i}>{topic}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {unit.standards && unit.standards.length > 0 && (
                        <div className="syllabus-unit__standards">
                          <strong>Standards:</strong>{' '}
                          {unit.standards.map((s, i) => (
                            <span key={i} className="tag">{s}</span>
                          ))}
                        </div>
                      )}
                      {unit.timeframe && (
                        <div className="syllabus-unit__timeframe">
                          <strong>Timeframe:</strong> {unit.timeframe}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="syllabus-preview__actions">
              <button className="btn btn--primary" onClick={handleConfirm}>
                Use This Syllabus
              </button>
              <button className="btn btn--secondary" onClick={resetUpload}>
                Upload Different File
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
