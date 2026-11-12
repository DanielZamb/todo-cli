export const requiredStages = ['frozenSource', 'compiledBinaries', 'guardMatrix', 'guardRedControls', 'credentialBoundary', 'credentialRedControls', 'inputBoundary', 'instanceLocks', 'parentDeathCleanup', 'builtApp', 'artifactAudit', 'productionPreservation', 'rootCheck', 'productionSuites', 'ownerPreflight', 'visibleLaunch', 'accessibilityReadback', 'visibleInputStop', 'cleanup'];
export function receipt(stages, scope) {
  const result = Object.fromEntries(requiredStages.map(stage => [stage, stages[stage] === true]));
  return { scope, stages: result, completeRecipe: scope === 'visible' && requiredStages.every(stage => result[stage]) };
}
