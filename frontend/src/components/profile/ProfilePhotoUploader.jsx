/**
 * Profile picture picker: gallery/files, camera, preview, upload, remove.
 *
 * Any suitable image is accepted — it does NOT need to show a face, and no
 * face or human detection runs here. This is unrelated to the live login
 * verification photo, which is never stored or reused.
 *
 * mode="immediate": uploads/removes right away and calls onChange(profile).
 * mode="deferred":  only reports the chosen file via onFileChange(file|null)
 *                   (used while creating a profile; uploaded after it is saved).
 */
import { useEffect, useRef, useState } from 'react';
import Alert from '../common/Alert.jsx';
import Avatar from './Avatar.jsx';
import useCamera from '../../hooks/useCamera.js';
import { profileService } from '../../services/profileService.js';
import { PROFILE_IMAGE_MAX_MB, PROFILE_IMAGE_TYPES, validateProfileImage } from '../../utils/profileImage.js';

const CAMERA_MESSAGES = {
  permission_denied:
    'Camera permission was denied. Allow camera access in your browser settings, or choose a picture from your gallery or files instead.',
  no_camera: 'No camera was found. Choose a picture from your gallery or files instead.',
};

function ProfilePhotoUploader({ photoUrl, name, mode = 'immediate', onChange, onFileChange }) {
  const fileInputRef = useRef(null);
  const captureInputRef = useRef(null);
  const canvasRef = useRef(null);
  const camera = useCamera({ messages: CAMERA_MESSAGES });

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Release the preview's object URL when it changes or on unmount.
  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  const selectFile = (selected) => {
    setError('');
    setInfo('');
    const problem = validateProfileImage(selected);
    if (problem) {
      setError(problem);
      return;
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    if (mode === 'deferred') onFileChange?.(selected);
  };

  const clearSelection = () => {
    setFile(null);
    setPreviewUrl(null);
    if (mode === 'deferred') onFileChange?.(null);
  };

  const onPicked = (event) => {
    const [picked] = event.target.files || [];
    event.target.value = ''; // allow picking the same file again
    if (picked) selectFile(picked);
  };

  const openCamera = () => {
    setError('');
    // Phones/tablets without in-page camera support: use the native camera picker.
    if (!navigator.mediaDevices?.getUserMedia) {
      captureInputRef.current?.click();
      return;
    }
    setCameraOpen(true);
    camera.start();
  };

  const closeCamera = () => {
    camera.stop();
    setCameraOpen(false);
  };

  const capture = () => {
    const video = camera.videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        closeCamera();
        if (blob) selectFile(new File([blob], 'camera-photo.jpg', { type: 'image/jpeg' }));
        else setError('Could not capture a photo. Please try again.');
      },
      'image/jpeg',
      0.9
    );
  };

  const upload = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await profileService.uploadPhoto(file);
      clearSelection();
      setInfo('Profile picture updated.');
      onChange?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await profileService.removePhoto();
      setInfo('Profile picture removed.');
      onChange?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const accept = PROFILE_IMAGE_TYPES.join(',');

  return (
    <section className="photo-uploader" aria-label="Profile picture">
      <div className="photo-uploader__preview">
        <Avatar src={previewUrl || photoUrl} name={name} />
        {previewUrl && <span className="badge">Preview — not saved yet</span>}
      </div>

      <div className="photo-uploader__body">
        <p className="muted">
          Any image works — it does not need to show your face. JPG, PNG or WEBP up to {PROFILE_IMAGE_MAX_MB} MB.
          This picture is separate from the live camera check used when you log in.
        </p>

        <Alert type="error">{error || camera.errorMessage}</Alert>
        <Alert>{info}</Alert>

        {cameraOpen && camera.status !== 'error' ? (
          <div className="camera camera--small">
            <video ref={camera.videoRef} className="camera__video" autoPlay playsInline muted aria-label="Camera preview" />
            <div className="actions">
              <button type="button" className="btn btn--primary" onClick={capture} disabled={camera.status !== 'streaming'}>
                Capture
              </button>
              <button type="button" className="btn" onClick={closeCamera}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="actions">
            <button type="button" className="btn" onClick={() => fileInputRef.current?.click()} disabled={busy}>
              {photoUrl || file ? 'Change photo (gallery or files)' : 'Upload from gallery or files'}
            </button>
            <button type="button" className="btn" onClick={openCamera} disabled={busy}>
              Take a photo
            </button>
            {mode === 'immediate' && photoUrl && !file && (
              <button type="button" className="btn btn--danger" onClick={remove} disabled={busy}>
                Remove photo
              </button>
            )}
          </div>
        )}

        {file && (
          <div className="actions">
            {mode === 'immediate' && (
              <button type="button" className="btn btn--primary" onClick={upload} disabled={busy}>
                {busy ? 'Uploading…' : 'Save photo'}
              </button>
            )}
            <button type="button" className="btn" onClick={clearSelection} disabled={busy}>
              {mode === 'immediate' ? 'Cancel' : 'Remove selected photo'}
            </button>
          </div>
        )}

        <input ref={fileInputRef} type="file" accept={accept} hidden onChange={onPicked} data-testid="photo-file-input" />
        <input
          ref={captureInputRef}
          type="file"
          accept={accept}
          capture="user"
          hidden
          onChange={onPicked}
          data-testid="photo-capture-input"
        />
        <canvas ref={canvasRef} hidden />
      </div>
    </section>
  );
}

export default ProfilePhotoUploader;
