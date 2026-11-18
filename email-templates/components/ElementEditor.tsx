import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import UndoIcon from '@mui/icons-material/Undo';

import { useElementDraft } from '../hooks/useElementDraft';
import { useTemplatePreview } from '../../communicator/hooks/useTemplatePreview';
import type { IEmailTemplateElement } from '../../communicator/types';
import EjsSourcePane from './EjsSourcePane';
import PreviewPane from './PreviewPane';

export interface ElementEditorProps {
  reactory: any;
  element: IEmailTemplateElement;
  /** Supplies sample data server-side (e.g. a reset link). */
  purpose?: string;
  /** Reports dirtiness upward so the drawer can guard closing. */
  onDirtyChange?: (elementId: string, dirty: boolean) => void;
  /** Called after a successful save, so the host can refresh the list. */
  onSaved?: (elementId: string) => void;
  /** The drawer asks for a detach confirmation before the save happens. */
  requestDetach: (element: IEmailTemplateElement) => Promise<boolean>;
  /** False for an editor kept mounted but hidden behind another tab. */
  previewEnabled?: boolean;
}

/**
 * One element's editor: source on the left, server-rendered preview on the right.
 *
 * Kept as its own component because each element needs its own draft and preview
 * hooks. A single drawer-level hook set would have to multiplex elements, and the
 * obvious shortcut — resetting draft state when the active element changes — is
 * exactly how an edit gets written to the wrong document.
 *
 * Save is per element rather than global: subject and body are separate documents,
 * and a single "Save" that wrote both would have to report per-element failures
 * anyway.
 */
export const ElementEditor: React.FC<ElementEditorProps> = ({
  reactory,
  element,
  purpose,
  onDirtyChange,
  onSaved,
  requestDetach,
  previewEnabled = true,
}) => {
  const {
    draft,
    setDraft,
    dirty,
    saving,
    error,
    requiresDetach,
    save,
    revert,
    lastOutcome,
    currentElement,
  } = useElementDraft(reactory, element);

  /**
   * The element as the SERVER last described it (falls back to the prop).
   *
   * After a detach the server returns `isFileBacked: false`; rendering the prop
   * would keep the "read from a file" warning on screen and offer to convert an
   * element that has already been converted.
   */
  const shown = currentElement ?? element;

  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    onDirtyChange?.(element.id, dirty);
  }, [dirty, element.id, onDirtyChange]);

  const { preview, loading, error: previewError, stale, refresh } = useTemplatePreview(reactory, {
    source: draft,
    purpose,
    enabled: previewEnabled,
  });

  const handleSave = useCallback(async () => {
    setSaveNotice(null);

    let detach = false;
    if (requiresDetach) {
      const confirmed = await requestDetach(element);
      if (!confirmed) return;
      detach = true;
    }

    const result = await save({ detach });

    if (result.ok) {
      setSaveNotice(
        result.outcome === 'detached-and-saved'
          ? 'Saved as inline content. This application no longer reads the file.'
          : 'Saved.',
      );
      onSaved?.(element.id);
    }
  }, [requiresDetach, requestDetach, element, save, onSaved]);

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{
          alignItems: "center",
          flexWrap: "wrap"
        }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {shown.name || shown.role}
        </Typography>
        <Chip size="small" variant="outlined" label={shown.role} />
        <Chip size="small" variant="outlined" label={shown.format} />
        {shown.isFileBacked ? (
          <Chip size="small" color="info" variant="outlined" label="from file" />
        ) : (
          <Chip
            size="small"
            color={shown.isDetached ? 'secondary' : 'default'}
            variant="outlined"
            label={shown.isDetached ? 'inline (detached)' : 'inline'}
          />
        )}
      </Stack>

      {dirty ? (
        <Alert severity="warning" icon={false}>
          Unsaved changes to this {shown.role}.
        </Alert>
      ) : null}

      {error ? (
        <Alert severity="error" role="alert">
          {error}
        </Alert>
      ) : null}

      {saveNotice ? (
        <Alert severity="success" role="status">
          {saveNotice}
        </Alert>
      ) : null}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
          alignItems: 'start',
        }}
      >
        <EjsSourcePane element={shown} value={draft} onChange={setDraft} disabled={saving} />

        <PreviewPane
          preview={preview}
          loading={loading}
          error={previewError}
          stale={stale}
          role={shown.role}
          onRefresh={refresh}
        />
      </Box>

      <Stack direction="row" spacing={1} sx={{
        justifyContent: "flex-end"
      }}>
        {lastOutcome === 'detached-and-saved' ? (
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              alignSelf: 'center',
              mr: 'auto'
            }}>
            Last save converted this element from a file to inline content.
          </Typography>
        ) : null}

        <Button
          onClick={revert}
          disabled={!dirty || saving}
          startIcon={<UndoIcon />}
          color="inherit"
        >
          Revert
        </Button>
        <Button
          onClick={handleSave}
          // An empty draft is not savable: the server refuses it, and disabling the
          // button says so before the click rather than after.
          disabled={!dirty || saving || draft.trim().length === 0}
          variant="contained"
          startIcon={<SaveIcon />}
        >
          {saving ? 'Saving…' : requiresDetach ? 'Save (converts to inline)' : 'Save'}
        </Button>
      </Stack>
    </Stack>
  );
};

export default ElementEditor;
