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
 * the frame. `default-src 'none'` makes the pane inert except for inline styles
 * (which email HTML relies on) and images.
 *
 * `img-src` allows `https:` deliberately. Blocking it is a defensible privacy
 * choice, but a designed email's hosted logo then renders broken — and "my template
 * is broken" is exactly the false alarm the preview exists to prevent. `http:` and
 * `cid:` stay blocked. If tracking pixels become a concern, tighten this and say so
 * on the pane, rather than leaving the operator to debug a non-bug.
 */
const PREVIEW_CSP =
  "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; font-src data:;";

/**
 * Wrap rendered content in a document that carries the CSP.
 *
 * Padding and typography go on an INNER `div`, never on `<body>`. A full-document
 * email arrives with its own `<body style="…">`, and per spec a duplicate `<body>`
 * start tag merges attributes only where absent — so what wins becomes
 * parser-dependent (Chrome and jsdom disagreed in review). Leaving `<body>` alone
 * means the email's own styling always applies.
 */
const previewDocument = (body: string): string =>
  `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><base target="_blank"></head><body style="margin:0"><div style="padding:12px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${body}</div></body></html>`;

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

      {/*
        Only for a rendered body. A subject element is a text box — there is no
        iframe, no images and no forms, so the constraint sentence would be a claim
        about nothing.
      */}
      {isSubject ? null : (
        <Typography variant="caption" color="text.secondary">
          Remote images load over https only; scripts and forms are blocked. This is the
          server-rendered output, not a client-side approximation.
        </Typography>
      )}

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
