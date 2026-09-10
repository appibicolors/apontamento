export const FINISH_REASONS=[
  ["normal","Finalizar execução"],
  ["pausa","Pausar"],
  ["fim_turno","Fim do turno"],
  ["retrabalho","Retrabalho"],
  ["parada_maquina","Parada de máquina"],
] as const;
export type FinishReason=(typeof FINISH_REASONS)[number][0];
