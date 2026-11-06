import React from 'react';
import { Alert, Box, Stack, Typography } from '@mui/material';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

import { CodeEditorPane } from '../../code-editor';
import type { IEmailTemplateElement } from '../../communicator/types';

export interface EjsSourcePaneProps {
  element: IEmailTemplateElement;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Rendered under the editor when set. */
  helperText?: React.ReactNode;
  tone?: 'muted' | 'warning';
}

/**
 * The source editor for one template element.
 *
 * Deliberately a **source** editor, not a rich-text one. The stored value is EJS —
 * `<%= user.firstName %>`, `<% if (…) { %>` — and any rich-text engine would
 * normalise or escape those markers, which the renderer then cannot parse. The
 * failure would be silent: the template would save, and the send would render
 * mangled output rather than throwing.
 *
 * For a file-backed element the editor shows the pointer text, not the file's
 * contents: what is stored is the pointer, and editing it replaces it. The warning
 * is prominent because that replacement is the irreversible part — the file stays
 * on disk but this application stops reading it.
 */
export const EjsSourcePane: React.FC<EjsSourcePaneProps> = ({
  element,
  value,
  onChange,
  disabled = false,
  helperText,
  tone = 'muted',
}) => {
  const isHtml = element.format === 'html';

  return (
    <Stack spacing={1}>
      {element.isFileBacked ? (
        <Alert severity="warning" icon={<InsertDriveFileIcon />}>
          <Typography variant="subtitle2" gutterBottom>
            This {element.role} is read from a file
          </Typography>
          <Typography variant="body2" component="div">
            <code>{element.source}</code>
            {element.refPath ? (
              <>
                {' '}
                — resolved from <code>{element.refPath}</code>
              </>
            ) : null}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Saving here replaces that pointer with inline content for this application
            only. The file stays on disk, unchanged, but this application stops reading it.
          </Typography>
          {element.refError ? (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              The file could not be resolved from this deployment: {element.refError}
            </Typography>
          ) : null}
        </Alert>
      ) : null}

      <CodeEditorPane
        // A `text` element is a plain-text subject line; highlighting it as HTML
        // colours `Hi, {{firstName}}` as if it were markup.
        language={isHtml ? 'html' : 'text'}
        value={value}
        onChange={onChange}
        disabled={disabled}
        label={isHtml ? 'HTML source' : 'Text source'}
        minRows={16}
        helperText={
          helperText !== undefined ? (
            helperText
          ) : (
            <Box component="span">
              EJS is rendered server-side. Available: <code>user</code>, <code>partner</code>,{' '}
              <code>applicationTitle</code>, <code>t()</code>, and the purpose link
              (<code>resetLink</code>, <code>activationLink</code>).
            </Box>
          )
        }
        helperTone={tone}
      />
    </Stack>
  );
};

export default EjsSourcePane;
