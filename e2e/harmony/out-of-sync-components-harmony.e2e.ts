import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('components that are not synced between the scope and the consumer', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('consumer with a new component and scope with the same component as exported with defaultScope configured', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      const bitMap = helper.bitMap.read();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      // the mimic and import here is to make sure the local doesn't have the symlink object
      helper.git.mimicGitCloneLocalProjectHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.importAllComponents();
      helper.bitMap.write(bitMap);
      scopeOutOfSync = helper.scopeHelper.cloneWorkspace();
    });
    describe('bit tag', () => {
      it('should tag the component to the next version of what the scope has', () => {
        const output = helper.command.runCmd('bit tag bar/foo --unmodified --patch');
        expect(output).to.have.string('0.0.2');
      });
    });
    describe('bit status', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(scopeOutOfSync);
        helper.command.status();
      });
      it('should sync .bitmap according to the scope', () => {
        helper.command.expectStatusToBeClean();
        helper.bitMap.expectToHaveId('bar/foo', '0.0.1', helper.scopes.remote);
      });
    });
  });
  describe('consumer with a tagged component and scope with no components', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllWithoutBuild();
      helper.fs.deletePath('.bit');
      helper.command.init();
      scopeOutOfSync = helper.scopeHelper.cloneWorkspace();
    });
    describe('bit build', () => {
      it('should build the component successfully', () => {
        expect(() => helper.command.build()).to.not.throw();
      });
    });
    describe('bit status', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedWorkspace(scopeOutOfSync);
        output = helper.command.status();
      });
      it('should show the component as new', () => {
        expect(output).to.have.string('new components');
        const bitMap = helper.bitMap.read();
        const newId = 'bar/foo';
        expect(bitMap).to.have.property(newId);
        const oldId = 'bar/foo@0.0.1';
        expect(bitMap).to.not.have.property(oldId);
      });
    });
    describe('bit show', () => {
      it('should not show the component with the version', () => {
        helper.scopeHelper.getClonedWorkspace(scopeOutOfSync);
        const show = helper.command.showComponent('bar/foo');
        expect(show).to.not.have.string('0.0.1');
      });
    });
  });
  describe('consumer with a tagged exported component and scope with no components', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.tagAllWithoutBuild('--unmodified'); // 0.0.2
      helper.fs.deletePath('.bit');
      helper.command.init();
      helper.scopeHelper.addRemoteScope();
    });
    it('bit import should not throw', () => {
      expect(() => helper.command.import()).to.not.throw();
    });
    it('bit import followed by bit status should sync .bitmap', () => {
      helper.command.import();
      helper.command.status();
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp1.version).to.equal('0.0.1');
    });
  });
  describe('new lane got deleted', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.fs.deletePath('.bit');
      helper.command.init();
      helper.scopeHelper.addRemoteScope();
    });
    it('should recrate the lane', () => {
      expect(() => helper.command.showOneLane('dev')).to.not.throw();
    });
  });
});
