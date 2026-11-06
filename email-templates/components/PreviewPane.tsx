import React, { useMemo } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';

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
 * Constrain what rendered email may load.
 *
 * `sandbox=""` already blocks scripts and same-origin access, but it does not stop
 * a remote image, a remote stylesheet, or `<meta http-equiv="refresh">` navigating
 * the frame. A CSP `default-src 'none'` makes the pane inert except for inline
 * styles (which email HTML relies on) and inline data images.
 */
const PREVIEW_CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:;";

const previewDocument = (body: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><base target="_blank"></head><body style="margin:0;padding:12px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${body}</body></html>`;

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

  /**
   * The header renders for the error state too: losing Refresh exactly when a retry
   * is needed leaves the operator with no way to retry a transient failure except
   * by editing the draft.
   */
  const header = (
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
              <IconButton
                size="small"
                onClick={onRefresh}
                disabled={loading}
                aria-label="Re-render preview"
              >
                {loading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        ) : null}
      </Stack>
    </Stack>
  );

  if (error) {
    return (
      <Stack spacing={1} sx={{ minWidth: 0 }}>
        {header}
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
      </Stack>
    );
  }

  return (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      {header}
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
          // `sandbox=""` blocks scripts, but tenant-authored HTML can still cause
          // outbound requests (<img>, remote CSS) and `<meta http-equiv="refresh">`
          // can navigate the iframe itself to a remote page inside a pane the
          // operator trusts. A CSP prefix plus no-referrer stops both cheaply.
          referrerPolicy="no-referrer"
          srcDoc={previewDocument(body)}
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
