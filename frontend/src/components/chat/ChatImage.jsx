/**
 * A private chat image. The file is fetched with the access token (it is
 * never public) and shown from a temporary object URL that is released when
 * the component unmounts.
 */
import { useEffect, useState } from 'react';
import { fetchBlob } from '../../services/apiClient.js';

function ChatImage({ image, alt }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    setFailed(false);
    fetchBlob(image.path)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.path]);

  // Reserve the image's shape while loading so the conversation does not jump.
  const ratio = image.width && image.height ? `${image.width} / ${image.height}` : undefined;

  if (failed) return <p className="chat__image-error">Image unavailable</p>;
  if (!src) return <div className="chat__image chat__image--loading" style={{ aspectRatio: ratio }} aria-label="Loading image" />;
  return <img className="chat__image" src={src} alt={alt} width={image.width || undefined} height={image.height || undefined} />;
}

export default ChatImage;
