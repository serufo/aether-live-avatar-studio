import {
  PacificInterfaceCondition,
  PacificSessionMetricRecord,
} from '../../types/pacificR';

export function computeMedian(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return Math.round(sorted[mid]);
}

export function computePercentile(values: number[], percentile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)
  );
  return Math.round(sorted[idx]);
}

export function computeAverage(values: number[]): number {
  if (!values.length) return 0;
  return Number((values.reduce((acc, v) => acc + v, 0) / values.length).toFixed(2));
}

/**
 * Fórmula padrão do System Usability Scale (Brooke, 1996):
 * Itens ímpares (0,2,4,6,8): resposta - 1
 * Itens pares (1,3,5,7,9): 5 - resposta
 * Total multiplicado por 2.5 -> escala 0 a 100.
 */
export function computeSusScore(responses: number[]): number {
  if (responses.length !== 10) return 0;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const val = Math.min(5, Math.max(1, Math.round(responses[i] || 3)));
    sum += i % 2 === 0 ? val - 1 : 5 - val;
  }
  return Number((sum * 2.5).toFixed(1));
}

export interface AggregatePacificMetrics {
  totalSessions: number;
  completedSessions: number;
  withdrawnSessions: number;
  completionRatePct: number;
  medianTtftMs: number;
  p95TtftMs: number;
  avgSpeechMs: number;
  totalTurns: number;
  failureRatePct: number;
  interruptionRatePct: number;
  groundedRatePct: number;
  abstentionRatePct: number;
  avgSusScore: number | null;
  avgComfort: number | null;
  avgUtility: number | null;
  avgCalibratedTrust: number | null;
  avgSocialPresence: number | null;
  totalSafetyEvents: number;
}

export function aggregatePacificSessions(
  sessions: PacificSessionMetricRecord[]
): AggregatePacificMetrics {
  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((s) => s.status === 'completed').length;
  const withdrawnSessions = sessions.filter((s) => s.status === 'withdrawn').length;

  const allTtft = sessions.flatMap((s) => s.ttftMsList || []);
  const allSpeech = sessions.flatMap((s) => s.totalSpeechMsList || []);
  const totalTurns = sessions.reduce((acc, s) => acc + (s.turnCount || 0), 0);
  const totalFailures = sessions.reduce((acc, s) => acc + (s.failureCount || 0), 0);
  const totalInterrupts = sessions.reduce((acc, s) => acc + (s.interruptionCount || 0), 0);
  const totalGrounded = sessions.reduce((acc, s) => acc + (s.ragGroundedTurns || 0), 0);
  const totalAbstentions = sessions.reduce((acc, s) => acc + (s.abstentionTurns || 0), 0);
  const totalSafetyEvents = sessions.reduce(
    (acc, s) =>
      acc +
      (s.safetyTriggers?.crisis || 0) +
      (s.safetyTriggers?.clinicalLimit || 0) +
      (s.safetyTriggers?.promptInjection || 0) +
      (s.safetyTriggers?.piiMasked || 0),
    0
  );

  const questionnaires = sessions
    .map((s) => s.questionnaire)
    .filter((q): q is NonNullable<PacificSessionMetricRecord['questionnaire']> => Boolean(q));

  return {
    totalSessions,
    completedSessions,
    withdrawnSessions,
    completionRatePct:
      totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
    medianTtftMs: computeMedian(allTtft),
    p95TtftMs: computePercentile(allTtft, 95),
    avgSpeechMs: Math.round(computeAverage(allSpeech)),
    totalTurns,
    failureRatePct:
      totalTurns > 0 ? Number(((totalFailures / totalTurns) * 100).toFixed(1)) : 0,
    interruptionRatePct:
      totalTurns > 0 ? Number(((totalInterrupts / totalTurns) * 100).toFixed(1)) : 0,
    groundedRatePct:
      totalTurns > 0 ? Number(((totalGrounded / totalTurns) * 100).toFixed(1)) : 0,
    abstentionRatePct:
      totalTurns > 0 ? Number(((totalAbstentions / totalTurns) * 100).toFixed(1)) : 0,
    avgSusScore:
      questionnaires.length > 0
        ? computeAverage(questionnaires.map((q) => q.susScore))
        : null,
    avgComfort:
      questionnaires.length > 0
        ? computeAverage(questionnaires.map((q) => q.comfort))
        : null,
    avgUtility:
      questionnaires.length > 0
        ? computeAverage(questionnaires.map((q) => q.perceivedUtility))
        : null,
    avgCalibratedTrust:
      questionnaires.length > 0
        ? computeAverage(questionnaires.map((q) => q.calibratedTrust))
        : null,
    avgSocialPresence:
      questionnaires.length > 0
        ? computeAverage(questionnaires.map((q) => q.socialPresence))
        : null,
    totalSafetyEvents,
  };
}

export function groupMetricsByCondition(
  sessions: PacificSessionMetricRecord[]
): Record<PacificInterfaceCondition, AggregatePacificMetrics> {
  return {
    text_only: aggregatePacificSessions(
      sessions.filter((s) => s.interfaceCondition === 'text_only')
    ),
    voice_no_avatar: aggregatePacificSessions(
      sessions.filter((s) => s.interfaceCondition === 'voice_no_avatar')
    ),
    voice_with_avatar: aggregatePacificSessions(
      sessions.filter((s) => s.interfaceCondition === 'voice_with_avatar')
    ),
  };
}

export function exportSessionsToCsv(sessions: PacificSessionMetricRecord[]): string {
  const headers = [
    'session_id',
    'participant_code',
    'created_at',
    'status',
    'is_prototype_sandbox',
    'interface_condition',
    'rag_mode',
    'provider_used',
    'turn_count',
    'median_ttft_ms',
    'p95_ttft_ms',
    'avg_speech_ms',
    'failure_count',
    'interruption_count',
    'rag_grounded_turns',
    'abstention_turns',
    'avg_relevance_score',
    'safety_crisis',
    'safety_clinical_limit',
    'safety_prompt_injection',
    'safety_pii_masked',
    'sus_score',
    'comfort',
    'perceived_utility',
    'usage_intention',
    'calibrated_trust',
    'limits_clarity',
    'social_presence',
    'response_quality',
    'preferred_condition',
  ];

  const rows = sessions.map((s) => [
    s.sessionId,
    s.participantCode,
    s.createdAt,
    s.status,
    s.isPrototypeSandbox ? 'true' : 'false',
    s.interfaceCondition,
    s.ragMode,
    s.providerUsed,
    s.turnCount,
    s.medianTtftMs,
    s.p95TtftMs,
    s.avgSpeechMs,
    s.failureCount,
    s.interruptionCount,
    s.ragGroundedTurns,
    s.abstentionTurns,
    s.avgRelevanceScore,
    s.safetyTriggers.crisis,
    s.safetyTriggers.clinicalLimit,
    s.safetyTriggers.promptInjection,
    s.safetyTriggers.piiMasked,
    s.questionnaire?.susScore ?? '',
    s.questionnaire?.comfort ?? '',
    s.questionnaire?.perceivedUtility ?? '',
    s.questionnaire?.usageIntention ?? '',
    s.questionnaire?.calibratedTrust ?? '',
    s.questionnaire?.limitsClarity ?? '',
    s.questionnaire?.socialPresence ?? '',
    s.questionnaire?.responseQuality ?? '',
    s.questionnaire?.preferredCondition ?? '',
  ]);

  const escapeCell = (val: unknown) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  return [headers.join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\n');
}

export function triggerFileDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
