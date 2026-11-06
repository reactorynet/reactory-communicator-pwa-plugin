import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

import type { IEmailTemplateElement, IEmailTemplateView } from '../../communicator/types';
import ElementEditor from './ElementEditor';
import DetachConfirmDialog from './DetachConfirmDialog';

export interface TemplateEditorDrawerProps {
  open: boolean;
  view: IEmailTemplateView | null;
  onClose: () => void;
  reactory: any;
  /** Sample-data hint for the server preview, e.g. `password_reset`. */
  purpose?: string;
  /** Called after any element saves, so the host can refresh the list. */
  onSaved?: () => void;
}

/**
 * Editor drawer for one template view.
 *
 * The drawer is chrome and coordination only — draft state, preview and saving all
 * live in `ElementEditor`, one instance per element, so switching tabs cannot carry
 * one element's edits into another.
 *
 * Two things the drawer owns because they are cross-element:
 *
 *  - **the dirty guard.** Closing must not discard edits silently. Each editor
 *    reports dirtiness up; the drawer refuses to close while any is dirty.
 *  - **the detach confirmation.** It is modal and per-element, so the promise is
 *    held here and handed to the requesting editor.
 */
export const TemplateEditorDrawer: React.FC<TemplateEditorDrawerProps> = ({
  open,
  view,
  onClose,
  reactory,
  purpose,
  onSaved,
}) => {
  const elements: IEmailTemplateElement[] = useMemo(() => {
    if (!view) return [];
    return [view.subject, view.body, ...view.otherElements].filter(
      Boolean,
    ) as IEmailTemplateElement[];
  }, [view]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [dirtyIds, setDirtyIds] = useState<Record<string, boolean>>({});
  const [confirmClose, setConfirmClose] = useState<boolean>(false);

  /** Pending detach confirmation: the element and the promise's resolve. */
  const detachRef = useRef<{ element: IEmailTemplateElement; resolve: (ok: boolean) => void } | null>(
    null,
  );
  const [detachElement, setDetachElement] = useState<IEmailTemplateElement | null>(null);

  /**
   * Reset per-view state when the drawer opens on a different template.
   *
   * Keyed state rather than a ref mutation during render: writing a ref and calling
   * setState mid-render works today but is not the supported form and does not
   * survive concurrent rendering. `dirtyViewId` records which view the flags belong
   * to, so a mismatch is derived away during render instead of corrected after it.
   */
  const viewId = view?.id ?? null;
  const [dirtyViewId, setDirtyViewId] = useState<string | null>(viewId);
  const dirtyIdsForView = dirtyViewId === viewId ? dirtyIds : {};

  const [activeViewId, setActiveViewId] = useState<string | null>(viewId);
  const activeIdForView = activeViewId === viewId ? activeId : null;

  const resolvedActiveId = activeIdForView ?? elements[0]?.id ?? null;
  const anyDirty = Object.values(dirtyIdsForView).some(Boolean);

  const handleDirtyChange = useCallback(
    (elementId: string, dirty: boolean) => {
      setDirtyIds((current) => {
        if (dirtyViewId === viewId && current[elementId] === dirty) return current;
        return { ...(dirtyViewId === viewId ? current : {}), [elementId]: dirty };
      });
      setDirtyViewId(viewId);
    },
    [dirtyViewId, viewId],
  );

  const requestDetach = useCallback((element: IEmailTemplateElement): Promise<boolean> => {
    // Settle any earlier request first. Without this a second request (two elements
    // saving in one tick, or a double click landing before the modal paints — note
    // `saving` is still false while the dialog is open) overwrites the pending
    // resolver and leaves the first `handleSave` awaiting forever: no save, no
    // error, and the dialog now describing the other element.
    detachRef.current?.resolve(false);

    return new Promise<boolean>((resolve) => {
      detachRef.current = { element, resolve };
      setDetachElement(element);
    });
  }, []);

  /** An unmount with a pending confirmation must not strand its caller. */
  useEffect(
    () => () => {
      detachRef.current?.resolve(false);
      detachRef.current = null;
    },
    [],
  );

  const settleDetach = useCallback((ok: boolean) => {
    detachRef.current?.resolve(ok);
    detachRef.current = null;
    setDetachElement(null);
  }, []);

  const attemptClose = useCallback(() => {
    if (anyDirty) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }, [anyDirty, onClose]);

  return (
    <>
      <Drawer
        anchor="right"
        open={open}
        onClose={attemptClose}
        PaperProps={{
          sx: {
            width: { xs: '100vw', md: '90vw', lg: '80vw' },
            maxWidth: 1500,
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }} noWrap>
              {view ? view.name : 'Email template'}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontFamily: 'monospace' }}
              component="div"
            >
              {view?.view}
            </Typography>
          </Box>

          <IconButton onClick={attemptClose} aria-label="Close editor" edge="end">
            <CloseIcon />
          </IconButton>
        </Stack>

        {elements.length > 1 ? (
          <Tabs
            value={resolvedActiveId ?? false}
            onChange={(_event, value) => {
              setActiveId(value);
              setActiveViewId(viewId);
            }}
            variant="scrollable"
            allowScrollButtonsMobile
            sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            {elements.map((element) => (
              <Tab
                key={element.id}
                value={element.id}
                label={
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <span>{element.role}</span>
                    {dirtyIdsForView[element.id] ? (
                      <Box
                        component="span"
                        aria-label="unsaved changes"
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          bgcolor: 'warning.main',
                          display: 'inline-block',
                        }}
                      />
                    ) : null}
                  </Stack>
                }
              />
            ))}
          </Tabs>
        ) : null}

        <Box sx={{ flexGrow: 1, overflow: 'auto', p: { xs: 1.5, sm: 2.5 } }}>
          {elements.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              This template has no editable elements.
            </Typography>
          ) : null}

          {/*
            Every element's editor stays MOUNTED and inactive ones are hidden.

            Unmounting on tab switch looked simpler, but it threw the draft away:
            the tab still showed an "unsaved changes" dot while the edits were
            already gone, and switching back silently restored the saved source.
            Keeping them mounted makes the dot honest.

            Only the visible one previews — `previewEnabled` — so a hidden editor
            does not fire a render request on every keystroke.
          */}
          {elements.map((element) => (
            <Box
              key={element.id}
              sx={{ display: element.id === resolvedActiveId ? 'block' : 'none' }}
              aria-hidden={element.id !== resolvedActiveId}
            >
              <ElementEditor
                reactory={reactory}
                element={element}
                purpose={purpose}
                onDirtyChange={handleDirtyChange}
                onSaved={() => onSaved?.()}
                requestDetach={requestDetach}
                previewEnabled={element.id === resolvedActiveId}
              />
            </Box>
          ))}
        </Box>
      </Drawer>

      <DetachConfirmDialog
        open={detachElement !== null}
        role={detachElement?.role ?? 'element'}
        pointer={detachElement?.source ?? ''}
        refPath={detachElement?.refPath}
        onCancel={() => settleDetach(false)}
        onConfirm={() => settleDetach(true)}
      />

      <Dialog open={confirmClose} onClose={() => setConfirmClose(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Discard unsaved changes?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Some elements have edits that have not been saved. Closing now discards them.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClose(false)} color="inherit">
            Keep editing
          </Button>
          <Button
            onClick={() => {
              setConfirmClose(false);
              onClose();
            }}
            color="warning"
            variant="contained"
          >
            Discard and close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default TemplateEditorDrawer;
