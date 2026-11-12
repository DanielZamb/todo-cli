export const requiredStages = ['frozenSource', 'compiledBinaries', 'guardMatrix', 'guardRedControls', 'credentialBoundary', 'credentialRedControls', 'inputBoundary', 'instanceLocks', 'builtApp', 'artifactAudit', 'ownerPreflight', 'visibleLaunch', 'accessibilityReadback', 'visibleInputStop', 'cleanup'];
export function receipt(stages, scope) {
  const result = Object.fromEntries(requiredStages.map(stage => [stage, stages[stage] === true]));
  return { scope, stages: result, completeRecipe: scope === 'visible' && requiredStages.every(stage => result[stage]) };
}
