import path from 'path';
import chai, { expect } from 'chai';
import { readModulesManifest } from '@pnpm/modules-yaml';

import { Helper, NpmCiRegistry, supportNpmCiRegistryTesting } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

(supportNpmCiRegistryTesting ? describe : describe.skip)(
  'package manager rc file is read from the workspace directory when installation is in a capsule',
  function () {
    this.timeout(0);
    let helper: Helper;
    let envId1;
    let envName1;
    let npmCiRegistry: NpmCiRegistry;
    before(async () => {
      helper = new Helper({ scopesOptions: { remoteScopeWithDot: true } });
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.setPackageManager();
      npmCiRegistry = new NpmCiRegistry(helper);
      await npmCiRegistry.init();
      npmCiRegistry.configureCiInPackageJsonHarmony();
      envName1 = helper.env.setCustomEnv('node-env-1');
      envId1 = `${helper.scopes.remote}/${envName1}`;
      helper.command.install('lodash.get lodash.flatten');
      helper.command.compile();
      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.workspaceJsonc.setupDefault();
    });
    describe('using Yarn', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace({
          yarnRCConfig: {
            packageExtensions: {
              'lodash.get@*': {
                dependencies: {
                  'is-positive': '1.0.0',
                },
              },
            },
          },
        });
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/yarn`);
        helper.scopeHelper.addRemoteScope();
        helper.workspaceJsonc.setupDefault();
        helper.workspaceJsonc.addKeyValToWorkspace('resolveAspectsFromNodeModules', false);
        helper.workspaceJsonc.addKeyValToWorkspace('resolveEnvsFromRoots', false);
        helper.fixtures.populateComponents(1);
        helper.extensions.addExtensionToVariant('comp1', `${envId1}@0.0.1`);
        helper.capsules.removeScopeAspectCapsules();
        helper.command.status(); // populate capsules.
      });
      it('packageExtensions is taken into account when running install in the capsule', () => {
        const { scopeAspectsCapsulesRootDir } = helper.command.capsuleListParsed();
        const isPositivePath = path.join(
          scopeAspectsCapsulesRootDir,
          `${helper.scopes.remote}_node-env-1@0.0.1/node_modules/is-positive`
        );
        expect(isPositivePath).to.be.a.path();
      });
    });
    describe('using pnpm', () => {
      before(() => {
        helper.scopeHelper.reInitWorkspace({
          npmrcConfig: {
            'hoist-pattern[]': 'foo',
          },
        });
        helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('packageManager', `teambit.dependencies/pnpm`);
        helper.scopeHelper.addRemoteScope();
        helper.workspaceJsonc.setupDefault();
        helper.fixtures.populateComponents(1);
        helper.extensions.addExtensionToVariant('comp1', `${envId1}@0.0.1`);
        helper.capsules.removeScopeAspectCapsules();
        helper.command.status(); // populate capsules.
      });
      it('workspace .npmrc is taken into account when running install in the capsule', async () => {
        const { scopeAspectsCapsulesRootDir } = helper.command.capsuleListParsed();
        const modulesState = await readModulesManifest(
          path.join(scopeAspectsCapsulesRootDir, `${helper.scopes.remote}_node-env-1@0.0.1/node_modules`)
        );
        expect(modulesState?.hoistPattern?.[0]).to.eq('foo');
      });
    });
    after(() => {
      npmCiRegistry.destroy();
    });
  }
);
