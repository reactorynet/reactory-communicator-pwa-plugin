import React from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

export interface DetachConfirmDialogProps {
  open: boolean;
  /** Role being detached, e.g. `body`. */
  role: string;
  /**
   * The `$ref://` pointer currently stored.
   *
   * NOT named `ref`: React treats a `ref` prop as a string ref on a function
   * component and throws "Function components cannot have string refs".
   */
  pointer: string;
  /** Absolute path the pointer resolves to, when known. */
  refPath?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation before converting a `$ref://` element to inline content.
 *
 * This is the one irreversible action in the editor, and it is irreversible in a
 * subtle way: the file on disk is NOT deleted, so nothing appears to have been
 * lost. What changes is that this deployment stops reading it — from then on the
 * two diverge silently, and a later change to the shipped file will not reach this
 * application.
 *
 * So the dialog states what will happen, what will not, and where the original is,
 * rather than asking a generic "are you sure?".
 */
export const DetachConfirmDialog: React.FC<DetachConfirmDialogProps> = ({
  open,
  role,
  pointer,
  refPath,
  onCancel,
  onConfirm,
}) => (
  <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth aria-labelledby="detach-dialog-title">
    <DialogTitle id="detach-dialog-title">
      <Stack direction="row" spacing={1} alignItems="center">
        <InsertDriveFileIcon color="warning" />
        <span>Convert this {role} to inline content?</span>
      </Stack>
    </DialogTitle>

    <DialogContent>
      <Stack spacing={2}>
        <DialogContentText component="div">
          This {role} is currently read from a file:
          <Typography
            component="div"
            variant="body2"
            sx={{ mt: 1, fontFamily: 'monospace', wordBreak: 'break-all' }}
          >
            {pointer}
          </Typography>
          {refPath ? (
            <Typography component="div" variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
              resolved from {refPath}
            </Typography>
          ) : null}
        </DialogContentText>

        <Alert severity="info">
          <Typography variant="body2" component="div">
            Your edit will be saved as inline content <strong>for this application only</strong>.
            The file is not deleted or modified — but this application will stop reading it, and
            future changes to that file will no longer affect this template.
          </Typography>
        </Alert>
      </Stack>
    </DialogContent>

    <DialogActions>
      {/*
        Focus lands on the SAFE action. `autoFocus` on "Convert and save" meant a
        reflex Enter performed the irreversible conversion.
      */}
      <Button onClick={onCancel} color="inherit" autoFocus>
        Keep reading the file
      </Button>
      <Button onClick={onConfirm} variant="contained" color="warning">
        Convert and save
      </Button>
    </DialogActions>
  </Dialog>
);

export default DetachConfirmDialog;
