import chalk from 'chalk';
import ConsumerComponent from '../../consumer/component/consumer-component';

export const MISSING_PACKAGES_FROM_OVERRIDES_LABEL = 'manually configured';

export function getInvalidComponentLabel(error: Error) {
  switch (error.name) {
    case 'MainFileRemoved':
      return 'main-file was removed (use "bit add" with "--main" and "--id" flags to add a main file)';
    case 'ComponentNotFoundInPath':
      return 'component files were deleted (use "bit remove [component_id]") or moved (use "bit move <old-dir> <new-dir>"). to restore use "bit checkout reset [component_id]"';
    case 'ExtensionFileNotFound':
      // @ts-ignore error.path is set for ExtensionFileNotFound
      return `extension file is missing at ${chalk.bold(error.path)}`;
    case 'ComponentsPendingImport':
      return 'component objects are missing from the scope (use "bit import [component_id] --objects" to get them back)';
    case 'NoComponentDir':
      return `component files were added individually without root directory (invalid on Harmony. re-add as a directory or use "bit move --component" to help with the move)`;
    case 'IgnoredDirectory':
      return `component files or directory were ignored (probably by .gitignore)`;
    case 'NoCommonSnap':
      return `component history is unrelated to main (merge main with --resolve-unrelated flag)`;
    default:
      return error.name;
  }
}

export function componentIssueToString(value: string[] | string) {
  return Array.isArray(value) ? value.join(', ') : value;
}

export function formatIssues(compWithIssues: ConsumerComponent) {
  return `       ${compWithIssues.issues?.outputForCLI()}\n`;
}
