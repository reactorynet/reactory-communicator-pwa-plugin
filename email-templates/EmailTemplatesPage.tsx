import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import EditIcon from '@mui/icons-material/Edit';
import { useReactory } from '@reactory/client-core/api';

import { useEmailTemplates } from '../communicator/hooks/useEmailTemplates';
import {
  SCOPE_LEVEL_LABEL,
  purposeForView,
  scopeLevelOf,
  type IEmailTemplateElement,
  type IEmailTemplateView,
} from '../communicator/types';
import TemplateEditorDrawer from './components/TemplateEditorDrawer';

/**
 * `communicator.EmailTemplates@1.0.0` — read-only list of transactional email
 * templates.
 *
 * This is the WP-2 deliverable: the page proves the plugin registers, resolves
 * through the component registry, and can read the real template documents. The
 * editing drawer (WP-3) will open from the row action.
 *
 * Two things it deliberately surfaces, because both are invisible in the raw data
 * and both matter when editing:
 *
 *   - **file-backed vs inline.** A body stored as `$ref://…` lives in the repo, not
 *     the database. Saving it forks the shipped template for one application, so the
 *     editor refuses unless the operator explicitly detaches. The list shows which
 *     is which before anyone opens an editor.
 *   - **scope level.** A template can be bound at application, organization or
 *     business-unit level, and resolution prefers the most specific. Showing "—" in
 *     an empty column would leave an operator guessing which one they are editing.
 */
export interface EmailTemplatesPageProps {
  /** Injected when the host wraps the component with the API. */
  reactory?: any;
}

const ElementBadge: React.FC<{ element?: IEmailTemplateElement | null; label: string }> = ({
  element,
  label,
}) => {
  if (!element) {
    return (
      <Tooltip title={`No ${label.toLowerCase()} element is attached to this template.`}>
        <Chip size="small" variant="outlined" label={`${label}: none`} color="warning" />
      </Tooltip>
    );
  }

  if (element.isFileBacked) {
    return (
      <Tooltip
        title={
          element.refPath
            ? `Read from ${element.refPath}. Editing forks this application's copy.`
            : `${element.source}${element.refError ? ` — ${element.refError}` : ''}`
        }
      >
        <Chip
          size="small"
          variant="outlined"
          color="info"
          icon={<InsertDriveFileIcon />}
          label={`${label}: file`}
        />
      </Tooltip>
    );
  }

  return (
    <Tooltip title={element.isDetached ? 'Detached from its original file' : 'Stored inline'}>
      <Chip
        size="small"
        variant="outlined"
        color={element.isDetached ? 'secondary' : 'default'}
        icon={<EditIcon />}
        label={`${label}: inline${element.isDetached ? ' (detached)' : ''}`}
      />
    </Tooltip>
  );
};

export const EmailTemplatesPage: React.FC<EmailTemplatesPageProps> = ({ reactory: propReactory }) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<IEmailTemplateView | null>(null);

  /**
   * The filter is memoised on the search term so the hook's `filterKey` is stable;
   * passing a fresh object every render would refetch in a loop.
   */
  const filter = useMemo(() => (search.trim() ? { search: search.trim() } : {}), [search]);

  const { templates, loading, error, reload } = useEmailTemplates(reactory, filter);

  const rows = templates;

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Paper sx={{ p: 2 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{
              justifyContent: "space-between",
              alignItems: { xs: 'stretch', sm: 'center' }
            }}>
            <Box>
              <Typography variant="h5" component="h1">
                Email templates
              </Typography>
              <Typography variant="body2" sx={{
                color: "text.secondary"
              }}>
                Transactional templates used by the communicator. Subject and body are separate
                elements; either can be stored inline or read from a file.
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} sx={{
              alignItems: "center"
            }}>
              <TextField
                size="small"
                placeholder="Search templates"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },

                  htmlInput: { 'aria-label': 'Search templates' }
                }} />
              <Tooltip title="Reload">
                <span>
                  <IconButton onClick={reload} disabled={loading} aria-label="Reload templates">
                    {loading ? <CircularProgress size={18} /> : <RefreshIcon />}
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Stack>
        </Paper>

        {error ? (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        ) : null}

        <Paper>
          <TableContainer>
            <Table size="small" aria-label="Email templates">
              <TableHead>
                <TableRow>
                  <TableCell>View</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Elements</TableCell>
                  <TableCell>Scope</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Edit</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography
                        variant="body2"
                        align="center"
                        sx={{
                          color: "text.secondary",
                          py: 3
                        }}>
                        {search.trim()
                          ? `No templates match “${search.trim()}”.`
                          : 'No email templates are configured for this application.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : null}

                {rows.map((view) => (
                  <TableRow key={view.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {view.view}
                      </Typography>
                      {view.seeded ? (
                        <Chip size="small" label="shipped" sx={{ mt: 0.5, height: 18 }} />
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{view.name}</Typography>
                      {view.description ? (
                        <Typography variant="caption" sx={{
                          color: "text.secondary"
                        }}>
                          {view.description}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} useFlexGap sx={{
                        flexWrap: "wrap"
                      }}>
                        <ElementBadge element={view.subject} label="Subject" />
                        <ElementBadge element={view.body} label="Body" />
                        {view.otherElements.map((element) => (
                          <ElementBadge
                            key={element.id}
                            element={element}
                            label={element.role || 'extra'}
                          />
                        ))}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{SCOPE_LEVEL_LABEL[scopeLevelOf(view)]}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={view.enabled ? view.status : 'disabled'}
                        color={view.enabled ? 'success' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit subject and body">
                        <IconButton
                          size="small"
                          aria-label={`Edit ${view.view}`}
                          onClick={() => setEditing(view)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <TemplateEditorDrawer
          open={editing !== null}
          view={editing}
          reactory={reactory}
          purpose={purposeForView(editing?.view)}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />

        {loading && rows.length === 0 ? (
          <Stack direction="row" spacing={1.5} role="status" aria-live="polite" sx={{
            alignItems: "center"
          }}>
            <CircularProgress size={18} />
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>
              Loading email templates…
            </Typography>
          </Stack>
        ) : null}
      </Stack>
    </Container>
  );
};

export default EmailTemplatesPage;
