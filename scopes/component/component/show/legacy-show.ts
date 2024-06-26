import { getConsumerComponent } from './get-consumer-component';
import { getScopeComponent } from './get-scope-component';
import loader from '@teambit/legacy/dist/cli/loader/loader';

const BEFORE_SHOW_REMOTE = 'showing a component...';

export async function show({
  id,
  json,
  versions,
  remote,
  outdated,
  compare,
  detailed,
  dependents,
  dependencies,
}: {
  id: string;
  json: boolean;
  versions: boolean | null | undefined;
  remote: boolean;
  outdated: boolean;
  compare: boolean;
  detailed: boolean;
  dependents: boolean;
  dependencies: boolean;
}) {
  if (versions) {
    const components = await getComponent(versions);
    return {
      components,
      versions,
    };
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return getComponent().then(({ component, componentModel, dependentsInfo, dependenciesInfo }) => ({
    component,
    componentModel,
    dependentsInfo,
    dependenciesInfo,
    json,
    outdated,
    detailed,
  }));

  function getComponent(allVersions: boolean | null | undefined) {
    const params = {
      id,
      allVersions,
      showRemoteVersions: outdated,
      showDependents: dependents,
      showDependencies: dependencies,
    };
    if (remote) {
      loader.start(BEFORE_SHOW_REMOTE);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return getScopeComponent(params);
    }
    return getConsumerComponent({ ...params, compare });
  }
}
