import { z } from "zod";

export const PerfilSchema = z.enum(["admin", "financeiro", "suporte", "leitura"]);
export type Perfil = z.infer<typeof PerfilSchema>;

export const LoginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(3, "Senha obrigatória")
});

export const NaturezaContaSchema = z.enum(["ativo", "passivo", "receita", "despesa"]);
export type NaturezaConta = z.infer<typeof NaturezaContaSchema>;

export const CreateContaSchema = z.object({
  codigo: z.string().min(1, "Código obrigatório").regex(/^[0-9]+(\.[0-9]+)*$/, "Formato de código inválido (ex: 1.1.03)"),
  nome: z.string().min(2, "Nome da conta obrigatório"),
  natureza: NaturezaContaSchema,
  aceita_lancamento: z.boolean().default(true)
});

export const PartidaInputSchema = z.object({
  conta_id: z.number().int().positive(),
  debito_centavos: z.number().int().nonnegative().default(0),
  credito_centavos: z.number().int().nonnegative().default(0)
}).refine(
  p => (p.debito_centavos > 0) !== (p.credito_centavos > 0),
  { message: "Cada partida deve ter exclusivamente débito ou crédito maior que zero" }
);

export const CreateLancamentoSchema = z.object({
  data: z.string().optional(),
  descricao: z.string().min(2, "Descrição obrigatória"),
  evento_id: z.number().int().positive().nullable().optional(),
  partidas: z.array(PartidaInputSchema).min(2, "Um lançamento exige no mínimo 2 partidas")
}).refine(
  l => {
    const totalDebito = l.partidas.reduce((acc, p) => acc + p.debito_centavos, 0);
    const totalCredito = l.partidas.reduce((acc, p) => acc + p.credito_centavos, 0);
    return totalDebito > 0 && totalDebito === totalCredito;
  },
  { message: "Lançamento desbalanceado: soma dos débitos deve ser igual à soma dos créditos" }
);

export const LancamentoManualSimplesSchema = z.object({
  descricao: z.string().min(2, "Descrição obrigatória"),
  debito_conta_id: z.number().int().positive(),
  credito_conta_id: z.number().int().positive(),
  valor_centavos: z.number().int().positive("O valor em centavos deve ser positivo"),
  evento_id: z.number().int().positive().nullable().optional()
}).refine(
  d => d.debito_conta_id !== d.credito_conta_id,
  { message: "As contas de débito e crédito devem ser diferentes" }
);

export const UpdateRegraTaxaSchema = z.object({
  taxa_bps: z.number().int().min(0).max(10000)
});

export const RegistrarVendaSchema = z.object({
  evento_nome: z.string().min(1).default("Evento exemplo"),
  evento_id: z.number().int().positive().optional(),
  regra_taxa_id: z.number().int().positive(),
  bruto_centavos: z.number().int().positive("Valor bruto deve ser maior que zero"),
  comissao_bps: z.number().int().min(0).max(10000).default(2000),
  taxa_paga_por: z.enum(["disk", "produtor"]).default("disk")
});

export const MovimentacaoCaixaSchema = z.object({
  tipo: z.enum(["receber_gateway", "repassar_produtor"]),
  valor_centavos: z.number().int().positive("Valor deve ser maior que zero"),
  produtor_id: z.number().int().positive().optional(),
  descricao: z.string().optional()
});

export const StatusPlanoSchema = z.enum(["Não iniciado", "Em andamento", "Concluído", "Atrasado"]);

export const CreatePlanoAcaoSchema = z.object({
  plano: z.string().min(2, "Nome do plano de ação obrigatório"),
  prioridade: z.string().optional().default("Muito Urgente"),
  what: z.string().optional().default(""),
  why: z.string().optional().default(""),
  who_id: z.number().int().positive().nullable().optional(),
  area_id: z.number().int().positive().nullable().optional(),
  onde: z.string().optional().default("DISK"),
  inicio: z.string().nullable().optional(),
  prazo_dias: z.number().int().nullable().optional().default(30),
  fim_planejado: z.string().nullable().optional(),
  fim_real: z.string().nullable().optional(),
  how: z.string().nullable().optional(),
  how_much_centavos: z.number().int().nullable().optional().default(0),
  status: StatusPlanoSchema.default("Em andamento")
});

export const CreatePessoaSchema = z.object({
  nome: z.string().min(2),
  area_id: z.number().int().positive().nullable().optional(),
  telefone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  perfil: PerfilSchema.default("leitura"),
  senha: z.string().min(4).optional()
});

export const CreateProdutorSchema = z.object({
  nome: z.string().min(2),
  documento: z.string().min(5),
  banco: z.string().optional(),
  agencia: z.string().optional(),
  conta: z.string().optional(),
  chave_pix: z.string().optional()
});

export const CreateEventoSchema = z.object({
  produtor_id: z.number().int().positive(),
  nome: z.string().min(2),
  data_evento: z.string().nullable().optional(),
  comissao_bps: z.number().int().min(0).max(10000).default(2000)
});
