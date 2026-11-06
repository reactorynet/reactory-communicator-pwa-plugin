/**
 * Registration path for `communicator.EmailTemplates@1.0.0`.
 *
 * A component that is authored but never reaches the client registry renders as
 * NotFound, and the failure is silent — hence these assertions walking the chain
 * the runtime actually uses:
 *
 *   email-templates/index.ts → plugins/reactory-communicator/index.ts → registry
 *
 * The generated `plugins/__index.ts` is NOT imported here: it is gitignored (written
 * at build/startup), so a test depending on it cannot run in a clean checkout of
 * this plugin's own repository. The plugin contract is `default` or `components`
 * exporting an array — the generator accepts either — and that is what is asserted.
 */
import { components as pluginComponents, default as pluginDefault } from '../index';
import { components as emailTemplateComponents } from '../email-templates';
import EmailTemplatesPage from '../email-templates/EmailTemplatesPage';

const FQN = 'communicator.EmailTemplates@1.0.0';

const findEntry = (list: any[], fqn: string) =>
  list.find((entry) => `${entry?.nameSpace}.${entry?.name}@${entry?.version}` === fqn);

describe('communicator.EmailTemplates registration', () => {
  it('is declared by the email-templates module', () => {
    const entry = findEntry(emailTemplateComponents, FQN);

    expect(entry).toBeDefined();
    expect(entry.description).toMatch(/template/i);
  });

  it('is spread into the plugin component list', () => {
    expect(findEntry(pluginComponents, FQN)).toBeDefined();
  });

  it('is also reachable through the default export, which the generator prefers', () => {
    // `pluginImportFactory` spreads `default` when it is an array, else `components`.
    expect(Array.isArray(pluginDefault)).toBe(true);
    expect(findEntry(pluginDefault as any[], FQN)).toBeDefined();
  });

  it('uses the communicator namespace, not core', () => {
    // A `core.*` name would collide with reactory-core's namespace and could be
    // silently shadowed by registration order.
    const entry = findEntry(pluginComponents, FQN) as any;

    expect(entry.nameSpace).toBe('communicator');
  });

  it('points at the real component, not a placeholder', () => {
    const entry = findEntry(pluginComponents, FQN) as any;

    expect(entry.component).toBe(EmailTemplatesPage);
    expect(entry.component).not.toBeInstanceOf(Error);
    expect(String(entry.description)).not.toMatch(/work in progress|placeholder/i);
  });

  it('exposes a plain function component, not a memo/forwardRef wrapper', () => {
    // react-is 18 with react 17 breaks isMemo/isForwardRef, so registry components
    // must be plain functions.
    const entry = findEntry(pluginComponents, FQN) as any;

    expect(typeof entry.component).toBe('function');
    expect(entry.component.$$typeof).toBeUndefined();
  });

  it('gates on the server roles it needs', () => {
    const entry = findEntry(pluginComponents, FQN) as any;

    expect(entry.roles).toEqual(
      expect.arrayContaining(['COMMUNICATOR_TEMPLATE_VIEW', 'COMMUNICATOR_TEMPLATE_ADMIN']),
    );
    // A plain USER must not be offered a screen the server will refuse.
    expect(entry.roles).not.toContain('USER');
  });

  it('registers exactly once', () => {
    const matches = pluginComponents.filter(
      (entry: any) => `${entry?.nameSpace}.${entry?.name}@${entry?.version}` === FQN,
    );

    expect(matches).toHaveLength(1);
  });
});
