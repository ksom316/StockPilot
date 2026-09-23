import type { AdvisorEvidence, OpportunityContext, OpportunitySignal } from "./contract.ts"

export function buildOpportunityEvidence(context: OpportunityContext): Map<string, AdvisorEvidence> {
  const registry = new Map<string, AdvisorEvidence>()
  for (const signal of context.signals) {
    registry.set(`${signal.signalId}.summary`, { id: `${signal.signalId}.summary`, signalId: signal.signalId, label: "Deterministic signal summary", value: signal.summary })
    for (const [key, value] of Object.entries(signal.evidence)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        const id = `${signal.signalId}.evidence.${key}`
        registry.set(id, { id, signalId: signal.signalId, label: key, value: String(value) })
      }
    }
  }
  return registry
}

export function boundedAdvisorContext(context: OpportunityContext, selectedSignalId?: string): OpportunityContext {
  const signals = selectedSignalId ? context.signals.filter((signal) => signal.signalId === selectedSignalId) : context.signals
  return { ...context, signals: signals.slice(0, 20).map((signal) => ({ ...signal, product: { id: signal.product.id, name: signal.product.name, sku: signal.product.sku }, evidence: signal.evidence })) }
}

export function hydrateOpportunityEvidence(refs: string[], signalId: string, registry: Map<string, AdvisorEvidence>): AdvisorEvidence[] {
  const result: AdvisorEvidence[] = []
  const seen = new Set<string>()
  for (const ref of refs) {
    if (seen.has(ref)) continue
    seen.add(ref)
    const evidence = registry.get(ref)
    if (!evidence || evidence.signalId !== signalId) throw new Error("UNKNOWN_EVIDENCE")
    result.push(evidence)
  }
  return result
}

export function signalById(context: OpportunityContext, id: string): OpportunitySignal | undefined {
  return context.signals.find((signal) => signal.signalId === id)
}
