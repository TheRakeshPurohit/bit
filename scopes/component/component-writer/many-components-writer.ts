import { BitError } from '@teambit/bit-error';
import { BitId } from '@teambit/legacy-bit-id';
import fs from 'fs-extra';
import mapSeries from 'p-map-series';
import * as path from 'path';
import GeneralError from '@teambit/legacy/dist/error/general-error';
import logger from '@teambit/legacy/dist/logger/logger';
import { ComponentWithDependencies } from '@teambit/legacy/dist/scope';
import { isDir, isDirEmptySync } from '@teambit/legacy/dist/utils';
import { composeComponentPath } from '@teambit/legacy/dist/utils/bit/compose-component-path';
import {
  PathLinuxRelative,
  pathNormalizeToLinux,
  PathOsBasedAbsolute,
  PathOsBasedRelative,
} from '@teambit/legacy/dist/utils/path';
import ComponentMap from '@teambit/legacy/dist/consumer/bit-map/component-map';
import Component from '@teambit/legacy/dist/consumer/component/consumer-component';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import Consumer from '@teambit/legacy/dist/consumer/consumer';
import { moveExistingComponent } from '@teambit/legacy/dist/consumer/component-ops/move-components';
import { InstallMain } from '@teambit/install';
import { CompilerMain } from '@teambit/compiler';
import ComponentWriter, { ComponentWriterProps } from './component-writer';

export interface ManyComponentsWriterParams {
  consumer: Consumer;
  componentsWithDependencies: ComponentWithDependencies[];
  writeToPath?: string;
  override?: boolean;
  writeConfig?: boolean;
  installNpmPackages?: boolean;
  verbose?: boolean;
  resetConfig?: boolean;
}

export class ManyComponentsWriter {
  consumer: Consumer;
  componentsWithDependencies: ComponentWithDependencies[];
  writeToPath?: string;
  override: boolean;
  writeConfig: boolean;
  installNpmPackages: boolean;
  verbose: boolean; // prints npm results
  dependenciesIdsCache: Record<string, any>;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  writtenComponents: Component[];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  writtenDependencies: Component[];
  basePath?: string;
  resetConfig?: boolean;

  constructor(private installer: InstallMain, private compiler: CompilerMain, params: ManyComponentsWriterParams) {
    this.consumer = params.consumer;
    this.componentsWithDependencies = params.componentsWithDependencies;
    this.writeToPath = params.writeToPath;
    this.override = this._setBooleanDefault(params.override, true);
    this.writeConfig = this._setBooleanDefault(params.writeConfig, false);
    this.installNpmPackages = this._setBooleanDefault(params.installNpmPackages, true);
    this.verbose = this._setBooleanDefault(params.verbose, false);
    this.dependenciesIdsCache = {};
    this.resetConfig = params.resetConfig;
    this.basePath = this.consumer.getPath();
  }

  _setBooleanDefault(field: boolean | null | undefined, defaultValue: boolean): boolean {
    return typeof field === 'undefined' ? defaultValue : Boolean(field);
  }
  async writeAll() {
    await this.writeComponentsAndDependencies();
    if (this.installNpmPackages) {
      await this.installPackages();
      await this.compile(); // no point to compile if the installation is not running. the environment is not ready.
    }
    logger.debug('ManyComponentsWriter, Done!');
  }
  private async writeComponentsAndDependencies() {
    logger.debug('ManyComponentsWriter, _writeComponentsAndDependencies');
    await this._populateComponentsFilesToWrite();
    this._moveComponentsIfNeeded();
    await this._persistComponentsData();
  }
  private async installPackages() {
    logger.debug('ManyComponentsWriter, _installPackages');
    if (!this.installNpmPackages) {
      return;
    }
    try {
      const installOpts = {
        dedupe: true,
        updateExisting: false,
        import: false,
      };
      await this.installer.install(undefined, installOpts);
    } catch (err: any) {
      logger.error('_installPackagesIfNeeded, package-installer found an error', err);
      throw new BitError(`failed installing the packages, consider running the command with "--skip-dependency-installation" flag.
error from the package-manager: ${err.message}.
please use the '--log=error' flag for the full error.`);
    }
  }
  private async compile() {
    try {
      await this.compiler.compileOnWorkspace();
    } catch (err: any) {
      logger.error('compile, compiler found an error', err);
      throw new BitError(`failed compiling the components. please run "bit compile" once the issue is fixed
error from the compiler: ${err.message}.
please use the '--log=error' flag for the full error.`);
    }
  }
  async _persistComponentsData() {
    const dataToPersist = new DataToPersist();
    this.componentsWithDependencies.forEach((componentWithDeps) => {
      const allComponents = [componentWithDeps.component, ...componentWithDeps.allDependencies];
      allComponents.forEach((component) => dataToPersist.merge(component.dataToPersist));
    });
    const componentsConfig = this.consumer?.config?.componentsConfig;
    if (componentsConfig?.hasChanged) {
      const jsonFiles = await this.consumer?.config.toVinyl(this.consumer.getPath());
      if (jsonFiles) {
        dataToPersist.addManyFiles(jsonFiles);
      }
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    dataToPersist.addBasePath(this.basePath);
    await dataToPersist.persistAllToFS();
  }

  async _populateComponentsFilesToWrite() {
    const writeComponentsParams = this._getWriteComponentsParams();
    const componentWriterInstances = writeComponentsParams.map((writeParams) => new ComponentWriter(writeParams));
    this.fixDirsIfNested(componentWriterInstances);
    // add componentMap entries into .bitmap before starting the process because steps like writing package-json
    // rely on .bitmap to determine whether a dependency exists and what's its origin
    componentWriterInstances.forEach((componentWriter: ComponentWriter) => {
      componentWriter.existingComponentMap =
        componentWriter.existingComponentMap || componentWriter.addComponentToBitMap(componentWriter.writeToPath);
    });
    if (this.resetConfig) {
      componentWriterInstances.forEach((componentWriter: ComponentWriter) => {
        delete componentWriter.existingComponentMap?.config;
      });
    }
    this.writtenComponents = await mapSeries(componentWriterInstances, (componentWriter: ComponentWriter) =>
      componentWriter.populateComponentsFilesToWrite()
    );
  }

  /**
   * e.g. [bar, bar/foo] => [bar_1, bar/foo]
   * otherwise, the bar/foo component will be saved inside "bar" component.
   * in case bar_1 is taken, increment to bar_2 until the name is available.
   */
  private fixDirsIfNested(componentWriterInstances: ComponentWriter[]) {
    const allDirs = componentWriterInstances.map((c) => c.writeToPath);

    // get all components that their root-dir is a parent of other components root-dir.
    const parentsOfOthersComps = componentWriterInstances.filter(({ writeToPath }) =>
      allDirs.find((d) => d.startsWith(`${writeToPath}/`))
    );
    if (!parentsOfOthersComps.length) {
      return;
    }
    const parentsOfOthersCompsDirs = parentsOfOthersComps.map((c) => c.writeToPath);

    const incrementPath = (p: string, number: number) => `${p}_${number}`;
    const existingRootDirs = Object.keys(this.consumer.bitMap.getAllTrackDirs());
    const allPaths: PathLinuxRelative[] = [...existingRootDirs, ...parentsOfOthersCompsDirs];
    const incrementRecursively = (p: string) => {
      let num = 1;
      let newPath = incrementPath(p, num);
      while (allPaths.includes(newPath)) {
        newPath = incrementPath(p, (num += 1));
      }
      return newPath;
    };

    // change the paths of all these parents root-dir to not collide with the children root-dir
    parentsOfOthersComps.forEach((componentWriter) => {
      if (existingRootDirs.includes(componentWriter.writeToPath)) return; // component already exists.
      const newPath = incrementRecursively(componentWriter.writeToPath);
      componentWriter.writeToPath = newPath;
    });
  }

  _getWriteComponentsParams(): ComponentWriterProps[] {
    return this.componentsWithDependencies.map((componentWithDeps: ComponentWithDependencies) =>
      this._getWriteParamsOfOneComponent(componentWithDeps)
    );
  }
  _getWriteParamsOfOneComponent(componentWithDeps: ComponentWithDependencies): ComponentWriterProps {
    // for isolated components, the component files should be on the root. see #1758
    const componentRootDir: PathLinuxRelative = this._getComponentRootDir(componentWithDeps.component.id);
    const getParams = () => {
      if (!this.consumer) {
        return {};
      }
      // AUTHORED and IMPORTED components can't be saved with multiple versions, so we can ignore the version to
      // find the component in bit.map
      const componentMap = this.consumer.bitMap.getComponentIfExist(componentWithDeps.component.id, {
        ignoreVersion: true,
      });
      // $FlowFixMe consumer is set here
      this._throwErrorWhenDirectoryNotEmpty(this.consumer.toAbsolutePath(componentRootDir), componentMap);
      return {
        existingComponentMap: componentMap,
      };
    };
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return {
      ...this._getDefaultWriteParams(),
      component: componentWithDeps.component,
      writeToPath: componentRootDir,
      writeConfig: this.writeConfig,
      ...getParams(),
    };
  }
  _getDefaultWriteParams(): Record<string, any> {
    return {
      consumer: this.consumer,
      bitMap: this.consumer.bitMap,
    };
  }
  _moveComponentsIfNeeded() {
    if (this.writeToPath && this.consumer) {
      this.componentsWithDependencies.forEach((componentWithDeps) => {
        // @ts-ignore componentWithDeps.component.componentMap is set
        const componentMap: ComponentMap = componentWithDeps.component.componentMap;
        if (!componentMap.rootDir) {
          throw new GeneralError(`unable to use "--path" flag.
to move individual files, use bit move.
to move all component files to a different directory, run bit remove and then bit import --path`);
        }
        const relativeWrittenPath = componentWithDeps.component.writtenPath;
        // @ts-ignore relativeWrittenPath is set at this point
        const absoluteWrittenPath = this.consumer.toAbsolutePath(relativeWrittenPath);
        // @ts-ignore this.writeToPath is set at this point
        const absoluteWriteToPath = path.resolve(this.writeToPath); // don't use consumer.toAbsolutePath, it might be an inner dir
        if (relativeWrittenPath && absoluteWrittenPath !== absoluteWriteToPath) {
          const component = componentWithDeps.component;
          // @ts-ignore consumer is set here
          moveExistingComponent(this.consumer, component, absoluteWrittenPath, absoluteWriteToPath);
        }
      });
    }
  }
  _getComponentRootDir(bitId: BitId): PathLinuxRelative {
    if (this.consumer) {
      return this.writeToPath
        ? pathNormalizeToLinux(this.consumer.getPathRelativeToConsumer(path.resolve(this.writeToPath)))
        : this.consumer.composeRelativeComponentPath(bitId);
    }
    return composeComponentPath(bitId);
  }
  _getDependencyRootDir(bitId: BitId): PathOsBasedRelative {
    return this.consumer.composeRelativeDependencyPath(bitId);
  }
  _throwErrorWhenDirectoryNotEmpty(componentDir: PathOsBasedAbsolute, componentMap: ComponentMap | null | undefined) {
    // if not writeToPath specified, it goes to the default directory. When componentMap exists, the
    // component is not new, and it's ok to override the existing directory.
    if (!this.writeToPath && componentMap) return;
    // if writeToPath specified and that directory is already used for that component, it's ok to override
    if (this.writeToPath && componentMap && componentMap.rootDir && componentMap.rootDir === this.writeToPath) return;

    if (fs.pathExistsSync(componentDir)) {
      if (!isDir(componentDir)) {
        throw new GeneralError(`unable to import to ${componentDir} because it's a file`);
      }
      if (!isDirEmptySync(componentDir) && !this.override) {
        throw new GeneralError(
          `unable to import to ${componentDir}, the directory is not empty. use --override flag to delete the directory and then import`
        );
      }
    }
  }
}