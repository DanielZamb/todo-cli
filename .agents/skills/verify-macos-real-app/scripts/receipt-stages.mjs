export const requiredStages = ['frozenSource', 'compiledBinaries', 'guardMatrix', 'guardRedControls', 'credentialBoundary', 'credentialRedControls', 'inputBoundary', 'instanceLocks', 'parentDeathCleanup', 'builtApp', 'artifactAudit', 'productionPreservation', 'rootCheck', 'productionSuites', 'ownerPreflight', 'visibleLaunch', 'accessibilityReadback', 'visibleInputStop', 'cleanup'];
export const visibleStages = ['ownerPreflight', 'visibleLaunch', 'accessibilityReadback', 'visibleInputStop'];
export function receipt(stages, scope, successful = false) {
  const result = Object.fromEntries(requiredStages.map(stage => [stage, stages[stage] === true]));
  const needed = scope === 'visible' ? requiredStages : scope === 'headless' ? requiredStages.filter(stage => !visibleStages.includes(stage)) : [];
  return { scope, stages: result, requiredStages: needed, owedStages: requiredStages.filter(stage => !result[stage]), completeRecipe: successful && needed.length > 0 && needed.every(stage => result[stage]), completeVisibleRecipe: successful && scope === 'visible' && requiredStages.every(stage => result[stage]) };
}
