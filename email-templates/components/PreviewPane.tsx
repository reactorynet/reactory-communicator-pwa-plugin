import React, { useMemo } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { IconButton } from '@mui/material';

import type { IEmailTemplatePreviewResult } from '../../communicator/hooks/useTemplatePreview';

export interface PreviewPaneProps {
  preview: IEmailTemplatePreviewResult | null;
  loading: boolean;
  error: string | null;
  /** The shown preview does not match the current source. */
  stale: boolean;
  role: string;
  onRefresh?: () => void;
}

/**
 * Server-rendered preview of one element.
 *
 * ## Why the HTML is shown in a sandboxed iframe
 *
 * The rendered body is arbitrary tenant-authored HTML. Injecting it into the app's
 * document would let it reach the surrounding page — and rendered output can
 * legitimately contain `<a>`, `<img>` and, once a template is edited, whatever the
 * operator typed. `sandbox=""` is the strict option: no scripts, no forms, no
 * same-origin access. A preview needs none of them.
 *
 * `srcDoc` rather than `dangerouslySetInnerHTML` for the same reason: the browser
 * treats the iframe as a separate document, so email CSS cannot leak out and the
 * app's CSS cannot silently change how the email looks.
 *
 * ## Why drift is shown
 *
 * The preview is computed server-side with a debounce, so it can lag the editor.
 * An operator must never believe a stale preview is current — that is how someone
 * ships a template they did not see.
 */
export const PreviewPane: React.FC<PreviewPaneProps> = ({
  preview,
  loading,
  error,
  stale,
  role,
  onRefresh,
}) => {
  const isSubject = role === 'subject';

  const body = useMemo(() => {
    if (!preview) return '';
    if (isSubject) return preview.subject || '';
    return preview.html || preview.text || '';
  }, [preview, isSubject]);

  if (error) {
    return (
      <Alert severity="error" role="alert">
        <Typography variant="subtitle2" gutterBottom>
          The preview could not be rendered
        </Typography>
        <Typography variant="body2" component="div">
          {error}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          The template is still saved as it was — a render failure here does not change it.
        </Typography>
      </Alert>
    );
  }

  return (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2" color="text.secondary">
          Preview {isSubject ? '(subject line)' : '(as the recipient sees it)'}
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center">
          {stale ? (
            <Typography variant="caption" color="warning.main">
              out of date
            </Typography>
          ) : null}
          {onRefresh ? (
            <Tooltip title="Re-render">
              <span>
                <IconButton size="small" onClick={onRefresh} disabled={loading} aria-label="Re-render preview">
                  {loading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          ) : null}
        </Stack>
      </Stack>

      {loading ? <LinearProgress sx={{ borderRadius: 1 }} /> : null}

      {isSubject ? (
        <Box
          sx={{
            p: 1.5,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'background.paper',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '0.875rem',
            wordBreak: 'break-word',
          }}
        >
          {body || <Typography variant="caption">—</Typography>}
        </Box>
      ) : (
        <Box
          component="iframe"
          title="Template preview"
          sandbox=""
          srcDoc={body}
          sx={{
            width: '100%',
            minHeight: 320,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'background.paper',
          }}
        />
      )}
    </Stack>
  );
};

export default PreviewPane;
