import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ai, AiError, type AiReportResult, type ChatTurn } from '@/services/ai';

/** `yyyy-MM` for a Date, in local time. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The cached report for a month.
 *
 * `retry: false` because the failures worth surfacing here are terminal for
 * the attempt — no data to analyse, not signed in, the model refused. Retrying
 * those just delays the message.
 */
export function useAiReport(month: string) {
  return useQuery<AiReportResult, AiError>({
    queryKey: ['ai-report', month],
    queryFn: () => ai.getReport(month),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** The "generate new analysis" button: bypasses the cache and replaces it. */
export function useGenerateAiReport(month: string) {
  const qc = useQueryClient();
  return useMutation<AiReportResult, AiError>({
    mutationFn: () => ai.getReport(month, { force: true }),
    onSuccess: (result) => qc.setQueryData(['ai-report', month], result),
  });
}

export interface ChatMessage extends ChatTurn {
  id: string;
}

/**
 * In-memory chat thread. Deliberately not persisted — it resets on reload,
 * and every question still carries the full financial context server-side.
 */
export function useAiChat(month: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AiError | null>(null);

  const send = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || pending) return;

      const history = messages.map(({ role, content }) => ({ role, content }));
      setMessages((prev) => [
        ...prev,
        { id: `q-${Date.now()}`, role: 'user', content: text },
      ]);
      setPending(true);
      setError(null);

      try {
        const answer = await ai.ask(month, text, history);
        setMessages((prev) => [
          ...prev,
          { id: `a-${Date.now()}`, role: 'assistant', content: answer },
        ]);
      } catch (e) {
        setError(e instanceof AiError ? e : new AiError('unknown'));
      } finally {
        setPending(false);
      }
    },
    [messages, month, pending],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, send, reset, pending, error };
}
