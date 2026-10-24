/**
 * Keyboard behaviour for a modal dialog: focus moves into it when it opens,
 * Tab stays inside it, Escape closes it, and focus returns to the element
 * that opened it afterwards. Dialogs can stack (Report opened from the match
 * details): only the topmost one reacts to the keyboard.
 */
import { useEffect, useRef } from 'react';

const openDialogs = [];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function useDialog(onClose) {
  const ref = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement;
    const dialog = ref.current;
    const token = {};
    openDialogs.push(token);
    const items = () => [...(dialog?.querySelectorAll(FOCUSABLE) || [])];
    (items()[0] || dialog)?.focus();

    const onKey = (event) => {
      if (openDialogs[openDialogs.length - 1] !== token) return;
      if (event.key === 'Escape') {
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openDialogs.splice(openDialogs.indexOf(token), 1);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, []);

  return ref;
}
