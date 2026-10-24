/**
 * "Report" and "Block" actions for another user (Phase 13), used on match
 * details, chat and connection screens. Blocking asks for a reason first; the
 * server then ends the connection, chats and calls between the two users.
 */
import { useState } from 'react';
import BlockDialog from './BlockDialog.jsx';
import ReportDialog from './ReportDialog.jsx';
import { useToast } from '../common/Toast.jsx';

function SafetyActions({ user, onBlocked, small = true }) {
  const [reporting, setReporting] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [message, setMessage] = useState(null);
  const notify = useToast();
  const size = small ? ' btn--small' : '';

  const blocked = () => {
    setConfirmingBlock(false);
    setMessage(`${user.name} has been blocked.`);
    notify(`${user.name} has been blocked.`);
    onBlocked?.(user);
  };

  return (
    <div className="safety-actions">
      <button type="button" className={`btn${size}`} onClick={() => setReporting(true)}>
        Report
      </button>
      <button type="button" className={`btn${size}`} onClick={() => setConfirmingBlock(true)} disabled={Boolean(message)}>
        Block
      </button>
      {message && (
        <p className="safety-actions__note" role="status">
          {message}
        </p>
      )}
      {reporting && <ReportDialog user={user} onClose={() => setReporting(false)} />}
      {confirmingBlock && (
        <BlockDialog user={user} onClose={() => setConfirmingBlock(false)} onBlocked={blocked} />
      )}
    </div>
  );
}

export default SafetyActions;
